import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import prisma from '@/lib/db';
import { parseTechJournal } from '@/lib/parsers/tech-journal';
import { parseWater } from '@/lib/parsers/water';
import { parseDowntime } from '@/lib/parsers/downtime';
import { detectHazardsFromText } from '@/lib/hazard-detection';

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

    // Save file to uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, `${upload.id}-${file.name}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    let rowsParsed = 0;
    let warningsCount = 0;
    let errorMessage: string | null = null;

    try {
      if (fileType === 'tech_journal') {
        const result = parseTechJournal(buffer);

        // Store productivity data
        for (const record of result.productivity.data) {
          const shift = await prisma.techJournalShift.upsert({
            where: {
              date_shiftNumber: {
                date: new Date(record.date),
                shiftNumber: record.shiftNumber,
              },
            },
            update: { sourceUploadId: upload.id },
            create: {
              date: new Date(record.date),
              shiftNumber: record.shiftNumber,
              sourceUploadId: upload.id,
            },
          });

          await prisma.techProductivity.create({
            data: {
              techShiftId: shift.id,
              hour: record.hour,
              millLine: record.millLine,
              valuePct: record.valuePct,
            },
          });
        }

        // Store downtime data and detect hazards
        for (const record of result.downtime.data) {
          const shift = await prisma.techJournalShift.upsert({
            where: {
              date_shiftNumber: {
                date: new Date(record.date),
                shiftNumber: record.shiftNumber,
              },
            },
            update: { sourceUploadId: upload.id },
            create: {
              date: new Date(record.date),
              shiftNumber: record.shiftNumber,
              sourceUploadId: upload.id,
            },
          });

          const downtime = await prisma.techDowntime.create({
            data: {
              techShiftId: shift.id,
              equipment: record.equipment,
              timeFrom: record.timeFrom,
              timeTo: record.timeTo,
              minutes: record.minutes,
              reasonText: record.reasonText,
            },
          });

          // Detect hazards from reason text
          if (record.reasonText) {
            const hazards = detectHazardsFromText(record.reasonText);
            for (const hazard of hazards) {
              await prisma.hazard.create({
                data: {
                  date: new Date(record.date),
                  sourceType: 'tech_journal',
                  sourceRefId: downtime.id,
                  description: hazard.description,
                  severity: hazard.severity,
                  tags: hazard.matchedKeyword,
                },
              });
            }
          }
        }

        rowsParsed = result.productivity.rowsParsed + result.downtime.rowsParsed;
        warningsCount =
          result.productivity.warnings.length + result.downtime.warnings.length;
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

        for (const record of result.data) {
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

          // Detect hazards from reason text
          if (record.reasonText) {
            const hazards = detectHazardsFromText(record.reasonText);
            for (const hazard of hazards) {
              await prisma.hazard.create({
                data: {
                  date: new Date(record.date),
                  sourceType: 'downtime',
                  sourceRefId: downtime.id,
                  description: hazard.description,
                  severity: hazard.severity,
                  tags: hazard.matchedKeyword,
                },
              });
            }
          }
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

    return NextResponse.json(uploads);
  } catch (error) {
    console.error('Get uploads error:', error);
    return NextResponse.json(
      { error: 'Failed to get uploads' },
      { status: 500 }
    );
  }
}
