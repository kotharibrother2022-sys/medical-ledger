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
    dueDate?: string; // Due date for payment
    timestamp: number; // Pre-parsed date for fast filtering
    monthYear: string; // Pre-formatted month-year for fast month filtering
    searchString: string; // Pre-calculated lowercase string for fast search
    overdueDays?: number; // Days past due date (if available)
}

export const CACHE_VERSION = 'v20'; // Bumped for new data sync after excel update

export const YEAR_GIDS = {
    '25-26': '1390916342', // Current
    '24-25': '690241724',
    '23-24': '1039176913',
    '22-23': '983509982',
} as const;

export type FinancialYear = keyof typeof YEAR_GIDS | 'ALL_TIME';

const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQmnzleOlhV7JbCWGpDNtfK25POYM2ENCS4hQkIog1n3olh-TTzjPg9XSq4ox5ovA/pub?output=csv';


// Helper to format any date input into DD MMM YYYY
function formatDateForDisplay(value: any): string {
    if (!value) return '';

    // Handle Excel serial numbers (as string or number)
    if (!isNaN(value) && !String(value).includes('/') && !String(value).includes('-') && !String(value).includes('.')) {
        try {
            const date = XLSX.SSF.parse_date_code(parseFloat(value));
            const d = String(date.d).padStart(2, '0');
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const m = date.m - 1;
            const y = date.y;
            return `${d} ${months[m]} ${y}`;
        } catch { /* ignore */ }
    }

    // Handle existing string formats
    if (typeof value === 'string') {
        let normalizedDate = value.replace(/[-.]/g, '/');
        // Title case the month part if it's text-based
        normalizedDate = normalizedDate.split('/').map(part => {
            if (/^[a-z]{3,}$/i.test(part)) {
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }
            return part;
        }).join('/');

        const formats = [
            'dd/MM/yyyy', 'dd/MM/yy', 'd/M/yyyy', 'd/M/yy',
            'MM/dd/yyyy', 'yyyy/MM/dd',
            'dd/MMM/yyyy', 'd/MMM/yyyy',
            'dd/MMMM/yyyy', 'd/MMMM/yyyy',
            'dd MMM yyyy', 'd MMM yyyy'
        ];

        for (const f of formats) {
            const p = parse(normalizedDate, f, new Date());
            if (!isNaN(p.getTime()) && p.getFullYear() > 1900 && p.getFullYear() < 2100) {
                return format(p, 'dd MMM yyyy');
            }
        }
    }

    return String(value);
}

// Helper to process raw row into LedgerEntry
function processRow(row: Record<string, string | number>, fieldMap: Record<string, string>, index: number, now: Date): LedgerEntry {
    const rawDate = (fieldMap['date'] ? row[fieldMap['date']] : '') || '';
    const dateStr = formatDateForDisplay(rawDate);
    const rawDueDate = (fieldMap['dueDate'] ? row[fieldMap['dueDate']] : '') || '';
    const dueDateStr = formatDateForDisplay(rawDueDate);

    let dueDays = 0;
    let timestamp = 0;
    let monthYear = '';

    if (dateStr) {
        try {
            const parsedDate = parse(dateStr, 'dd MMM yyyy', now);
            if (!isNaN(parsedDate.getTime())) {
                timestamp = parsedDate.setHours(12, 0, 0, 0);
                monthYear = format(parsedDate, 'MMMM yyyy');
                dueDays = differenceInDays(now, parsedDate);
            }
        } catch { /* ignore */ }
    }

    let overdueDays: number | undefined = undefined;
    if (dueDateStr) {
        try {
            const parsedDueDate = parse(dueDateStr, 'dd MMM yyyy', now);
            if (!isNaN(parsedDueDate.getTime())) {
                overdueDays = differenceInDays(now, parsedDueDate);
            }
        } catch { /* ignore */ }
    }

    const entry: LedgerEntry = {
        sNo: String(row[fieldMap['sNo']] || index + 1),
        invoiceNo: String(row[fieldMap['invoiceNo']] || ''),
        date: dateStr,
        party: String(row[fieldMap['party']] || ''),
        amount: parseFloat(String(row[fieldMap['amount']] || '0').replace(/[₹,\s]/g, '')) || 0,
        narration: String(row[fieldMap['narration']] || ''),
        dueDays: isNaN(parseInt(String(row[fieldMap['dueDays']]))) ? dueDays : parseInt(String(row[fieldMap['dueDays']])),
        mobileNo: String(row[fieldMap['mobileNo']] || '').trim(),
        comment: String(row[fieldMap['comment']] || '').trim(),
        colour: String(row[fieldMap['colour']] || '').trim(),
        dueDate: dueDateStr,
        overdueDays,
        timestamp,
        monthYear,
        searchString: ''
    };

    // Pre-calculate lowercase search string once
    entry.searchString = `${entry.invoiceNo} ${entry.party} ${entry.mobileNo} ${entry.narration} ${entry.amount} ${!entry.narration ? 'blank' : ''}`.toLowerCase();
    return entry;
}

