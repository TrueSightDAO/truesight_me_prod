#!/usr/bin/env node

/**
 * Update the Shipment Image and Description cells for AGL15 in the Shipment Ledger Listing sheet.
 * Uses google-service-account.json for authentication.
 */

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  spreadsheetId: '1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU',
  sheetName: 'Shipment Ledger Listing',
};

const AGL15_IMAGE_URL = 'https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/agl15.avif';
const AGL15_DESCRIPTION = 'Operational fund for cacao procurement, production, freighting, domestic USA shipping, and vehicle gasoline for USA retailers consignment network expansion.';

async function updateAgl15ShipmentImage() {
  const credentialsPath = path.join(__dirname, '../google-service-account.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ No Google service account credentials found at:', credentialsPath);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

  const doc = new GoogleSpreadsheet(CONFIG.spreadsheetId, new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  }));

  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[CONFIG.sheetName];
  if (!sheet) {
    console.error('❌ Sheet "' + CONFIG.sheetName + '" not found');
    process.exit(1);
  }

  await sheet.loadHeaderRow();
  const rows = await sheet.getRows();

  // Column A (index 0) = Shipment ID, Column E (index 4) = Shipment Image
  const agl15Row = rows.find((r) => {
    const id = r._rawData && r._rawData[0];
    return id && String(id).trim().toUpperCase() === 'AGL15';
  });

  if (!agl15Row) {
    console.error('❌ AGL15 row not found in Shipment Ledger Listing');
    process.exit(1);
  }

  agl15Row.set('Shipment Image', AGL15_IMAGE_URL);
  agl15Row.set('Description', AGL15_DESCRIPTION);
  await agl15Row.save();

  console.log('✅ Updated AGL15 Shipment Image and Description');
}

updateAgl15ShipmentImage().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
