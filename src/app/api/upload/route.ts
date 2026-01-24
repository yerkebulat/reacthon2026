import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import prisma from '@/lib/db';
import { parseTechJournal } from '@/lib/parsers/tech-journal';
import { parseWater } from '@/lib/parsers/water';
import { parseDowntime } from '@/lib/parsers/downtime';
import { detectHazardsFromText } from '@/lib/hazard-detection';

async function createManyInChunks<T>(
  items: T[],
  chunkSize: number,
  createMany: (data: T[]) => Promise<unknown>
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await createMany(items.slice(i, i + chunkSize));
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('type') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!['tech_journal', 'water', 'downtime'].includes(fileType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Create upload record
    const upload = await prisma.upload.create({
      data: {
        type: fileType,
        filename: file.name,
        status: 'processing',
      },
    });

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Save file to Vercel Blob (optional - skip if token not configured)
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`uploads/${upload.id}-${file.name}`, buffer, {
          access: 'public',
        });
        await prisma.upload.update({
          where: { id: upload.id },
          data: { fileUrl: blob.url },
        });
      }
    } catch (blobError) {
      console.warn('Blob upload failed, continuing without file storage:', blobError);
    }

    let rowsParsed = 0;
    let warningsCount = 0;
    let errorMessage: string | null = null;

    try {
      if (fileType === 'tech_journal') {
        const result = parseTechJournal(buffer);
        const millProductivityByShift = new Map<string, number | null>();

        for (const record of result.millProductivityTph.data) {
          millProductivityByShift.set(
            `${record.date}|${record.shiftNumber}`,
            record.valueTph
          );
        }

        const shiftKeys = new Set<string>();
        for (const record of result.productivity.data) {
          shiftKeys.add(`${record.date}|${record.shiftNumber}`);
        }
        for (const record of result.downtime.data) {
          shiftKeys.add(`${record.date}|${record.shiftNumber}`);
        }
        for (const record of result.millProductivityTph.data) {
          shiftKeys.add(`${record.date}|${record.shiftNumber}`);
        }

        // Collect unique dates from the uploaded data
        const uniqueDates = new Set<string>();
        for (const record of result.productivity.data) {
          uniqueDates.add(new Date(record.date).toISOString().split('T')[0]);
        }
        for (const record of result.downtime.data) {
          uniqueDates.add(new Date(record.date).toISOString().split('T')[0]);
        }

        // Delete old records for overlapping dates
        for (const dateStr of Array.from(uniqueDates)) {
          const startOfDay = new Date(dateStr);
          const endOfDay = new Date(dateStr);
          endOfDay.setDate(endOfDay.getDate() + 1);

          // Find shifts for this date
          const shifts = await prisma.techJournalShift.findMany({
            where: {
              date: {
                gte: startOfDay,
                lt: endOfDay,
              },
            },
            select: { id: true },
          });

          const shiftIds = shifts.map((s) => s.id);

          if (shiftIds.length > 0) {
            // Delete related hazards first
            await prisma.hazard.deleteMany({
              where: {
                sourceType: 'tech_journal',
                date: {
                  gte: startOfDay,
                  lt: endOfDay,
                },
              },
            });

            // Delete old productivity and downtime records
            await prisma.techProductivity.deleteMany({
              where: { techShiftId: { in: shiftIds } },
            });
            await prisma.techDowntime.deleteMany({
              where: { techShiftId: { in: shiftIds } },
            });
          }
        }

        // Upsert shifts once and cache ids
        const shiftIdByKey = new Map<string, string>();
        for (const shiftKey of Array.from(shiftKeys)) {
          const [date, shiftNumberStr] = shiftKey.split('|');
          const shiftNumber = parseInt(shiftNumberStr, 10);
          const millProductivityTph = millProductivityByShift.get(shiftKey);
          const shift = await prisma.techJournalShift.upsert({
            where: {
              date_shiftNumber: {
                date: new Date(date),
                shiftNumber,
              },
            },
            update: {
              sourceUploadId: upload.id,
              ...(millProductivityTph !== undefined && { millProductivityTph }),
            },
            create: {
              date: new Date(date),
              shiftNumber,
              sourceUploadId: upload.id,
              ...(millProductivityTph !== undefined && { millProductivityTph }),
            },
          });
          shiftIdByKey.set(shiftKey, shift.id);
        }

        // Store productivity data in batches
        const productivityRows = result.productivity.data.map((record) => ({
          techShiftId: shiftIdByKey.get(`${record.date}|${record.shiftNumber}`)!,
          hour: record.hour,
          millLine: record.millLine,
          valuePct: record.valuePct,
        }));

        await createManyInChunks(productivityRows, 1000, (data) =>
          prisma.techProductivity.createMany({ data })
        );

        // Store downtime data and detect hazards
        const downtimeWithHazards: Array<{
          record: typeof result.downtime.data[number];
          hazards: ReturnType<typeof detectHazardsFromText>;
        }> = [];
        const downtimeNoHazards = [];

        for (const record of result.downtime.data) {
          const hazards = record.reasonText ? detectHazardsFromText(record.reasonText) : [];
          if (hazards.length > 0) {
            downtimeWithHazards.push({ record, hazards });
          } else {
            downtimeNoHazards.push({
              techShiftId: shiftIdByKey.get(`${record.date}|${record.shiftNumber}`)!,
              equipment: record.equipment,
              timeFrom: record.timeFrom,
              timeTo: record.timeTo,
              minutes: record.minutes,
              reasonText: record.reasonText,
            });
          }
        }

        await createManyInChunks(downtimeNoHazards, 500, (data) =>
          prisma.techDowntime.createMany({ data })
        );

        for (const { record, hazards } of downtimeWithHazards) {
          const downtime = await prisma.techDowntime.create({
            data: {
              techShiftId: shiftIdByKey.get(`${record.date}|${record.shiftNumber}`)!,
              equipment: record.equipment,
              timeFrom: record.timeFrom,
              timeTo: record.timeTo,
              minutes: record.minutes,
              reasonText: record.reasonText,
            },
          });

          await prisma.hazard.createMany({
            data: hazards.map((hazard) => ({
              date: new Date(record.date),
              sourceType: 'tech_journal',
              sourceRefId: downtime.id,
              description: hazard.description,
              severity: hazard.severity,
              tags: hazard.matchedKeyword,
            })),
          });
        }

        rowsParsed =
          result.productivity.rowsParsed +
          result.millProductivityTph.rowsParsed +
          result.downtime.rowsParsed;
        warningsCount =
          result.productivity.warnings.length +
          result.millProductivityTph.warnings.length +
          result.downtime.warnings.length;
      } else if (fileType === 'water') {
        const result = parseWater(buffer);

        for (const record of result.data) {
          await prisma.waterDaily.upsert({
            where: { date: new Date(record.date) },
            update: {
              meterReading: record.meterReading,
              actualDaily: record.actualDaily,
              actualHourly: record.actualHourly,
              nominalDaily: record.nominalDaily,
              monthLabel: record.monthLabel,
              sourceUploadId: upload.id,
            },
            create: {
              date: new Date(record.date),
              meterReading: record.meterReading,
              actualDaily: record.actualDaily,
              actualHourly: record.actualHourly,
              nominalDaily: record.nominalDaily,
              monthLabel: record.monthLabel,
              sourceUploadId: upload.id,
            },
          });
        }

        rowsParsed = result.rowsParsed;
        warningsCount = result.warnings.length;
      } else if (fileType === 'downtime') {
        const result = parseDowntime(buffer);

        // Collect unique dates from the uploaded data
        const uniqueDates = new Set<string>();
        for (const record of result.data) {
          uniqueDates.add(new Date(record.date).toISOString().split('T')[0]);
        }

        if (uniqueDates.size > 0) {
          const dateRanges = Array.from(uniqueDates).map((dateStr) => {
            const startOfDay = new Date(dateStr);
            const endOfDay = new Date(dateStr);
            endOfDay.setDate(endOfDay.getDate() + 1);
            return {
              date: {
                gte: startOfDay,
                lt: endOfDay,
              },
            };
          });

          // Delete related hazards first
          await prisma.hazard.deleteMany({
            where: {
              sourceType: 'downtime',
              OR: dateRanges,
            },
          });

          // Delete old downtime records
          await prisma.downtimeDaily.deleteMany({
            where: {
              OR: dateRanges,
            },
          });
        }

        const downtimeWithHazards: Array<{
          record: typeof result.data[number];
          hazards: ReturnType<typeof detectHazardsFromText>;
        }> = [];
        const downtimeNoHazards = [];

        for (const record of result.data) {
          const hazards = record.reasonText ? detectHazardsFromText(record.reasonText) : [];
          if (hazards.length > 0) {
            downtimeWithHazards.push({ record, hazards });
          } else {
            downtimeNoHazards.push({
              date: new Date(record.date),
              equipment: record.equipment,
              reasonText: record.reasonText,
              minutes: record.minutes,
              classification: record.classification,
              sourceUploadId: upload.id,
            });
          }
        }

        await createManyInChunks(downtimeNoHazards, 500, (data) =>
          prisma.downtimeDaily.createMany({ data })
        );

        for (const { record, hazards } of downtimeWithHazards) {
          const downtime = await prisma.downtimeDaily.create({
            data: {
              date: new Date(record.date),
              equipment: record.equipment,
              reasonText: record.reasonText,
              minutes: record.minutes,
              classification: record.classification,
              sourceUploadId: upload.id,
            },
          });

          await prisma.hazard.createMany({
            data: hazards.map((hazard) => ({
              date: new Date(record.date),
              sourceType: 'downtime',
              sourceRefId: downtime.id,
              description: hazard.description,
              severity: hazard.severity,
              tags: hazard.matchedKeyword,
            })),
          });
        }

        rowsParsed = result.rowsParsed;
        warningsCount = result.warnings.length;
      }

      // Update upload status
      await prisma.upload.update({
        where: { id: upload.id },
        data: {
          status: 'completed',
          rowsParsed,
          warningsCount,
        },
      });

      return NextResponse.json({
        success: true,
        uploadId: upload.id,
        rowsParsed,
        warningsCount,
      });
    } catch (parseError) {
      errorMessage =
        parseError instanceof Error ? parseError.message : 'Parse error';

      await prisma.upload.update({
        where: { id: upload.id },
        data: {
          status: 'failed',
          errorMessage,
        },
      });

      return NextResponse.json(
        { error: 'Failed to parse file', details: errorMessage },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const uploads = await prisma.upload.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 20,
    });

    // Get last successful upload for each type
    const lastUploads = await Promise.all(
      ['tech_journal', 'water', 'downtime'].map(async (type) => {
        const last = await prisma.upload.findFirst({
          where: { type, status: 'completed' },
          orderBy: { uploadedAt: 'desc' },
        });
        return { type, lastUpload: last };
      })
    );

    const lastUploadByType = lastUploads.reduce(
      (acc, { type, lastUpload }) => ({ ...acc, [type]: lastUpload }),
      {} as Record<string, typeof lastUploads[0]['lastUpload']>
    );

    return NextResponse.json({ uploads, lastUploadByType });
  } catch (error) {
    console.error('Get uploads error:', error);
    return NextResponse.json(
      { error: 'Failed to get uploads' },
      { status: 500 }
    );
  }
}
