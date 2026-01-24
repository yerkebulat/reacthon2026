import thresholds from '../../config/thresholds.json';

export const config = {
  productivity: {
    targetPct: thresholds.productivity.targetPct,
    yellowThresholdPct: thresholds.productivity.yellowThresholdPct,
    redThresholdPct: thresholds.productivity.redThresholdPct,
  },
  downtime: {
    greenMaxMinutes: thresholds.downtime.greenMaxMinutes,
    yellowMaxMinutes: thresholds.downtime.yellowMaxMinutes,
  },
  water: {
    yellowOverPct: thresholds.water.yellowOverPct,
    redOverPct: thresholds.water.redOverPct,
  },
  priority: {
    downtimeWeight: thresholds.priority.downtimeWeight,
    waterOverWeight: thresholds.priority.waterOverWeight,
    productivityDropWeight: thresholds.priority.productivityDropWeight,
  },
  hazardKeywords: {
    high: thresholds.hazardKeywords.high,
    medium: thresholds.hazardKeywords.medium,
    low: thresholds.hazardKeywords.low,
  },
};

export type SignalColor = 'green' | 'yellow' | 'red';

export function getProductivitySignal(currentPct: number, targetPct: number = config.productivity.targetPct): SignalColor {
  const dropPct = ((targetPct - currentPct) / targetPct) * 100;
  if (dropPct > config.productivity.redThresholdPct) return 'red';
  if (dropPct > config.productivity.yellowThresholdPct) return 'yellow';
  return 'green';
}

export function getDowntimeSignal(totalMinutes: number): SignalColor {
  if (totalMinutes > config.downtime.yellowMaxMinutes) return 'red';
  if (totalMinutes > config.downtime.greenMaxMinutes) return 'yellow';
  return 'green';
}

export function getWaterSignal(actual: number, nominal: number): SignalColor {
  if (nominal <= 0) return 'green';
  const overPct = ((actual - nominal) / nominal) * 100;
  if (overPct > config.water.redOverPct) return 'red';
  if (overPct > config.water.yellowOverPct) return 'yellow';
  return 'green';
}
