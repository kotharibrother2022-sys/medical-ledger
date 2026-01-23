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

export async function fetchLedgerData(year: FinancialYear = '25-26'): Promise<LedgerEntry[]> {
    if (year === 'ALL_TIME') return fetchAllYearsData();

    const gid = YEAR_GIDS[year as keyof typeof YEAR_GIDS];
    const url = `${SHEET_BASE_URL}&gid=${gid}&_t=${Date.now()}`;

    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            worker: true, // Enable web worker
            complete: (results) => {
                // Optimize: Map headers once
                const fields = results.meta.fields || [];
                const fieldMap: Record<string, string> = {};

                const mappings = {
                    date: ['DATE'],
                    comment: ['COMMENT'],
                    colour: ['COLOUR'],
                    sNo: ['S.NO.', 's.no.'],
                    invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
                    party: ['PARTY', 'name', 'party'],
                    amount: ['AMOUNT'],
                    narration: ['NARRATION'],
                    dueDays: ['DUE DAYS'],
                    mobileNo: ['MOBILE NO.']
                };

                // Find actual keys in the CSV
                Object.entries(mappings).forEach(([key, possibleKeys]) => {
                    const found = fields.find(f =>
                        possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
                    );
                    if (found) fieldMap[key] = found;
                });

                const data = results.data.map((row: any, index: number) => {
                    const getValue = (key: string) => fieldMap[key] ? row[fieldMap[key]] : undefined;

                    const dateStr = getValue('date') || '';
                    let dueDays = 0;
                    let timestamp = 0;
                    let monthYear = '';

                    if (dateStr) {
                        try {
                            const parsedDate = parse(dateStr.replace(/-/g, '/'), 'dd/MM/yyyy', new Date());
                            if (!isNaN(parsedDate.getTime())) {
                                timestamp = parsedDate.getTime();
                                monthYear = format(parsedDate, 'MMMM yyyy');
                                dueDays = differenceInDays(new Date(), parsedDate);
                            }
                        } catch (e) {
                            // Silent fail for speed
                        }
                    }

                    return {
                        sNo: getValue('sNo') || String(index + 1),
                        invoiceNo: getValue('invoiceNo') || '',
                        date: dateStr,
                        party: getValue('party') || '',
                        amount: parseFloat(String(getValue('amount') || '0').replace(/,/g, '')),
                        narration: getValue('narration') || '',
                        dueDays: parseInt(String(getValue('dueDays') || dueDays)),
                        mobileNo: getValue('mobileNo') || '',
                        comment: getValue('comment') || '',
                        colour: getValue('colour') || '',
                        timestamp,
                        monthYear,
                        searchString: `${getValue('invoiceNo') || ''} ${getValue('party') || ''} ${getValue('mobileNo') || ''} ${getValue('narration') || ''} ${getValue('amount') || ''}`.toLowerCase()
                    };
                });
                resolve(data);
            },
            error: (error) => reject(error),
        });
    });
}
export async function fetchAllYearsData(): Promise<LedgerEntry[]> {
    const years = Object.keys(YEAR_GIDS) as (keyof typeof YEAR_GIDS)[];
    const allData = await Promise.all(years.map(year => fetchLedgerData(year)));
    return allData.flat();
}
