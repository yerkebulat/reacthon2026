import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const shift = searchParams.get('shift');
    const equipment = searchParams.get('equipment');

    // Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    // Fetch productivity data
    const productivityData = await prisma.techJournalShift.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        ...(shift && { shiftNumber: parseInt(shift) }),
      },
      include: {
        productivity: true,
        downtime: true,
      },
      orderBy: { date: 'asc' },
    });

    // Aggregate productivity by date
    const productivityByDate = new Map<
      string,
      { date: string; values: number[]; byHour: Map<number, number[]> }
    >();

    for (const shiftData of productivityData) {
      const dateStr = shiftData.date.toISOString().split('T')[0];
      if (!productivityByDate.has(dateStr)) {
        productivityByDate.set(dateStr, {
          date: dateStr,
          values: [],
          byHour: new Map(),
        });
      }
      const dateEntry = productivityByDate.get(dateStr)!;

      for (const p of shiftData.productivity) {
        if (p.valuePct !== null) {
          dateEntry.values.push(p.valuePct);
          if (!dateEntry.byHour.has(p.hour)) {
            dateEntry.byHour.set(p.hour, []);
          }
          dateEntry.byHour.get(p.hour)!.push(p.valuePct);
        }
      }
    }

    const productivityResult = Array.from(productivityByDate.values()).map((d) => ({
      date: d.date,
      avgPct: d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : 0,
      byHour: Array.from(d.byHour.entries())
        .map(([hour, values]) => ({
          hour,
          avgPct: values.reduce((a, b) => a + b, 0) / values.length,
        }))
        .sort((a, b) => a.hour - b.hour),
    }));

    // Aggregate mill productivity (тн/ч) by date
    const millProductivityByDate = new Map<string, { date: string; values: number[] }>();
    for (const shiftData of productivityData) {
      const dateStr = shiftData.date.toISOString().split('T')[0];
      if (!millProductivityByDate.has(dateStr)) {
        millProductivityByDate.set(dateStr, { date: dateStr, values: [] });
      }
      const entry = millProductivityByDate.get(dateStr)!;
      if (shiftData.millProductivityTph !== null) {
        entry.values.push(shiftData.millProductivityTph);
      }
    }

    const millProductivityResult = Array.from(millProductivityByDate.values()).map((d) => ({
      date: d.date,
      avgTph: d.values.length > 0 ? d.values.reduce((a, b) => a + b, 0) / d.values.length : 0,
    }));

    // Aggregate downtime
    const downtimeByDate = new Map<
      string,
      {
        date: string;
        totalMinutes: number;
        byEquipment: Record<string, number>;
        byClassification: Record<string, number>;
        reasons: Array<{ reason: string; minutes: number }>;
      }
    >();

    // From tech journal downtime
    for (const shiftData of productivityData) {
      const dateStr = shiftData.date.toISOString().split('T')[0];
      if (!downtimeByDate.has(dateStr)) {
        downtimeByDate.set(dateStr, {
          date: dateStr,
          totalMinutes: 0,
          byEquipment: {},
          byClassification: {},
          reasons: [],
        });
      }
      const dateEntry = downtimeByDate.get(dateStr)!;

      for (const dt of shiftData.downtime) {
        if (equipment && dt.equipment !== equipment) continue;

        const minutes = dt.minutes || 0;
        dateEntry.totalMinutes += minutes;
        dateEntry.byEquipment[dt.equipment] =
          (dateEntry.byEquipment[dt.equipment] || 0) + minutes;

        if (dt.reasonText) {
          dateEntry.reasons.push({ reason: dt.reasonText, minutes });
        }
      }
    }

    // From downtime daily
    const downtimeDaily = await prisma.downtimeDaily.findMany({
      where: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        ...(equipment && { equipment }),
      },
      orderBy: { date: 'asc' },
    });

    for (const dt of downtimeDaily) {
      const dateStr = dt.date.toISOString().split('T')[0];
      if (!downtimeByDate.has(dateStr)) {
        downtimeByDate.set(dateStr, {
          date: dateStr,
          totalMinutes: 0,
          byEquipment: {},
          byClassification: {},
          reasons: [],
        });
      }
      const dateEntry = downtimeByDate.get(dateStr)!;

      const minutes = dt.minutes || 0;
      dateEntry.totalMinutes += minutes;
      dateEntry.byEquipment[dt.equipment] =
        (dateEntry.byEquipment[dt.equipment] || 0) + minutes;

      if (dt.classification) {
        dateEntry.byClassification[dt.classification] =
          (dateEntry.byClassification[dt.classification] || 0) + minutes;
      }

      if (dt.reasonText) {
        dateEntry.reasons.push({ reason: dt.reasonText, minutes });
      }
    }

    const downtimeResult = Array.from(downtimeByDate.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    // Fetch water data
    const waterData = await prisma.waterDaily.findMany({
      where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      orderBy: { date: 'asc' },
    });

    const waterResult = waterData.map((w) => ({
      date: w.date.toISOString().split('T')[0],
      actual: w.actualDaily || 0,
      nominal: w.nominalDaily || 0,
      meterReading: w.meterReading || 0,
      hourly: w.actualHourly || 0,
    }));

    // Count open hazards
    const openHazards = await prisma.hazard.count({
      where: { status: 'open' },
    });

    return NextResponse.json({
      productivity: productivityResult,
      millProductivityTph: millProductivityResult,
      downtime: downtimeResult,
      water: waterResult,
      openHazards,
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
