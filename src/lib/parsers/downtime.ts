import * as XLSX from 'xlsx';
import {
  excelDateToJSDate,
  parseNumeric,
  cleanText,
  toISODateString,
  parseRussianMonthYear,
  ParseWarning,
  ParseResult,
} from './utils';

export interface DowntimeDailyRecord {
  date: string;
  equipment: string;
  reasonText: string | null;
  minutes: number | null;
  classification: string | null; // M | E | T | P | null
}

// Equipment columns in the standard layout
const EQUIPMENT_COLUMNS = ['МШР №1', 'МШЦ №2', 'МШР №3', 'МШЦ №4', 'ОФ', 'ДСК'];

export function parseDowntime(buffer: Buffer): ParseResult<DowntimeDailyRecord> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const downtimeData: DowntimeDailyRecord[] = [];
  const warnings: ParseWarning[] = [];
  let rowsParsed = 0;

  for (const sheetName of workbook.SheetNames) {
    // Extract month/year from sheet name
    const monthYear = parseRussianMonthYear(sheetName);
    if (!monthYear) {
      warnings.push({ sheet: sheetName, message: 'Could not parse month/year from sheet name' });
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    if (data.length < 3) continue;

    // Row 0: Section headers ("Причины простоя", "Время простоя, мин", "Классификация простоя")
    // Row 1: "Дата" and equipment columns
    const headerRow = data[1] as unknown[];

    // Find column indices for each section
    // Structure: [Дата | Reasons (6 cols) | Minutes (6 cols) | Classification (6 cols)]
    let dateCol = -1;
    const reasonStartCol = 1;
    const minutesStartCol = 7;
    const classStartCol = 13;

    // Find date column
    for (let col = 0; col < headerRow.length; col++) {
      if (cleanText(headerRow[col]).toLowerCase() === 'дата') {
        dateCol = col;
        break;
      }
    }

    if (dateCol === -1) {
      dateCol = 0; // Assume first column
    }

    // Parse data rows
    let lastDate: string | null = null;
    const pendingRecords: Map<string, DowntimeDailyRecord> = new Map();

    for (let rowIdx = 2; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx] as unknown[];
      if (!row || row.length < 2) continue;

      const dateValue = row[dateCol];
      let dateStr: string | null = null;

      if (dateValue && dateValue !== '') {
        if (typeof dateValue === 'number') {
          const date = excelDateToJSDate(dateValue);
          dateStr = toISODateString(date);
          lastDate = dateStr;

          // Save any pending records from previous date
          for (const record of pendingRecords.values()) {
            if (record.reasonText || record.minutes) {
              downtimeData.push(record);
              rowsParsed++;
            }
          }
          pendingRecords.clear();
        }
      }

      // Use last seen date for continuation rows
      const currentDate = dateStr || lastDate;
      if (!currentDate) continue;

      // Parse each equipment column
      for (let eqIdx = 0; eqIdx < EQUIPMENT_COLUMNS.length; eqIdx++) {
        const equipment = EQUIPMENT_COLUMNS[eqIdx];
        const key = `${currentDate}-${equipment}`;

        const reasonCol = reasonStartCol + eqIdx;
        const minutesCol = minutesStartCol + eqIdx;
        const classCol = classStartCol + eqIdx;

        const reasonText = cleanText(row[reasonCol] ?? '');
        const minutes = parseNumeric(row[minutesCol]);
        const classification = cleanText(row[classCol] ?? '').toUpperCase();

        // Validate classification
        const validClass = ['М', 'Э', 'Т', 'П', 'M', 'E', 'T', 'P'].includes(classification)
          ? classification.replace('М', 'M').replace('Э', 'E').replace('Т', 'T').replace('П', 'P')
          : null;

        // Skip if no data
        if (!reasonText && minutes === null && !validClass) continue;

        if (dateStr) {
          // New date row - create new record
          pendingRecords.set(key, {
            date: currentDate,
            equipment,
            reasonText: reasonText || null,
            minutes,
            classification: validClass,
          });
        } else {
          // Continuation row - append to existing or create new
          const existing = pendingRecords.get(key);
          if (existing) {
            // Append reason text
            if (reasonText) {
              existing.reasonText = existing.reasonText
                ? existing.reasonText + '\n' + reasonText
                : reasonText;
            }
            // Update minutes/classification if provided
            if (minutes !== null) existing.minutes = minutes;
            if (validClass) existing.classification = validClass;
          } else if (reasonText || minutes !== null) {
            pendingRecords.set(key, {
              date: currentDate,
              equipment,
              reasonText: reasonText || null,
              minutes,
              classification: validClass,
            });
          }
        }
      }
    }

    // Save remaining pending records
    for (const record of pendingRecords.values()) {
      if (record.reasonText || record.minutes) {
        downtimeData.push(record);
        rowsParsed++;
      }
    }
  }

  return {
    data: downtimeData,
    warnings,
    rowsParsed,
  };
}
