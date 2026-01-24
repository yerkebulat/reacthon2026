import * as XLSX from 'xlsx';
import {
  parseSheetName,
  parseRussianDate,
  parseNumeric,
  excelTimeToString,
  cleanText,
  toISODateString,
  ParseWarning,
  ParseResult,
} from './utils';

export interface TechProductivityRecord {
  date: string;
  shiftNumber: number;
  hour: number;
  millLine: number;
  valuePct: number | null;
}

export interface TechMillProductivityRecord {
  date: string;
  shiftNumber: number;
  valueTph: number | null;
}

export interface TechDowntimeRecord {
  date: string;
  shiftNumber: number;
  equipment: string;
  timeFrom: string | null;
  timeTo: string | null;
  minutes: number | null;
  reasonText: string | null;
}

export interface TechJournalParseResult {
  productivity: ParseResult<TechProductivityRecord>;
  millProductivityTph: ParseResult<TechMillProductivityRecord>;
  downtime: ParseResult<TechDowntimeRecord>;
}

export function parseTechJournal(buffer: Buffer): TechJournalParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const productivityData: TechProductivityRecord[] = [];
  const millProductivityData: TechMillProductivityRecord[] = [];
  const downtimeData: TechDowntimeRecord[] = [];
  const productivityWarnings: ParseWarning[] = [];
  const millProductivityWarnings: ParseWarning[] = [];
  const downtimeWarnings: ParseWarning[] = [];

  let productivityRowsParsed = 0;
  let millProductivityRowsParsed = 0;
  let downtimeRowsParsed = 0;

  for (const sheetName of workbook.SheetNames) {
    // Skip sheets that don't match the pattern
    const { date, shiftNumber } = parseSheetName(sheetName);
    if (!date || !shiftNumber) {
      continue;
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    const dateStr = toISODateString(date);

    // Parse mill productivity (cell U17) - all mills total throughput (тн/ч)
    const throughputCell = sheet['U17'];
    const throughputValue = parseNumeric(throughputCell?.v ?? throughputCell);
    if (throughputCell && throughputValue === null) {
      millProductivityWarnings.push({
        sheet: sheetName,
        row: 17,
        column: 21,
        message: `Invalid mill productivity value: ${throughputCell?.v ?? ''}`,
      });
    }
    if (throughputCell || throughputValue !== null) {
      millProductivityData.push({
        date: dateStr,
        shiftNumber,
        valueTph: throughputValue,
      });
      millProductivityRowsParsed++;
    }

    // Parse productivity data (rows 4-16, columns B-F for mills 1-5)
    // Hours are in column A
    const productivityStartRow = 4;
    const productivityEndRow = 16;

    for (let rowIdx = productivityStartRow; rowIdx <= productivityEndRow && rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as unknown[];
      if (!row || row.length < 2) continue;

      const hourValue = row[0];
      let hour: number;

      if (typeof hourValue === 'string' && hourValue.toLowerCase() === 'среднее') {
        continue; // Skip average row
      }

      hour = parseNumeric(hourValue) ?? -1;
      if (hour < 0 || hour > 24) continue;

      // Adjust hour to 0-23 range
      if (hour === 24) hour = 0;

      // Parse mills 1-5 (columns B-F, indices 1-5)
      for (let millIdx = 1; millIdx <= 5; millIdx++) {
        const value = parseNumeric(row[millIdx]);

        // Only record if there's a value
        if (value !== null) {
          productivityData.push({
            date: dateStr,
            shiftNumber,
            hour,
            millLine: millIdx,
            valuePct: value,
          });
          productivityRowsParsed++;
        } else if (row[millIdx] && String(row[millIdx]).startsWith('#')) {
          productivityWarnings.push({
            sheet: sheetName,
            row: rowIdx + 1,
            column: millIdx + 1,
            message: `Formula error: ${row[millIdx]}`,
          });
        }
      }
    }

    // Find downtime section - look for "Простой мельниц" row
    let downtimeStartRow = -1;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] as unknown[];
      if (row && row.some(cell => String(cell).includes('Простой мельниц'))) {
        downtimeStartRow = i + 1; // Data starts on next row
        break;
      }
    }

    if (downtimeStartRow === -1) continue;

    // Parse downtime records
    let currentEquipment = '';
    let currentReasonText = '';
    let currentTimeFrom: string | null = null;
    let currentTimeTo: string | null = null;
    let currentMinutes: number | null = null;

    for (let rowIdx = downtimeStartRow; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as unknown[];
      if (!row || row.length < 2) continue;

      // Check if this is a new equipment row (has equipment ID in column A)
      const equipmentCell = cleanText(row[0]);

      // If we hit another section header or empty rows, stop
      if (equipmentCell.includes('Остаток') || equipmentCell.includes('Загрузка')) {
        // Save current record if exists
        if (currentEquipment && (currentReasonText || currentMinutes)) {
          downtimeData.push({
            date: dateStr,
            shiftNumber,
            equipment: currentEquipment,
            timeFrom: currentTimeFrom,
            timeTo: currentTimeTo,
            minutes: currentMinutes,
            reasonText: currentReasonText.trim() || null,
          });
          downtimeRowsParsed++;
        }
        break;
      }

      if (equipmentCell && equipmentCell.startsWith('№')) {
        // Save previous record if exists
        if (currentEquipment && (currentReasonText || currentMinutes)) {
          downtimeData.push({
            date: dateStr,
            shiftNumber,
            equipment: currentEquipment,
            timeFrom: currentTimeFrom,
            timeTo: currentTimeTo,
            minutes: currentMinutes,
            reasonText: currentReasonText.trim() || null,
          });
          downtimeRowsParsed++;
        }

        // Start new record
        currentEquipment = equipmentCell;
        currentReasonText = '';

        // Column C (index 2) = from time, Column D (index 3) = to time
        const fromTime = row[2];
        const toTime = row[3];

        if (typeof fromTime === 'number' && fromTime > 0 && fromTime < 1) {
          currentTimeFrom = excelTimeToString(fromTime);
        } else {
          currentTimeFrom = cleanText(fromTime) || null;
        }

        if (typeof toTime === 'number' && toTime > 0 && toTime < 1) {
          currentTimeTo = excelTimeToString(toTime);
        } else {
          currentTimeTo = cleanText(toTime) || null;
        }

        // Column F (index 5) = minutes
        const minutesValue = row[5];
        const minutesStr = cleanText(minutesValue);
        // Handle cases like "12часов " or "12 часов"
        const hoursMatch = minutesStr.match(/(\d+)\s*час/i);
        if (hoursMatch) {
          currentMinutes = parseInt(hoursMatch[1], 10) * 60;
        } else {
          currentMinutes = parseNumeric(minutesValue);
        }

        // Column H (index 7) = reason text
        const reasonText = cleanText(row[7]);
        currentReasonText = reasonText;
      } else if (currentEquipment) {
        // Continuation row - append reason text
        const reasonText = cleanText(row[7]);
        if (reasonText) {
          currentReasonText += '\n' + reasonText;
        }
      }
    }

    // Save last record
    if (currentEquipment && (currentReasonText || currentMinutes)) {
      downtimeData.push({
        date: dateStr,
        shiftNumber,
        equipment: currentEquipment,
        timeFrom: currentTimeFrom,
        timeTo: currentTimeTo,
        minutes: currentMinutes,
        reasonText: currentReasonText.trim() || null,
      });
      downtimeRowsParsed++;
    }
  }

  return {
    productivity: {
      data: productivityData,
      warnings: productivityWarnings,
      rowsParsed: productivityRowsParsed,
    },
    millProductivityTph: {
      data: millProductivityData,
      warnings: millProductivityWarnings,
      rowsParsed: millProductivityRowsParsed,
    },
    downtime: {
      data: downtimeData,
      warnings: downtimeWarnings,
      rowsParsed: downtimeRowsParsed,
    },
  };
}
