
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const DATA_DIR = path.join(process.cwd(), 'public', 'data');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function convertExcelToSplitJson() {
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile(EXCEL_FILE);

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Sanitize filename
        const safeName = sheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const outputPath = path.join(DATA_DIR, `ledger-${safeName}.json`);

        console.log(`Writing ${sheetName} (${jsonData.length} rows) to ${outputPath}...`);
        fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 0)); // No spaces to save size
    });

    console.log("Done splitting files!");
}

convertExcelToSplitJson();
