
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const EXCEL_FILE = path.join(process.cwd(), 'public', 'data.xlsx');
const JSON_OUTPUT = path.join(process.cwd(), 'public', 'data', 'ledger.json');

function convertExcelToJson() {
    console.log("Reading Excel file...");
    const workbook = XLSX.readFile(EXCEL_FILE);

    const output = {};

    workbook.SheetNames.forEach(sheetName => {
        // We only care about year sheets like "25-26", "24-25" etc.
        // But for safety, let's include all.
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        output[sheetName] = jsonData;
        console.log(`Processed sheet: ${sheetName} (${jsonData.length} rows)`);
    });

    console.log("Writing JSON...");
    fs.writeFileSync(JSON_OUTPUT, JSON.stringify(output, null, 2));
    console.log(`Done! Saved to ${JSON_OUTPUT}`);
}

convertExcelToJson();
