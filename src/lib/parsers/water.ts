import * as XLSX from 'xlsx';
import {
  excelDateToJSDate,
  parseNumeric,
  cleanText,
  toISODateString,
  ParseWarning,
  ParseResult,
} from './utils';

export interface WaterDailyRecord {
  date: string;
  meterReading: number | null;
  actualDaily: number | null;
  actualHourly: number | null;
  nominalDaily: number | null;
  monthLabel: string | null;
}

interface MonthColumnGroup {
  monthLabel: string;
  dateCol: number;
  meterCol: number;
  dailyCol: number;
  hourlyCol: number;
  nominalCol: number | null;
}

export function parseWater(buffer: Buffer): ParseResult<WaterDailyRecord> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const waterData: WaterDailyRecord[] = [];
  const warnings: ParseWarning[] = [];
  let rowsParsed = 0;

  // Process main sheet (usually the first one with actual data)
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  if (data.length < 3) {
    warnings.push({ message: 'Sheet has insufficient data' });
    return { data: waterData, warnings, rowsParsed: 0 };
  }

  // Row 0 contains month labels
  // Row 1 contains column headers
  const monthRow = data[0] as unknown[];
  const headerRow = data[1] as unknown[];

  // Find all month groups by scanning row 0 for month labels and row 1 for "Дата"
  const monthGroups: MonthColumnGroup[] = [];

  for (let col = 0; col < headerRow.length; col++) {
    const header = cleanText(headerRow[col]).toLowerCase();

    if (header === 'дата') {
      // Found a date column, now find the month label
      // Look backwards in row 0 for the month label
      let monthLabel = '';
      for (let mc = col; mc >= 0; mc--) {
        const monthCell = cleanText(monthRow[mc]);
        if (monthCell && (monthCell.includes('г') || monthCell.includes('20'))) {
          monthLabel = monthCell;
          break;
        }
      }

      // Find related columns
      let meterCol = -1;
      let dailyCol = -1;
      let hourlyCol = -1;
      let nominalCol: number | null = null;

      // Scan subsequent columns until we hit another "Дата" or end
      for (let sc = col + 1; sc < headerRow.length; sc++) {
        const subHeader = cleanText(headerRow[sc]).toLowerCase();

        if (subHeader === 'дата') break; // Next month group

        if (subHeader.includes('показание') || subHeader.includes('счетч')) {
          meterCol = sc;
        } else if (
          (subHeader.includes('расход') && subHeader.includes('сутки')) ||
          subHeader.includes('фактический расход')
        ) {
          dailyCol = sc;
        } else if (subHeader.includes('расход') && subHeader.includes('час')) {
          hourlyCol = sc;
        } else if (subHeader.includes('номинальн')) {
          nominalCol = sc;
        }
      }

      if (meterCol !== -1 || dailyCol !== -1) {
        monthGroups.push({
          monthLabel: monthLabel || 'Unknown',
          dateCol: col,
          meterCol,
          dailyCol,
          hourlyCol,
          nominalCol,
        });
      }
    }
  }

  // Parse data rows for each month group
  for (const group of monthGroups) {
    for (let rowIdx = 2; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as unknown[];
      if (!row) continue;

      const dateValue = row[group.dateCol];
      if (!dateValue || dateValue === '') continue;

      // Parse date (Excel serial number)
      let dateStr: string;
      if (typeof dateValue === 'number') {
        const date = excelDateToJSDate(dateValue);
        dateStr = toISODateString(date);
      } else {
        continue; // Skip non-date rows
      }

      const meterReading = group.meterCol >= 0 ? parseNumeric(row[group.meterCol]) : null;
      const actualDaily = group.dailyCol >= 0 ? parseNumeric(row[group.dailyCol]) : null;
      const actualHourly = group.hourlyCol >= 0 ? parseNumeric(row[group.hourlyCol]) : null;
      const nominalDaily = group.nominalCol !== null ? parseNumeric(row[group.nominalCol]) : null;

      // Skip rows with no meaningful data
      if (meterReading === null && actualDaily === null && actualHourly === null) {
        continue;
      }

      waterData.push({
        date: dateStr,
        meterReading,
        actualDaily,
        actualHourly,
        nominalDaily,
        monthLabel: group.monthLabel,
      });
      rowsParsed++;
    }
  }

  // Deduplicate by date (keep the record with most data)
  const dateMap = new Map<string, WaterDailyRecord>();
  for (const record of waterData) {
    const existing = dateMap.get(record.date);
    if (!existing) {
      dateMap.set(record.date, record);
    } else {
      // Merge data, prefer non-null values
      dateMap.set(record.date, {
        date: record.date,
        meterReading: record.meterReading ?? existing.meterReading,
        actualDaily: record.actualDaily ?? existing.actualDaily,
        actualHourly: record.actualHourly ?? existing.actualHourly,
        nominalDaily: record.nominalDaily ?? existing.nominalDaily,
        monthLabel: record.monthLabel ?? existing.monthLabel,
      });
    }
  }

  return {
    data: Array.from(dateMap.values()),
    warnings,
    rowsParsed,
  };
}
