import { config } from './config';

export type HazardSeverity = 'low' | 'medium' | 'high';

export interface DetectedHazard {
  description: string;
  severity: HazardSeverity;
  matchedKeyword: string;
}

/**
 * Detect hazards from text based on keyword matching
 */
export function detectHazardsFromText(text: string): DetectedHazard[] {
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const hazards: DetectedHazard[] = [];
  const matchedKeywords = new Set<string>();

  // Check high severity keywords
  for (const keyword of config.hazardKeywords.high) {
    if (lowerText.includes(keyword.toLowerCase()) && !matchedKeywords.has(keyword)) {
      matchedKeywords.add(keyword);
      hazards.push({
        description: text,
        severity: 'high',
        matchedKeyword: keyword,
      });
      return hazards; // Return immediately for high severity
    }
  }

  // Check medium severity keywords
  for (const keyword of config.hazardKeywords.medium) {
    if (lowerText.includes(keyword.toLowerCase()) && !matchedKeywords.has(keyword)) {
      matchedKeywords.add(keyword);
      hazards.push({
        description: text,
        severity: 'medium',
        matchedKeyword: keyword,
      });
    }
  }

  if (hazards.length > 0) return hazards;

  // Check low severity keywords
  for (const keyword of config.hazardKeywords.low) {
    if (lowerText.includes(keyword.toLowerCase()) && !matchedKeywords.has(keyword)) {
      matchedKeywords.add(keyword);
      hazards.push({
        description: text,
        severity: 'low',
        matchedKeyword: keyword,
      });
    }
  }

  return hazards;
}

/**
 * Get severity color for display
 */
export function getSeverityColor(severity: HazardSeverity): string {
  switch (severity) {
    case 'high':
      return 'red';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'green';
  }
}

/**
 * Get severity label in Russian
 */
export function getSeverityLabel(severity: HazardSeverity): string {
  switch (severity) {
    case 'high':
      return 'Высокий';
    case 'medium':
      return 'Средний';
    case 'low':
      return 'Низкий';
  }
}
