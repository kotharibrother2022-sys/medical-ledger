
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Convert Excel Serial Date to DD Mon YYYY (e.g., 01 Apr 2025)
// Helper to format any date input into DD MMM YYYY
function formatExcelDate(value) {
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
        } catch (e) { /* ignore */ }
    }

    // Handle existing string formats
    if (typeof value === 'string') {
        let normalizedDate = value.replace(/[-.]/g, '/');
        // Title case the month part if it's text-based (e.g., 1/APR/2025 -> 1/Apr/2025)
        normalizedDate = normalizedDate.split('/').map(part => {
            if (/^[a-z]{3,}$/i.test(part)) {
                return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            }
            return part;
        }).join('/');

        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Try to parse DD/MM/YYYY or D/M/YYYY
        const parts = normalizedDate.split('/');
        if (parts.length === 3) {
            let d = parseInt(parts[0]);
            let m = -1;
            let y = parseInt(parts[2]);

            // check if month is text or number
            if (isNaN(parts[1])) {
                m = monthsShort.findIndex(ms => ms === parts[1]);
            } else {
                m = parseInt(parts[1]) - 1;
            }

            if (m >= 0 && m < 12 && !isNaN(d) && !isNaN(y)) {
                if (y < 100) y += 2000;
                return `${String(d).padStart(2, '0')} ${monthsShort[m]} ${y}`;
            }
        }
    }

    return String(value);
}

function getSearchString(row, fieldMap) {
    const invoiceNo = String(row[fieldMap.invoiceNo] || '');
    const party = String(row[fieldMap.party] || '');
    const mobileNo = String(row[fieldMap.mobileNo] || '');
    const narration = String(row[fieldMap.narration] || '');
    const amount = String(row[fieldMap.amount] || '');
    return `${invoiceNo} ${party} ${mobileNo} ${narration} ${amount} ${!narration ? 'blank' : ''}`.toLowerCase();
}

function convertExcelToSplitJson() {
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile(EXCEL_FILE, { cellDates: false });

    const mappings = {
        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR'],
        dueDate: ['DUE DATE', 'due date', 'DUEDATE', 'DUE DATES', 'due dates']
    };

    workbook.SheetNames.forEach(name => {
        let sheetName = name;
        // Automatic mapping: If it's a CSV or single-sheet file named Sheet1, map it to 25-26
        if (sheetName === 'Sheet1' && workbook.SheetNames.length === 1) {
            sheetName = '25-26';
        }

        const worksheet = workbook.Sheets[name];
        // Use raw: true to get the numbers for serial dates, then we convert manually
        const rawData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
        if (rawData.length === 0) return;

        const firstRow = rawData[0];
        const fieldMap = {};
        Object.entries(mappings).forEach(([key, possibleKeys]) => {
            const found = Object.keys(firstRow).find(f =>
                possibleKeys.some(pk => f.trim().toLowerCase() === pk.trim().toLowerCase())
            );
            if (found) fieldMap[key] = found;
        });

        // Pre-process rows for speed
        const processedData = rawData.map((row, i) => {
            const rawDate = row[fieldMap.date];
            const dateStr = formatExcelDate(rawDate);

            let timestamp = 0;
            let monthYear = '';

            if (dateStr) {
                try {
                    // Handle "DD Mon YYYY" format (e.g., "01 Apr 2025")
                    const parts = dateStr.split(' ');

                    if (parts.length === 3) {
                        const d = parseInt(parts[0]);
                        const monthMap = {
                            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                            'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                        };
                        const m = monthMap[parts[1].toLowerCase()];
                        const y = parseInt(parts[2]);

                        if (m !== undefined && !isNaN(d) && !isNaN(y)) {
                            const dateObj = new Date(y, m, d);
                            if (!isNaN(dateObj.getTime())) {
                                timestamp = dateObj.getTime();
                                const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                                monthYear = `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
                            }
                        }
                    }
                } catch (e) { console.error(`Error parsing date ${dateStr}:`, e); }
            }

            return {
                sNo: String(row[fieldMap.sNo] || (i + 1)),
                invoiceNo: String(row[fieldMap.invoiceNo] || ''),
                date: dateStr,
                party: String(row[fieldMap.party] || ''),
                amount: parseFloat(String(row[fieldMap.amount] || '0').replace(/,/g, '')),
                narration: String(row[fieldMap.narration] || ''),
                dueDays: parseInt(row[fieldMap.dueDays] || 0),
                mobileNo: String(row[fieldMap.mobileNo] || ''),
                comment: String(row[fieldMap.comment] || ''),
                colour: String(row[fieldMap.colour] || ''),
                dueDate: formatExcelDate(row[fieldMap.dueDate]) || '',
                timestamp,
                monthYear,
                searchString: getSearchString(row, fieldMap)
            };
        });

        // Sanitize filename
        let safeName = sheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (sheetName === '25-26') {
            safeName = '2526';
        }
        const outputPath = path.join(DATA_DIR, `ledger-${safeName}.json`);

        console.log(`Writing ${sheetName} (${processedData.length} rows) to ${outputPath}...`);
        fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 0));
    });

    console.log("Done splitting and pre-processing files!");
}

convertExcelToSplitJson();
