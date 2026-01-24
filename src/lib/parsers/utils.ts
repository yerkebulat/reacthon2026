/**
 * Excel date to JavaScript Date conversion
 * Excel dates are stored as days since January 1, 1900 (with a bug for 1900 leap year)
 */
export function excelDateToJSDate(excelDate: number): Date {
  // Excel epoch is December 30, 1899
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + excelDate * msPerDay);
}

/**
 * Parse a Russian date string like "01.01.2026" to Date
 */
export function parseRussianDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Handle Excel serial date numbers
  if (typeof dateStr === 'number') {
    return excelDateToJSDate(dateStr);
  }

  const match = String(dateStr).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
  let year = parseInt(match[3], 10);

  // Handle 2-digit years
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  return new Date(year, month, day);
}

/**
 * Parse sheet name to extract date and shift number
 * Format: "dd.mm.yyсмN" e.g., "01.01.26см1"
 */
export function parseSheetName(sheetName: string): { date: Date | null; shiftNumber: number | null } {
  // Pattern: digits.digits.digits + "см" + digit
  const match = sheetName.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})см(\d)/i);

  if (!match) {
    return { date: null, shiftNumber: null };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1;
  let year = parseInt(match[3], 10);

  if (year < 100) {
    year += 2000;
  }

  const shiftNumber = parseInt(match[4], 10);

  return {
    date: new Date(year, month, day),
    shiftNumber,
  };
}

/**
 * Check if a value is a numeric value (not a formula error)
 */
export function isValidNumeric(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') {
    // Check for Excel formula errors
    if (value.startsWith('#') || value === 'NaN' || value === 'Infinity') {
      return false;
    }
  }
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

/**
 * Parse a numeric value, returning null for invalid values
 */
export function parseNumeric(value: unknown): number | null {
  if (!isValidNumeric(value)) return null;
  return Number(value);
}

/**
 * Convert Excel time fraction to HH:MM string
 * Excel stores times as fractions of a day (0.5 = 12:00)
 */
export function excelTimeToString(excelTime: number): string {
  if (!isValidNumeric(excelTime)) return '';

  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Normalize date to ISO date string (YYYY-MM-DD)
 */
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Clean and normalize text
 */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

/**
 * Parse month name from Russian to month index
 */
const RUSSIAN_MONTHS: Record<string, number> = {
  'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3,
  'май': 4, 'мая': 4, 'июн': 5, 'июл': 6, 'август': 7,
  'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11,
};

export function parseRussianMonthYear(text: string): { month: number; year: number } | null {
  const lower = text.toLowerCase();

  // Find month
  let month = -1;
  for (const [key, value] of Object.entries(RUSSIAN_MONTHS)) {
    if (lower.includes(key)) {
      month = value;
      break;
    }
  }

  // Find year
  const yearMatch = lower.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  if (month === -1) return null;

  return { month, year };
}

export interface ParseWarning {
  row?: number;
  column?: number;
  sheet?: string;
  message: string;
}

export interface ParseResult<T> {
  data: T[];
  warnings: ParseWarning[];
  rowsParsed: number;
}
