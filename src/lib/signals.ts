import { config, SignalColor, getProductivitySignal, getDowntimeSignal, getWaterSignal } from './config';

export interface PriorityItem {
  id: string;
  type: 'downtime' | 'water' | 'productivity';
  score: number;
  description: string;
  signal: SignalColor;
  value: number;
  unit: string;
  date: string;
}

export interface SignalSummary {
  productivity: {
    signal: SignalColor;
    currentPct: number;
    targetPct: number;
  };
  downtime: {
    signal: SignalColor;
    totalMinutes: number;
    topReasons: Array<{ reason: string; minutes: number }>;
  };
  water: {
    signal: SignalColor;
    actual: number;
    nominal: number;
    overPct: number;
  };
  priorityItems: PriorityItem[];
}

export interface DashboardData {
  productivity: Array<{
    date: string;
    avgPct: number;
    byHour: Array<{ hour: number; avgPct: number }>;
  }>;
  downtime: Array<{
    date: string;
    totalMinutes: number;
    byEquipment: Record<string, number>;
    byClassification: Record<string, number>;
    reasons: Array<{ reason: string; minutes: number }>;
  }>;
  water: Array<{
    date: string;
    actual: number;
    nominal: number;
  }>;
}

export function computeSignals(data: DashboardData, dateRange?: { from: string; to: string }): SignalSummary {
  // Filter data by date range if provided
  let filteredProductivity = data.productivity;
  let filteredDowntime = data.downtime;
  let filteredWater = data.water;

  if (dateRange) {
    filteredProductivity = data.productivity.filter(
      (d) => d.date >= dateRange.from && d.date <= dateRange.to
    );
    filteredDowntime = data.downtime.filter(
      (d) => d.date >= dateRange.from && d.date <= dateRange.to
    );
    filteredWater = data.water.filter(
      (d) => d.date >= dateRange.from && d.date <= dateRange.to
    );
  }

  // Compute productivity signal
  const avgProductivity =
    filteredProductivity.length > 0
      ? filteredProductivity.reduce((sum, d) => sum + d.avgPct, 0) / filteredProductivity.length
      : 0;
  const productivitySignal = getProductivitySignal(avgProductivity);

  // Compute downtime signal
  const totalDowntimeMinutes = filteredDowntime.reduce((sum, d) => sum + d.totalMinutes, 0);
  const avgDailyDowntime =
    filteredDowntime.length > 0 ? totalDowntimeMinutes / filteredDowntime.length : 0;
  const downtimeSignal = getDowntimeSignal(avgDailyDowntime);

  // Aggregate downtime reasons
  const reasonMinutes: Record<string, number> = {};
  for (const d of filteredDowntime) {
    for (const r of d.reasons) {
      if (r.reason) {
        reasonMinutes[r.reason] = (reasonMinutes[r.reason] || 0) + r.minutes;
      }
    }
  }
  const topReasons = Object.entries(reasonMinutes)
    .map(([reason, minutes]) => ({ reason, minutes }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // Compute water signal
  const latestWater = filteredWater.length > 0 ? filteredWater[filteredWater.length - 1] : null;
  const waterActual = latestWater?.actual ?? 0;
  const waterNominal = latestWater?.nominal ?? 0;
  const waterSignal = getWaterSignal(waterActual, waterNominal);
  const waterOverPct = waterNominal > 0 ? ((waterActual - waterNominal) / waterNominal) * 100 : 0;

  // Compute priority items
  const priorityItems: PriorityItem[] = [];

  // Add downtime priority items
  for (const d of filteredDowntime) {
    if (d.totalMinutes > config.downtime.greenMaxMinutes) {
      priorityItems.push({
        id: `downtime-${d.date}`,
        type: 'downtime',
        score: d.totalMinutes * config.priority.downtimeWeight,
        description: `Простой ${d.totalMinutes} мин (${d.date})`,
        signal: getDowntimeSignal(d.totalMinutes),
        value: d.totalMinutes,
        unit: 'мин',
        date: d.date,
      });
    }
  }

  // Add water priority items
  for (const w of filteredWater) {
    if (w.nominal > 0) {
      const overPct = ((w.actual - w.nominal) / w.nominal) * 100;
      if (overPct > config.water.yellowOverPct) {
        priorityItems.push({
          id: `water-${w.date}`,
          type: 'water',
          score: overPct * config.priority.waterOverWeight,
          description: `Перерасход воды ${overPct.toFixed(1)}% (${w.date})`,
          signal: getWaterSignal(w.actual, w.nominal),
          value: overPct,
          unit: '%',
          date: w.date,
        });
      }
    }
  }

  // Add productivity priority items
  for (const p of filteredProductivity) {
    const dropPct = ((config.productivity.targetPct - p.avgPct) / config.productivity.targetPct) * 100;
    if (dropPct > config.productivity.yellowThresholdPct) {
      priorityItems.push({
        id: `productivity-${p.date}`,
        type: 'productivity',
        score: dropPct * config.priority.productivityDropWeight,
        description: `Производительность ${p.avgPct.toFixed(1)}% (цель: ${config.productivity.targetPct}%)`,
        signal: getProductivitySignal(p.avgPct),
        value: dropPct,
        unit: '%',
        date: p.date,
      });
    }
  }

  // Sort priority items by score descending
  priorityItems.sort((a, b) => b.score - a.score);

  return {
    productivity: {
      signal: productivitySignal,
      currentPct: avgProductivity,
      targetPct: config.productivity.targetPct,
    },
    downtime: {
      signal: downtimeSignal,
      totalMinutes: totalDowntimeMinutes,
      topReasons,
    },
    water: {
      signal: waterSignal,
      actual: waterActual,
      nominal: waterNominal,
      overPct: waterOverPct,
    },
    priorityItems: priorityItems.slice(0, 10),
  };
}
