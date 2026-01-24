import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { parseTechJournal } from "../src/lib/parsers/tech-journal";
import { parseWater } from "../src/lib/parsers/water";
import { parseDowntime } from "../src/lib/parsers/downtime";
import { detectHazardsFromText } from "../src/lib/hazard-detection";

const prisma = new PrismaClient();

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
        `${record.date}-${record.shiftNumber}`,
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

    // Store productivity data
    let productivityCount = 0;
    const shiftMap = new Map<string, string>();

    for (const record of result.productivity.data) {
      const shiftKey = `${record.date}-${record.shiftNumber}`;
      let shiftId = shiftMap.get(shiftKey);
      const millProductivityTph = millProductivityByShift.get(shiftKey);

      if (!shiftId) {
        const shift = await prisma.techJournalShift.upsert({
          where: {
            date_shiftNumber: {
              date: new Date(record.date),
              shiftNumber: record.shiftNumber,
            },
          },
          update: {
            sourceUploadId: upload.id,
            ...(millProductivityTph !== undefined && { millProductivityTph }),
          },
          create: {
            date: new Date(record.date),
            shiftNumber: record.shiftNumber,
            sourceUploadId: upload.id,
            ...(millProductivityTph !== undefined && { millProductivityTph }),
          },
        });
        shiftId = shift.id;
        shiftMap.set(shiftKey, shiftId);
      }

      await prisma.techProductivity.create({
        data: {
          techShiftId: shiftId,
          hour: record.hour,
          millLine: record.millLine,
          valuePct: record.valuePct,
        },
      });
      productivityCount++;
    }

    // Store downtime data and detect hazards
    let downtimeCount = 0;
    let hazardCount = 0;

    for (const record of result.downtime.data) {
      const shiftKey = `${record.date}-${record.shiftNumber}`;
      let shiftId = shiftMap.get(shiftKey);
      const millProductivityTph = millProductivityByShift.get(shiftKey);

      if (!shiftId) {
        const shift = await prisma.techJournalShift.upsert({
          where: {
            date_shiftNumber: {
              date: new Date(record.date),
              shiftNumber: record.shiftNumber,
            },
          },
          update: {
            sourceUploadId: upload.id,
            ...(millProductivityTph !== undefined && { millProductivityTph }),
          },
          create: {
            date: new Date(record.date),
            shiftNumber: record.shiftNumber,
            sourceUploadId: upload.id,
            ...(millProductivityTph !== undefined && { millProductivityTph }),
          },
        });
        shiftId = shift.id;
        shiftMap.set(shiftKey, shiftId);
      }

      const downtime = await prisma.techDowntime.create({
        data: {
          techShiftId: shiftId,
          equipment: record.equipment,
          timeFrom: record.timeFrom,
          timeTo: record.timeTo,
          minutes: record.minutes,
          reasonText: record.reasonText,
        },
      });
      downtimeCount++;

      // Detect hazards
      if (record.reasonText) {
        const hazards = detectHazardsFromText(record.reasonText);
        for (const hazard of hazards) {
          await prisma.hazard.create({
            data: {
              date: new Date(record.date),
              sourceType: "tech_journal",
              sourceRefId: downtime.id,
              description: hazard.description,
              severity: hazard.severity,
              tags: hazard.matchedKeyword,
            },
          });
          hazardCount++;
        }
      }
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

    let waterCount = 0;
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
      waterCount++;
    }

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
      downtimeCount++;

      // Detect hazards
      if (record.reasonText) {
        const hazards = detectHazardsFromText(record.reasonText);
        for (const hazard of hazards) {
          await prisma.hazard.create({
            data: {
              date: new Date(record.date),
              sourceType: "downtime",
              sourceRefId: downtime.id,
              description: hazard.description,
              severity: hazard.severity,
              tags: hazard.matchedKeyword,
            },
          });
          hazardCount++;
        }
      }
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