export async function fetchLedgerData(year: FinancialYear = '25-26', ignoreCache = false): Promise<LedgerEntry[]> {
    if (year === 'ALL_TIME') return fetchAllYearsData(ignoreCache);

    // Strategy: First try fetching from our lightning-fast split JSON store
    // BUT in Development, skip this to force live Sheet updates for easier debugging
    if (!ignoreCache && !import.meta.env.DEV) {
        try {
            // Construct filename: "25-26" -> "ledger-2526.json"
            let safeYear = year.replace(/-/g, '_').toLowerCase();
            if (year === '25-26') {
                safeYear = '2526';
            }

            const jsonUrl = `/data/ledger-${safeYear}.json`;
            console.log(`[SYNC] Checking JSON store: ${jsonUrl}`);
            const response = await fetch(`${jsonUrl}?t=${Date.now()}`);

            if (response.ok) {
                const rawData = await response.json();

                if (rawData && Array.isArray(rawData)) {
                    console.log(`⚡ [SYNC] Loaded ${year} from split JSON store (${jsonUrl})`);

                    // If the JSON is already pre-processed (has searchString), return it directly for extreme speed
                    if (rawData.length > 0 && (rawData[0] as LedgerEntry).searchString) {
                        const now = new Date();
                        // Update dueDays (Age) and overdueDays based on current date
                        return (rawData as LedgerEntry[]).map(entry => {
                            if (entry.timestamp) {
                                entry.dueDays = differenceInDays(now, new Date(entry.timestamp));
                            }

                            // Recalculate overdueDays if dueDate is present
                            if (entry.dueDate) {
                                try {
                                    // Parse "DD/MM/YYYY" or variants
                                    const formats = ['dd/MM/yyyy', 'dd/MM/yy', 'd/M/yyyy', 'd/M/yy', 'dd MMM yyyy'];
                                    let d = new Date(NaN);
                                    for (const f of formats) {
                                        const p = parse(entry.dueDate, f, now);
                                        if (!isNaN(p.getTime())) {
                                            d = p;
                                            break;
                                        }
                                    }

                                    if (!isNaN(d.getTime())) {
                                        entry.overdueDays = differenceInDays(now, d);
                                    }
                                } catch (e) { }
                            }

                            return entry;
                        });
                    }

                    // Fallback for non-processed JSON
                    const now = new Date();
                    const mappings = {
                        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.'],
                        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
                        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR'],
                        dueDate: ['DUE DATE', 'due date', 'DUEDATE', 'DUE DATES', 'due dates']
                    };

                    const firstRow = rawData[0] || {};
                    const fieldMap: Record<string, string> = {};
                    Object.entries(mappings).forEach(([key, possibleKeys]) => {
                        const found = Object.keys(firstRow).find(f =>
                            possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
                        );
                        if (found) fieldMap[key] = found;
                    });

                    return rawData.map((row, i) => processRow(row as Record<string, string | number>, fieldMap, i, now));
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
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Google Sheet fetch failed: ${response.status} ${response.statusText}`);
        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true, skipEmptyLines: true, worker: false,
                complete: (results) => {
                    const data = results.data as Record<string, string | number>[];
                    if (!data || data.length === 0 || (data.length > 0 && Object.values(data[0]).some(v => String(v).includes('#ERROR')))) {
                        reject(new Error("Google Sheet returned #ERROR! or empty data"));
                        return;
                    }

                    const fields = results.meta.fields || [];
                    const fieldMap: Record<string, string> = {};
                    const mappings = {
                        date: ['DATE'], sNo: ['S.NO.', 's.no.'],
                        invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.', 'INVOICE         NO. ', 'CHALLAN NO. ', 'INVOICE NO. '],
                        party: ['PARTY', 'name', 'party', 'NAME'],
                        amount: ['AMOUNT', 'amount'],
                        narration: ['NARRATION', 'narration'],
                        dueDays: ['DUE DAYS', 'due days'],
                        mobileNo: ['MOBILE NO.', 'mobile no.', 'MOBILE NO. '],
                        comment: ['COMMENT', 'comment'],
                        colour: ['COLOUR', 'colour'],
                        dueDate: ['DUE DATE', 'due date', 'DUEDATE', 'DUE DATES', 'due dates']
                    };

                    Object.entries(mappings).forEach(([key, possibleKeys]) => {
                        const found = fields.find(f => possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase()));
                        if (found) fieldMap[key] = found;
                    });

                    const now = new Date();
                    resolve(data.map((row, i) => processRow(row, fieldMap, i, now)));
                },
                error: (error: any) => reject(error),
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
                dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR'],
                dueDate: ['DUE DATE', 'due date', 'DUEDATE', 'DUE DATES', 'due dates']
            };

            const firstRow = rawData[0] || {};
            const fieldMap: Record<string, string> = {};
            Object.entries(mappings).forEach(([key, possibleKeys]) => {
                const found = Object.keys(firstRow).find(f =>
                    possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
                );
                if (found) fieldMap[key] = found;
            });

            return rawData.map((row, i) => processRow(row as Record<string, string | number>, fieldMap, i, now));

        } catch (localError) {
            console.error("Critical: All data sources failed", localError);
            return [];
        }
    }
}
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_O0Pd1bK4Tc1sm309_dMuvsfEfrd8PAHcfUdXqY29OloHwALtrMLDaW1dkFXi47OZKw/exec';

export function getTestUrl(year: string = '25-26') {
    return `${APPS_SCRIPT_URL}?invoice=TEST-PING&status=PING-OK&year=${year}`;
}

export async function updateLedgerEntry(invoiceNo: string, newStatus: string, year: string): Promise<boolean> {
    try {
        // We use GET because it's 훨씬 easier for users to test in a browser
        const url = `${APPS_SCRIPT_URL}?invoice=${encodeURIComponent(invoiceNo)}&status=${encodeURIComponent(newStatus)}&year=${encodeURIComponent(year)}`;

        await fetch(url, {
            method: 'GET',
            mode: 'no-cors' // Still use no-cors to bypass complex preflight checks
        });

        return true;
    } catch (error) {
        console.error("Update failed:", error);
        return false;
    }
}

export async function fetchAllYearsData(ignoreCache = false): Promise<LedgerEntry[]> {
    const years = Object.keys(YEAR_GIDS) as (keyof typeof YEAR_GIDS)[];
    return Promise.all(years.map(year => fetchLedgerData(year, ignoreCache))).then(res => res.flat());
}
