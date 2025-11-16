#!/usr/bin/env node

/**
 * Populate Google Sheet "Performance Statistics" tab with data from Wix ExchangeRate collection
 * 
 * Usage:
 *   node scripts/populatePerformanceStatistics.js
 * 
 * Requires .env file with:
 *   WIX_API_KEY=...
 *   WIX_SITE_ID=... (optional, defaults to TrueSight DAO)
 *   WIX_ACCOUNT_ID=... (optional, defaults to TrueSight DAO)
 * 
 * Requires google-service-account.json file in project root
 */

require("dotenv").config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.WIX_API_KEY;
const SITE_ID = process.env.WIX_SITE_ID || "d45a189f-d0cc-48de-95ee-30635a95385f";
const ACCOUNT_ID = process.env.WIX_ACCOUNT_ID || "0e2cde5f-b353-468b-9f4e-36835fc60a0e";

if (!API_KEY) {
  console.error("❌ Missing WIX_API_KEY in .env file.");
  process.exit(1);
}

const WIX_BASE_URL = "https://www.wixapis.com/wix-data/v2";
const WIX_HEADERS = {
  Authorization: API_KEY,
  "Content-Type": "application/json",
  "wix-site-id": SITE_ID,
  "wix-account-id": ACCOUNT_ID,
};

const CONFIG = {
  spreadsheetId: '1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU',
  sheetName: 'Performance Statistics',
  serviceAccountEmail: 'agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com'
};

// Exchange rate keys that should be synced to Performance Statistics
const EXCHANGE_RATE_KEYS = [
  "USDC_EXCHANGE_RATE_RAYDIUM",
  "USD_TREASURY_YIELD_1_MONTH",
  "TDG_DAILY_BUY_BACK_BUDGET",
  "PAST_30_DAYS_SALES",
  "ASSET_PER_TDG_ISSUED",
  "GAS_FEE",
  "TDG_PER_USD_CONTRIBUTION",
  "TDG_PER_HOUR_CONTRIBUTION",
  "TDG_ISSUED",
  "USD_TREASURY_BALANCE",
  "USDT_EXCHANGE_RATE_LATOKENS"
];

/**
 * Query all items from Wix ExchangeRate collection
 */
async function queryWixExchangeRateCollection() {
  console.log("💱 Fetching ExchangeRate collection from Wix...");
  
  const url = `${WIX_BASE_URL}/items/query?dataCollectionId=ExchangeRate`;
  const body = {
    query: {
      paging: { limit: 1000, offset: 0 },
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: WIX_HEADERS,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`Failed to query ExchangeRate collection (${response.status}): ${error.message || response.statusText}`);
  }

  const payload = await response.json();
  const items = payload.dataItems || payload.items || [];
  
  console.log(`   ✅ Found ${items.length} items in ExchangeRate collection`);
  
  // Build object keyed by description (matching EXCHANGE_RATE_KEYS)
  const exchangeRates = {};
  
  items.forEach((item) => {
    const data = item.data || item;
    const key = data.description;
    
    if (key && EXCHANGE_RATE_KEYS.includes(key)) {
      exchangeRates[key] = {
        id: data._id || item.id || item._id || null,
        description: data.description || key,
        exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : null,
        currency: data.currency || null,
        updatedDate: data.updatedDate || data._updatedDate || item.updatedDate || item._updatedDate || null,
        createdDate: data.createdDate || data._createdDate || item.createdDate || item._createdDate || null,
      };
    }
  });
  
  console.log(`   ✅ Mapped ${Object.keys(exchangeRates).length} exchange rate keys`);
  
  return exchangeRates;
}

/**
 * Main function to populate Performance Statistics sheet
 */
