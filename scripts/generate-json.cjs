
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Convert Excel Serial Date to dd/mm/yyyy
function formatExcelDate(value) {
    if (!value) return '';

    // If it's already a string with separators, return it
    if (typeof value === 'string' && (value.includes('/') || value.includes('-') || value.includes('.'))) {
        return value;
    }

    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        const d = String(date.d).padStart(2, '0');
        const m = String(date.m).padStart(2, '0');
        const y = date.y;
        return `${d}/${m}/${y}`;
    }

    return String(value);
}

function getSearchString(row, fieldMap) {
    const invoiceNo = String(row[fieldMap.invoiceNo] || '');
    const party = String(row[fieldMap.party] || '');
    const mobileNo = String(row[fieldMap.mobileNo] || '');
    const narration = String(row[fieldMap.narration] || '');
    const amount = String(row[fieldMap.amount] || '');
    return `${invoiceNo} ${party} ${mobileNo} ${narration} ${amount}`.toLowerCase();
}

function convertExcelToSplitJson() {
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile(EXCEL_FILE, { cellDates: false });

    const mappings = {
        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR']
    };

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
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
                const parts = dateStr.includes('-') ? dateStr.split('-') : dateStr.includes('.') ? dateStr.split('.') : dateStr.split('/');
                if (parts.length === 3) {
                    // Check if it's yyyy/mm/dd (less likely) or dd/mm/yyyy
                    let d, m, y;
                    if (parts[0].length === 4) {
                        y = parseInt(parts[0]);
                        m = parseInt(parts[1]) - 1;
                        d = parseInt(parts[2]);
                    } else {
                        d = parseInt(parts[0]);
                        m = parseInt(parts[1]) - 1;
                        y = parseInt(parts[2]);
                    }

                    const dateObj = new Date(y, m, d);
                    if (!isNaN(dateObj.getTime())) {
                        timestamp = dateObj.getTime();
                        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        monthYear = `${months[m]} ${y}`;
                    }
                }
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
