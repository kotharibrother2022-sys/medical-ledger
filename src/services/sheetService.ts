import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { differenceInDays, parse, format } from 'date-fns';

export interface LedgerEntry {
    sNo: string;
    invoiceNo: string;
    date: string;
    party: string;
    amount: number;
    narration: string;
    dueDays: number;
    mobileNo: string;
    comment: string;
    colour: string;
    timestamp: number; // Pre-parsed date for fast filtering
    monthYear: string; // Pre-formatted month-year for fast month filtering
    searchString: string; // Pre-calculated lowercase string for fast search
}

export const CACHE_VERSION = 'v5'; // Bump this to clear old incompatible caches

export const YEAR_GIDS = {
    '25-26': '1390916342', // Current
    '24-25': '690241724',
    '23-24': '1039176913',
    '22-23': '983509982',
} as const;

export type FinancialYear = keyof typeof YEAR_GIDS | 'ALL_TIME';

const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQmnzleOlhV7JbCWGpDNtfK25POYM2ENCS4hQkIog1n3olh-TTzjPg9XSq4ox5ovA/pub?output=csv';


// Helper to process raw row into LedgerEntry
function processRow(row: any, fieldMap: Record<string, string>, index: number, now: Date): LedgerEntry {
    const f_date = fieldMap['date'];
    const dateStr = (f_date ? row[f_date] : '') || '';

    let dueDays = 0;
    let timestamp = 0;
    let monthYear = '';

    if (dateStr) {
        try {
            const normalizedDate = dateStr.includes('-') ? dateStr.replace(/-/g, '/') : dateStr.replace(/\./g, '/');
            const parsedDate = parse(normalizedDate, 'dd/MM/yyyy', now);
            if (!isNaN(parsedDate.getTime())) {
                timestamp = parsedDate.getTime();
                monthYear = format(parsedDate, 'MMMM yyyy');
                dueDays = differenceInDays(now, parsedDate);
            }
        } catch (e) { }
    }

    const entry: LedgerEntry = {
        sNo: (fieldMap['sNo'] ? row[fieldMap['sNo']] : '') || String(index + 1),
        invoiceNo: (fieldMap['invoiceNo'] ? row[fieldMap['invoiceNo']] : '') || '',
        date: dateStr,
        party: (fieldMap['party'] ? row[fieldMap['party']] : '') || '',
        amount: parseFloat(String((fieldMap['amount'] ? row[fieldMap['amount']] : '0') || '0').replace(/,/g, '')),
        narration: (fieldMap['narration'] ? row[fieldMap['narration']] : '') || '',
        dueDays: parseInt(String((fieldMap['dueDays'] ? row[fieldMap['dueDays']] : '') || dueDays)),
        mobileNo: (fieldMap['mobileNo'] ? row[fieldMap['mobileNo']] : '') || '',
        comment: (fieldMap['comment'] ? row[fieldMap['comment']] : '') || '',
        colour: (fieldMap['colour'] ? row[fieldMap['colour']] : '') || '',
        timestamp,
        monthYear,
        searchString: ''
    };

    entry.searchString = `${entry.invoiceNo} ${entry.party} ${entry.mobileNo} ${entry.narration} ${entry.amount}`.toLowerCase();
    return entry;
}