async function populatePerformanceStatistics() {
  console.log("🚀 Populating Performance Statistics sheet...\n");
  
  // Load credentials
  const credentialsPath = path.join(__dirname, '../google-service-account.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ No Google service account credentials found at:', credentialsPath);
    console.error('   Please place your service account JSON file there.');
    process.exit(1);
  }
  
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  
  // Verify service account email matches
  if (credentials.client_email !== CONFIG.serviceAccountEmail) {
    console.warn(`⚠️  Warning: Service account email mismatch. Expected ${CONFIG.serviceAccountEmail}, got ${credentials.client_email}`);
  }
  
  try {
    // Fetch data from Wix
    const wixData = await queryWixExchangeRateCollection();
    
    if (Object.keys(wixData).length === 0) {
      console.warn("⚠️  No exchange rate data found in Wix collection");
      return;
    }
    
    // Connect to Google Sheets
    const doc = new GoogleSpreadsheet(CONFIG.spreadsheetId, new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    }));
    
    await doc.loadInfo();
    console.log(`📄 Connected to spreadsheet: ${doc.title}`);
    
    // Get or create the sheet
    let sheet = doc.sheetsByTitle[CONFIG.sheetName];
    if (!sheet) {
      console.log(`📝 Creating sheet: ${CONFIG.sheetName}`);
      sheet = await doc.addSheet({ title: CONFIG.sheetName });
    } else {
      console.log(`📝 Using existing sheet: ${CONFIG.sheetName}`);
    }
    
    // Always set up headers (in case sheet is empty or headers are missing)
    await sheet.setHeaderRow([
      'Key',
      'Description',
      'Exchange Rate / Value',
      'Currency',
      'Updated Date',
      'Last Synced'
    ]);
    
    // Format header row (optional - can be done manually in Google Sheets)
    try {
      await sheet.loadCells('A1:F1');
      for (let col = 0; col < 6; col++) {
        const cell = sheet.getCell(0, col);
        cell.backgroundColor = { red: 0.956, green: 0.639, blue: 0 };
        cell.textFormat = { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } };
      }
      await sheet.saveUpdatedCells();
      console.log(`   ✅ Formatted headers`);
    } catch (e) {
      console.log(`   ⚠️  Could not format headers (will work fine without formatting)`);
    }
    console.log(`   ✅ Set up headers`);
    
    // Prepare data for sheet (use keys in order)
    const now = new Date();
    const sheetData = [];
    
    EXCHANGE_RATE_KEYS.forEach((key) => {
      const item = wixData[key] || null;
      
      if (item) {
        // Safely parse date
        let updatedDateStr = '';
        if (item.updatedDate) {
          try {
            const date = new Date(item.updatedDate);
            if (!isNaN(date.getTime())) {
              updatedDateStr = date.toISOString();
            }
          } catch (e) {
            // Invalid date, leave empty
          }
        }
        
        sheetData.push({
          'Key': key,
          'Description': item.description || key,
          'Exchange Rate / Value': item.exchangeRate !== null && item.exchangeRate !== undefined ? item.exchangeRate : '',
          'Currency': item.currency || '',
          'Updated Date': updatedDateStr,
          'Last Synced': now.toISOString()
        });
        console.log(`   ✅ ${key}: ${item.exchangeRate !== null ? item.exchangeRate : 'null'}`);
      } else {
        // Key exists in our list but not found in Wix - add placeholder row
        sheetData.push({
          'Key': key,
          'Description': key,
          'Exchange Rate / Value': '',
          'Currency': '',
          'Updated Date': '',
          'Last Synced': now.toISOString()
        });
        console.log(`   ⚠️  ${key}: Not found in Wix collection (added placeholder)`);
      }
    });
    
    // Clear existing data (except header) - optional cleanup
    try {
      await sheet.loadHeaderRow();
      const rows = await sheet.getRows();
      if (rows.length > 0) {
        // Delete rows one by one (some versions of google-spreadsheet don't support deleteRows with count)
        for (let i = rows.length - 1; i >= 0; i--) {
          await rows[i].delete();
        }
        console.log(`   🗑️  Cleared ${rows.length} existing rows`);
      }
    } catch (e) {
      console.log(`   ⚠️  Could not clear existing rows (will add new rows anyway): ${e.message}`);
    }
    
    // Add new rows
    if (sheetData.length > 0) {
      await sheet.addRows(sheetData);
      console.log(`   ✅ Added ${sheetData.length} rows to sheet`);
      
      // Note: Date formatting can be done manually in Google Sheets if desired
      // The dates are stored as ISO strings which Google Sheets will recognize
    }
    
    console.log(`\n✅ Successfully populated Performance Statistics sheet!`);
    console.log(`   Sheet: ${CONFIG.sheetName}`);
    console.log(`   Rows: ${sheetData.length}`);
    
  } catch (error) {
    console.error('❌ Error populating Performance Statistics:', error);
    throw error;
  }
}

// Run the script
populatePerformanceStatistics()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });

