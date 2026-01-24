import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { computeSignals, DashboardData } from '@/lib/signals';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    // Build date filter
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    // Fetch all necessary data
    const productivityData = await prisma.techJournalShift.findMany({
      where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      include: { productivity: true, downtime: true },
      orderBy: { date: 'asc' },
    });

    // Aggregate productivity
    const productivityByDate = new Map<string, { values: number[]; byHour: Map<number, number[]> }>();
    for (const shift of productivityData) {
      const dateStr = shift.date.toISOString().split('T')[0];
      if (!productivityByDate.has(dateStr)) {
        productivityByDate.set(dateStr, { values: [], byHour: new Map() });
      }
      const entry = productivityByDate.get(dateStr)!;
      for (const p of shift.productivity) {
        if (p.valuePct !== null) {
          entry.values.push(p.valuePct);
          if (!entry.byHour.has(p.hour)) entry.byHour.set(p.hour, []);
          entry.byHour.get(p.hour)!.push(p.valuePct);
        }
      }
    }

    // Aggregate downtime
    const downtimeByDate = new Map<
      string,
      {
        totalMinutes: number;
        byEquipment: Record<string, number>;
        byClassification: Record<string, number>;
        reasons: Array<{ reason: string; minutes: number }>;
      }
    >();

    for (const shift of productivityData) {
      const dateStr = shift.date.toISOString().split('T')[0];
      if (!downtimeByDate.has(dateStr)) {
        downtimeByDate.set(dateStr, {
          totalMinutes: 0,
          byEquipment: {},
          byClassification: {},
          reasons: [],
        });
      }
      const entry = downtimeByDate.get(dateStr)!;
      for (const dt of shift.downtime) {
        const minutes = dt.minutes || 0;
        entry.totalMinutes += minutes;
        entry.byEquipment[dt.equipment] = (entry.byEquipment[dt.equipment] || 0) + minutes;
        if (dt.reasonText) entry.reasons.push({ reason: dt.reasonText, minutes });
      }
    }

    const downtimeDaily = await prisma.downtimeDaily.findMany({
      where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      orderBy: { date: 'asc' },
    });

    for (const dt of downtimeDaily) {
      const dateStr = dt.date.toISOString().split('T')[0];
      if (!downtimeByDate.has(dateStr)) {
        downtimeByDate.set(dateStr, {
          totalMinutes: 0,
          byEquipment: {},
          byClassification: {},
          reasons: [],
        });
      }
      const entry = downtimeByDate.get(dateStr)!;
      const minutes = dt.minutes || 0;
      entry.totalMinutes += minutes;
      entry.byEquipment[dt.equipment] = (entry.byEquipment[dt.equipment] || 0) + minutes;
      if (dt.classification) {
        entry.byClassification[dt.classification] =
          (entry.byClassification[dt.classification] || 0) + minutes;
      }
      if (dt.reasonText) entry.reasons.push({ reason: dt.reasonText, minutes });
    }

    // Fetch water data
    const waterData = await prisma.waterDaily.findMany({
      where: Object.keys(dateFilter).length > 0 ? { date: dateFilter } : undefined,
      orderBy: { date: 'asc' },
    });

    // Build dashboard data structure
    const dashboardData: DashboardData = {
      productivity: Array.from(productivityByDate.entries()).map(([date, data]) => ({
        date,
        avgPct: data.values.length > 0 ? data.values.reduce((a, b) => a + b, 0) / data.values.length : 0,
        byHour: Array.from(data.byHour.entries())
          .map(([hour, values]) => ({
            hour,
            avgPct: values.reduce((a, b) => a + b, 0) / values.length,
          }))
          .sort((a, b) => a.hour - b.hour),
      })),
      downtime: Array.from(downtimeByDate.entries()).map(([date, data]) => ({
        date,
        ...data,
      })),
      water: waterData.map((w) => ({
        date: w.date.toISOString().split('T')[0],
        actual: w.actualDaily || 0,
        nominal: w.nominalDaily || 0,
      })),
    };

    const dateRange = fromDate && toDate ? { from: fromDate, to: toDate } : undefined;
    const signals = computeSignals(dashboardData, dateRange);

    return NextResponse.json(signals);
  } catch (error) {
    console.error('Signals API error:', error);
    return NextResponse.json({ error: 'Failed to compute signals' }, { status: 500 });
  }
}