export async function fetchLedgerData(year: FinancialYear = '25-26', ignoreCache = false): Promise<LedgerEntry[]> {
    if (year === 'ALL_TIME') return fetchAllYearsData(ignoreCache);

    // Strategy: First try fetching from our lightning-fast split JSON store
    if (!ignoreCache) {
        try {
            // Construct filename: "25-26" -> "ledger-25_26.json"
            const safeYear = year.replace(/-/g, '_').toLowerCase();
            const jsonUrl = `/data/ledger-${safeYear}.json`;
            const response = await fetch(`${jsonUrl}?t=${Date.now()}`);

            if (response.ok) {
                const rawData = await response.json();

                if (rawData && Array.isArray(rawData)) {
                    console.log(`⚡ Loaded ${year} from split JSON store`);

                    // If the JSON is already pre-processed (has searchString), return it directly for extreme speed
                    if (rawData.length > 0 && (rawData[0] as any).searchString) {
                        const now = new Date();
                        // Optional: Update dueDays based on current date if needed
                        return (rawData as LedgerEntry[]).map(entry => {
                            if (entry.timestamp) {
                                entry.dueDays = differenceInDays(now, new Date(entry.timestamp));
                            }
                            return entry;
                        });
                    }

                    // Fallback for non-processed JSON
                    const now = new Date();
                    const mappings = {
                        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.'],
                        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
                        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR']
                    };

                    const firstRow = rawData[0] || {};
                    const fieldMap: Record<string, string> = {};
                    Object.entries(mappings).forEach(([key, possibleKeys]) => {
                        const found = Object.keys(firstRow).find(f =>
                            possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
                        );
                        if (found) fieldMap[key] = found;
                    });

                    return rawData.map((row, i) => processRow(row, fieldMap, i, now));
                }
            }
        } catch (e) {
            console.warn(`Split JSON store not available for ${year}, falling back to Google Sheets`, e);
        }
    }

    // FALLBACK 1: Google Sheets CSV
    const gid = YEAR_GIDS[year as keyof typeof YEAR_GIDS];
    const url = `${SHEET_BASE_URL}&gid=${gid}&_t=${Date.now()}`;

    try {
        return await new Promise((resolve, reject) => {
            Papa.parse(url, {
                download: true, header: true, skipEmptyLines: true, worker: false, // Worker false for better error handling in some cases
                complete: (results) => {
                    const data = results.data as any[];
                    // Check for Google Sheet Errors
                    if (!data || data.length === 0 || (data.length > 0 && Object.values(data[0]).some(v => String(v).includes('#ERROR')))) {
                        reject(new Error("Google Sheet returned #ERROR! or empty data"));
                        return;
                    }

                    const fields = results.meta.fields || [];
                    const fieldMap: Record<string, string> = {};
                    const mappings = {
                        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
                        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
                        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR']
                    };

                    Object.entries(mappings).forEach(([key, possibleKeys]) => {
                        const found = fields.find(f => possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase()));
                        if (found) fieldMap[key] = found;
                    });

                    const now = new Date();
                    resolve(data.map((row, i) => processRow(row, fieldMap, i, now)));
                },
                error: (error) => reject(error),
            });
        });
    } catch (gsError) {
        console.warn(`Google Sheet fetch failed for ${year}, forcing local backup...`, gsError);

        // FALLBACK 2: Local data.xlsx
        try {
            const response = await fetch('/data.xlsx');
            if (!response.ok) throw new Error("Local file not found");
            const buffer = await response.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });

            // Resolve Sheet Name: "25-26" -> "25-26", etc.
            // If year is not found, try finding closely matching sheet
            let sheetName: string = year;
            if (!workbook.Sheets[sheetName]) {
                // Try fuzzy match or default
                const foundSheet = workbook.SheetNames.find(n => n.includes('25') && n.includes('26'));
                if (year === '25-26') sheetName = foundSheet || workbook.SheetNames[0];
                else sheetName = workbook.SheetNames[0];
            }

            const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
            console.log(`📂 Loaded ${year} from Local Backup (${rawData.length} rows)`);

            const now = new Date();
            // Mappings for Excel (usually match CSV but let's be safe)
            const mappings = {
                date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
                party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
                dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR']
            };

            const firstRow = rawData[0] || {};
            const fieldMap: Record<string, string> = {};
            Object.entries(mappings).forEach(([key, possibleKeys]) => {
                const found = Object.keys(firstRow).find(f =>
                    possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
                );
                if (found) fieldMap[key] = found;
            });

            return rawData.map((row, i) => processRow(row, fieldMap, i, now));

        } catch (localError) {
            console.error("Critical: All data sources failed", localError);
            return [];
        }
    }
}
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxo_Your_Script_ID/exec';

export async function updateLedgerEntry(invoiceNo: string, newStatus: string, year: string): Promise<boolean> {
    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requires no-cors sometimes or handles it via redirect
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                invoiceNo: invoiceNo,
                status: newStatus,
                year: year
            })
        });

        // Since we use no-cors, we can't see the response body, 
        // but we can assume success if no error is thrown.
        return true;
    } catch (error) {
        console.error("Update failed:", error);
        return false;
    }
}

function fetchAllYearsData(ignoreCache = false): Promise<LedgerEntry[]> {
    const years = Object.keys(YEAR_GIDS) as (keyof typeof YEAR_GIDS)[];
    return Promise.all(years.map(year => fetchLedgerData(year, ignoreCache))).then(res => res.flat());
}
