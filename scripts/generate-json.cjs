
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple normalization and search string generation matching App logic
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
    const workbook = XLSX.readFile(EXCEL_FILE);

    const mappings = {
        date: ['DATE'], sNo: ['S.NO.', 's.no.'], invoiceNo: ['INVOICE NO.', 'CHALLAN NO.', 'INVOICE         NO.'],
        party: ['PARTY', 'name', 'party'], amount: ['AMOUNT'], narration: ['NARRATION'],
        dueDays: ['DUE DAYS'], mobileNo: ['MOBILE NO.'], comment: ['COMMENT'], colour: ['COLOUR']
    };

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);
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
            const dateStr = String(row[fieldMap.date] || '');
            let timestamp = 0;
            let monthYear = '';

            if (dateStr) {
                const parts = dateStr.includes('-') ? dateStr.split('-') : dateStr.includes('.') ? dateStr.split('.') : dateStr.split('/');
                if (parts.length === 3) {
                    // Assume dd/mm/yyyy
                    const d = parseInt(parts[0]);
                    const m = parseInt(parts[1]) - 1;
                    const y = parseInt(parts[2]);
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
