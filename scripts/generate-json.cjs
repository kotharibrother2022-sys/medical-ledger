
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Convert Excel Serial Date to DD Mon YYYY (e.g., 01 Apr 2025)
// Convert Excel Serial Date to DD Mon YYYY (e.g., 01 Apr 2025)
function formatExcelDate(value) {
    if (!value) return '';

    // If it's a string that looks like a number (e.g. "45748"), convert it to number first
    if (!isNaN(value) && !String(value).includes('/') && !String(value).includes('-') && !String(value).includes('.')) {
        value = parseFloat(value);
    }

    // If it's already a string with separators, parse and reformat it
    if (typeof value === 'string' && (value.includes('/') || value.includes('-') || value.includes('.'))) {
        try {
            // Parse DD/MM/YYYY or similar formats
            const parts = value.replace(/[-.]/g, '/').split('/');
            if (parts.length === 3) {
                const d = parseInt(parts[0]);
                const m = parseInt(parts[1]) - 1; // 0-indexed
                const y = parseInt(parts[2]);
                const date = new Date(y, m, d);
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${String(d).padStart(2, '0')} ${months[m]} ${y}`;
            }
        } catch (e) {
            return value; // Return original if parsing fails
        }
    }

    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        const d = String(date.d).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = date.m - 1; // XLSX returns 1-indexed month
        const y = date.y;
        return `${d} ${months[m]} ${y}`;
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
        const safeName = sheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const outputPath = path.join(DATA_DIR, `ledger-${safeName}.json`);

        console.log(`Writing ${sheetName} (${processedData.length} rows) to ${outputPath}...`);
        fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 0));
    });

    console.log("Done splitting and pre-processing files!");
}

convertExcelToSplitJson();
