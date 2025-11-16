#!/usr/bin/env node

/**
 * Upload shipment data from CSV to Google Sheets "Shipment Ledger Listing" tab
 * Uses service account: agroverse-qr-code-manager@get-data-io
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

// Parse CSV handling multi-line fields (same as generate-shipment-pages.js)
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

// Helper to get image path (same as generate-shipment-pages.js)
function getImagePath(shipmentNumber) {
  if (!shipmentNumber) return '';
  const lower = shipmentNumber.toLowerCase();
  const ext = lower === 'agl7' ? 'gif' : 'avif';
  return `assets/shipments/${lower}.${ext}`;
}

// Helper to extract coordinates from Google Maps URL (same as generate-shipment-pages.js)
function extractCoordinates(mapUrl) {
  if (!mapUrl) return null;
  
  // First, try to extract from 3d-lat!4d-lng pattern (actual location coordinates)
  // This is more accurate than the @ pattern which is often the viewport center
  // Look for the last occurrence which is usually the most precise location
  const locationPattern = /3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/g;
  let locationMatch;
  let lastMatch = null;
  while ((locationMatch = locationPattern.exec(mapUrl)) !== null) {
    lastMatch = locationMatch;
  }
  if (lastMatch) {
    return {
      lat: parseFloat(lastMatch[1]),
      lng: parseFloat(lastMatch[2])
    };
  }
  
  // Try to extract from @lat,lng pattern (viewport center, but sometimes the actual location)
  const atPattern = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const atMatch = mapUrl.match(atPattern);
  if (atMatch) {
    return {
      lat: parseFloat(atMatch[1]),
      lng: parseFloat(atMatch[2])
    };
  }
  
  // Try to extract from query parameters (some URLs have ll=lat,lng)
  const llPattern = /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const llMatch = mapUrl.match(llPattern);
  if (llMatch) {
    return {
      lat: parseFloat(llMatch[1]),
      lng: parseFloat(llMatch[2])
    };
  }
  
  return null;
}

// Map CSV fields to Google Sheets columns
function mapShipmentToRow(shipment) {
  const shipmentNumber = shipment.shipment_contract_number || '';
  const imagePath = getImagePath(shipmentNumber);
  const imageUrl = imagePath 
    ? `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/${imagePath}`
    : '';
  
  // Extract coordinates from Google Maps URL
  const googleMapUrl = shipment.google_map_url || '';
  const coordinates = extractCoordinates(googleMapUrl);
  
  return {
    'Shipment ID': shipmentNumber,
    'Shipment Date': shipment.shipment_date ? new Date(shipment.shipment_date).toLocaleDateString('en-US') : '',
    'Status': shipment.shipment_status || '',
    'Description': (shipment.shipment_description || '').replace(/\n/g, ' ').substring(0, 200), // Truncate long descriptions
    'Shipment Image': imageUrl,
    'Cargo Size': shipment.cargo_size || '',
    'Cacao (kg)': shipment.cacao_kg || shipment.cargo_size || '',
    'Transaction Type': shipment.transaction_type || '',
    'Investment ROI': shipment.investment_roi || '',
    'Capital Injection': shipment.capital_injection || '',
    'Total Revenue': shipment.total_revenue || '',
    'Ledger URL': shipment.ledger_url || '',
    'Contract URL': shipment.contract_url || '',
    'FDA Prior Notice': shipment.fda_prior_notice || '',
    'Invoice URL': shipment.shipment_invoice_url || '',
    'Purchase Order URL': shipment.purchase_order_url || '',
    'Lab Report': shipment.lab_report || '',
    'Video Reel': shipment.video_reel || '',
    'TrueSight DAO URL': shipment.truesight_dao_shipment_url || '',
    'Trees to be Planted': shipment.trees_to_be_planted || '',
    'Google Maps URL': googleMapUrl,
    'Latitude': coordinates ? coordinates.lat.toString() : '',
    'Longitude': coordinates ? coordinates.lng.toString() : '',
    'Is Cacao Shipment': shipment.is_cacao_shipment || '',
    'Serialized': shipment.serialized || '',
    'Created Date': shipment['Created Date'] ? new Date(shipment['Created Date']).toLocaleDateString('en-US') : '',
    'Updated Date': shipment['Updated Date'] ? new Date(shipment['Updated Date']).toLocaleDateString('en-US') : ''
  };
}

async function uploadToGoogleSheets() {
  console.log('🚀 Uploading shipment data to Google Sheets...\n');
  
  // Load credentials
  const credentialsPath = path.join(__dirname, '../google-service-account.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ No Google service account credentials found at:', credentialsPath);
    console.error('   Please place your service account JSON file there.');
    return;
  }
  
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  
  // Verify service account email matches
  if (credentials.client_email !== CONFIG.serviceAccountEmail) {
    console.warn(`⚠️  Warning: Service account email mismatch. Expected ${CONFIG.serviceAccountEmail}, got ${credentials.client_email}`);
  }
  
  try {
    // Read and parse CSV
    const csvPath = path.join(__dirname, '../assets/raw/Agroverse+Shipments_new.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const shipments = parseCSV(csvContent);
    
    console.log(`📊 Parsed ${shipments.length} shipments from CSV`);
    
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
    
    // Define headers for Shipment Ledger Listing
    const headers = [
      'Shipment ID',
      'Shipment Date',
      'Status',
      'Description',
      'Shipment Image',
      'Cargo Size',
      'Cacao (kg)',
      'Transaction Type',
      'Investment ROI',
      'Capital Injection',
      'Total Revenue',
      'Ledger URL',
      'Contract URL',
      'FDA Prior Notice',
      'Invoice URL',
      'Purchase Order URL',
      'Lab Report',
      'Video Reel',
      'TrueSight DAO URL',
      'Trees to be Planted',
      'Google Maps URL',
      'Latitude',
      'Longitude',
      'Is Cacao Shipment',
      'Serialized',
      'Created Date',
      'Updated Date'
    ];
    
    // Set headers
    await sheet.setHeaderRow(headers);
    console.log('✅ Headers set');
    
    // Clear existing data (optional - comment out if you want to append)
    const existingRows = await sheet.getRows();
    if (existingRows.length > 0) {
      console.log(`🗑️  Clearing ${existingRows.length} existing rows...`);
      await sheet.clear();
      await sheet.setHeaderRow(headers);
    }
    
    // Map shipments to rows
    const rows = shipments.map(mapShipmentToRow);
    
    // Add rows to sheet
    console.log(`📤 Uploading ${rows.length} rows...`);
    await sheet.addRows(rows);
    
    console.log(`\n✅ Successfully uploaded ${rows.length} shipments to "${CONFIG.sheetName}"`);
    console.log(`🔗 Sheet URL: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit#gid=${sheet.sheetId}`);
    
  } catch (error) {
    console.error('❌ Error uploading to Google Sheets:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the upload
uploadToGoogleSheets();

