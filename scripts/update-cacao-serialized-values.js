#!/usr/bin/env node

/**
 * Force update Is Cacao Shipment and Serialized values from CSV to Google Sheets
 */

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  spreadsheetId: '1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU',
  sheetName: 'Shipment Ledger Listing',
  serviceAccountEmail: 'agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com'
};

// Parse CSV (same as merge script)
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i += 2;
        continue;
      } else {
        inQuotes = !inQuotes;
        i++;
        continue;
      }
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 2;
      } else {
        i++;
      }
      currentRow.push(currentField);
      if (currentRow.length > 0 && currentRow.some(f => f.trim())) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += char;
    i++;
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
  const dataRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (rows[i][idx] || '').replace(/^"|"$/g, '').trim();
    });
    dataRows.push(row);
  }

  return dataRows;
}

async function updateValues() {
  console.log('🔄 Updating Is Cacao Shipment and Serialized values...\n');
  
  const credentialsPath = path.join(__dirname, '../google-service-account.json');
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  
  // Read CSV
  const csvPath = path.join(__dirname, '../assets/raw/Agroverse+Shipments_new.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const shipments = parseCSV(csvContent);
  
  console.log(`📊 Loaded ${shipments.length} shipments from CSV`);
  
  // Connect to Google Sheets
  const doc = new GoogleSpreadsheet(CONFIG.spreadsheetId, new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }));
  
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[CONFIG.sheetName];
  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();
  
  console.log(`📋 Found ${rows.length} shipments in Google Sheet\n`);
  
  let updatedCount = 0;
  
  for (const csvShipment of shipments) {
    const shipmentId = (csvShipment.shipment_contract_number || '').toUpperCase();
    if (!shipmentId) continue;
    
    const row = rows.find(r => {
      const id = (r.get('Shipment ID') || '').toUpperCase();
      return id === shipmentId;
    });
    
    if (!row) {
      console.log(`⚠️  ${shipmentId} not found in sheet`);
      continue;
    }
    
    const isCacao = csvShipment.is_cacao_shipment || '';
    const serialized = csvShipment.serialized || '';
    
    let hasChanges = false;
    
    if (isCacao && isCacao.trim() !== '') {
      row.set('Is Cacao Shipment', isCacao);
      hasChanges = true;
      console.log(`  ${shipmentId}: is_cacao_shipment = ${isCacao}`);
    }
    
    if (serialized && serialized.trim() !== '') {
      row.set('Serialized', serialized);
      hasChanges = true;
      console.log(`  ${shipmentId}: serialized = ${serialized}`);
    }
    
    if (hasChanges) {
      await row.save();
      updatedCount++;
    }
  }
  
  console.log(`\n✅ Updated ${updatedCount} shipments`);
}

updateValues().catch(console.error);

