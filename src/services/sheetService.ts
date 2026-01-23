import Papa from 'papaparse';
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

export const CACHE_VERSION = 'v2'; // Bump this to clear old incompatible caches

export const YEAR_GIDS = {
    '25-26': '1390916342', // Current
    '24-25': '690241724',
    '23-24': '1039176913',
    '22-23': '983509982',
} as const;

export type FinancialYear = keyof typeof YEAR_GIDS | 'ALL_TIME';

const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQmnzleOlhV7JbCWGpDNtfK25POYM2ENCS4hQkIog1n3olh-TTzjPg9XSq4ox5ovA/pub?output=csv';

const GITHUB_JSON_URL = '/data/ledger.json';

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

export async function fetchLedgerData(year: FinancialYear = '25-26'): Promise<LedgerEntry[]> {
    if (year === 'ALL_TIME') return fetchAllYearsData();

    // Strategy: First try fetching from our lightning-fast GitHub JSON store
    try {
        const response = await fetch(`${GITHUB_JSON_URL}?t=${Date.now()}`);
        if (response.ok) {
            const allStore = await response.json();
            const yearSheetName = year === '25-26' ? '25-26' : year; // Adjust if sheet names differ from year codes
            const rawData = allStore[yearSheetName] || allStore[year];

            if (rawData && Array.isArray(rawData)) {
                console.log(`⚡ Loaded ${year} from GitHub JSON store`);
                const now = new Date();

                // Mappings for JSON mode (usually same as CSV headers)
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
        console.warn("GitHub store not available, falling back to Google Sheets", e);
    }

    // FALLBACK: Slow direct Google Sheets CSV fetch
    const gid = YEAR_GIDS[year as keyof typeof YEAR_GIDS];
    const url = `${SHEET_BASE_URL}&gid=${gid}&_t=${Date.now()}`;

    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true, header: true, skipEmptyLines: true, worker: true,
            complete: (results) => {
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
                resolve(results.data.map((row, i) => processRow(row, fieldMap, i, now)));
            },
            error: (error) => reject(error),
        });
    });
}
function fetchAllYearsData(): Promise<LedgerEntry[]> {
    const years = Object.keys(YEAR_GIDS) as (keyof typeof YEAR_GIDS)[];
    return Promise.all(years.map(year => fetchLedgerData(year))).then(res => res.flat());
}
