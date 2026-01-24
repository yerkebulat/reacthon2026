import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { parseTechJournal } from "../src/lib/parsers/tech-journal";
import { parseWater } from "../src/lib/parsers/water";
import { parseDowntime } from "../src/lib/parsers/downtime";
import { detectHazardsFromText } from "../src/lib/hazard-detection";

const prisma = new PrismaClient();

async function createManyInChunks<T>(
  items: T[],
  chunkSize: number,
  createMany: (data: T[]) => Promise<unknown>
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await createMany(items.slice(i, i + chunkSize));
  }
}

async function main() {
  console.log("Starting seed process...\n");

  // Clear existing data
  console.log("Clearing existing data...");
  await prisma.hazard.deleteMany();
  await prisma.techProductivity.deleteMany();
  await prisma.techDowntime.deleteMany();
  await prisma.techJournalShift.deleteMany();
  await prisma.waterDaily.deleteMany();
  await prisma.downtimeDaily.deleteMany();
  await prisma.upload.deleteMany();
  console.log("Existing data cleared.\n");

  const caseDataDir = path.join(process.cwd(), "case_data");

  // Seed Technical Journal
  console.log("=== Processing Technical Journal ===");
  const techJournalPath = path.join(caseDataDir, "technical_journal.xlsx");
  if (fs.existsSync(techJournalPath)) {
    const buffer = fs.readFileSync(techJournalPath);
    const result = parseTechJournal(buffer);
    const millProductivityByShift = new Map<string, number | null>();

    for (const record of result.millProductivityTph.data) {
      millProductivityByShift.set(
        `${record.date}|${record.shiftNumber}`,
        record.valueTph
      );
    }

    const upload = await prisma.upload.create({
      data: {
        type: "tech_journal",
        filename: "technical_journal.xlsx",
        status: "completed",
        rowsParsed:
          result.productivity.rowsParsed +
          result.millProductivityTph.rowsParsed +
          result.downtime.rowsParsed,
        warningsCount:
          result.productivity.warnings.length +
          result.millProductivityTph.warnings.length +
          result.downtime.warnings.length,
      },
    });

    // Upsert shifts once and cache ids
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

    const shiftMap = new Map<string, string>();
    for (const shiftKey of Array.from(shiftKeys)) {
      const [date, shiftNumberStr] = shiftKey.split("|");
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
      shiftMap.set(shiftKey, shift.id);
    }

    // Store productivity data in batches
    const productivityRows = result.productivity.data.map((record) => ({
      techShiftId: shiftMap.get(`${record.date}|${record.shiftNumber}`)!,
      hour: record.hour,
      millLine: record.millLine,
      valuePct: record.valuePct,
    }));

    await createManyInChunks(productivityRows, 1000, (data) =>
      prisma.techProductivity.createMany({ data })
    );
    const productivityCount = productivityRows.length;

    // Store downtime data and detect hazards
    let downtimeCount = 0;
    let hazardCount = 0;

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
          techShiftId: shiftMap.get(`${record.date}|${record.shiftNumber}`)!,
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
    downtimeCount += downtimeNoHazards.length;

    for (const { record, hazards } of downtimeWithHazards) {
      const downtime = await prisma.techDowntime.create({
        data: {
          techShiftId: shiftMap.get(`${record.date}|${record.shiftNumber}`)!,
          equipment: record.equipment,
          timeFrom: record.timeFrom,
          timeTo: record.timeTo,
          minutes: record.minutes,
          reasonText: record.reasonText,
        },
      });
      downtimeCount++;

      await prisma.hazard.createMany({
        data: hazards.map((hazard) => ({
          date: new Date(record.date),
          sourceType: "tech_journal",
          sourceRefId: downtime.id,
          description: hazard.description,
          severity: hazard.severity,
          tags: hazard.matchedKeyword,
        })),
      });
      hazardCount += hazards.length;
    }

    console.log(`  Productivity records: ${productivityCount}`);
    console.log(`  Downtime records: ${downtimeCount}`);
    console.log(`  Hazards detected: ${hazardCount}`);
    console.log(`  Warnings: ${result.productivity.warnings.length + result.downtime.warnings.length}\n`);
  } else {
    console.log("  File not found: technical_journal.xlsx\n");
  }

  // Seed Water Consumption
  console.log("=== Processing Water Consumption ===");
  const waterPath = path.join(caseDataDir, "water_consumption.xlsx");
  if (fs.existsSync(waterPath)) {
    const buffer = fs.readFileSync(waterPath);
    const result = parseWater(buffer);

    const upload = await prisma.upload.create({
      data: {
        type: "water",
        filename: "water_consumption.xlsx",
        status: "completed",
        rowsParsed: result.rowsParsed,
        warningsCount: result.warnings.length,
      },
    });

    const waterRows = result.data.map((record) => ({
      date: new Date(record.date),
      meterReading: record.meterReading,
      actualDaily: record.actualDaily,
      actualHourly: record.actualHourly,
      nominalDaily: record.nominalDaily,
      monthLabel: record.monthLabel,
      sourceUploadId: upload.id,
    }));

    await createManyInChunks(waterRows, 500, (data) =>
      prisma.waterDaily.createMany({ data })
    );
    const waterCount = waterRows.length;

    console.log(`  Water records: ${waterCount}`);
    console.log(`  Warnings: ${result.warnings.length}\n`);
  } else {
    console.log("  File not found: water_consumption.xlsx\n");
  }

  // Seed Downtime History
  console.log("=== Processing Downtime History ===");
  const downtimePath = path.join(caseDataDir, "downtime.xlsx");
  if (fs.existsSync(downtimePath)) {
    const buffer = fs.readFileSync(downtimePath);
    const result = parseDowntime(buffer);

    const upload = await prisma.upload.create({
      data: {
        type: "downtime",
        filename: "downtime.xlsx",
        status: "completed",
        rowsParsed: result.rowsParsed,
        warningsCount: result.warnings.length,
      },
    });

    let downtimeCount = 0;
    let hazardCount = 0;
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
    downtimeCount += downtimeNoHazards.length;

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
      downtimeCount++;

      await prisma.hazard.createMany({
        data: hazards.map((hazard) => ({
          date: new Date(record.date),
          sourceType: "downtime",
          sourceRefId: downtime.id,
          description: hazard.description,
          severity: hazard.severity,
          tags: hazard.matchedKeyword,
        })),
      });
      hazardCount += hazards.length;
    }

    console.log(`  Downtime records: ${downtimeCount}`);
    console.log(`  Hazards detected: ${hazardCount}`);
    console.log(`  Warnings: ${result.warnings.length}\n`);
  } else {
    console.log("  File not found: downtime.xlsx\n");
  }

  // Summary
  console.log("=== Seed Complete ===");
  const counts = await Promise.all([
    prisma.techJournalShift.count(),
    prisma.techProductivity.count(),
    prisma.techDowntime.count(),
    prisma.waterDaily.count(),
    prisma.downtimeDaily.count(),
    prisma.hazard.count(),
  ]);

  console.log(`Total records in database:`);
  console.log(`  Tech Journal Shifts: ${counts[0]}`);
  console.log(`  Tech Productivity: ${counts[1]}`);
  console.log(`  Tech Downtime: ${counts[2]}`);
  console.log(`  Water Daily: ${counts[3]}`);
  console.log(`  Downtime Daily: ${counts[4]}`);
  console.log(`  Hazards: ${counts[5]}`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
