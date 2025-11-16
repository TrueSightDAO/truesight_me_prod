#!/usr/bin/env node

/**
 * Merge data from both CSV files and upload to Google Sheets
 * This ensures all fields from both versions are included
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
        // Escaped quote
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

      // End of field and row
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

  // Handle last field
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f.trim())) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];

  // First row is headers
  const headers = rows[0].map(h => h.replace(/^"|"$/g, '').trim());
  const dataRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = (rows[i][idx] || '').replace(/^"|"$/g, '').trim();
    });
    dataRows.push(row);
  }

  return { headers, dataRows };
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

// Merge two shipment objects, preferring non-empty values
function mergeShipments(oldShipment, newShipment) {
  const merged = { ...oldShipment };
  
  // Get all unique keys from both
  const allKeys = new Set([...Object.keys(oldShipment), ...Object.keys(newShipment)]);
  
  allKeys.forEach(key => {
    const oldVal = oldShipment[key] || '';
    const newVal = newShipment[key] || '';
    
    // Special handling for google_map_url: prefer old (original CSV) if it's more complete
    if (key === 'google_map_url' || key === 'google_map_image') {
      // Prefer old value if it exists and is not empty, as it's more complete
      if (oldVal && oldVal.trim()) {
        merged[key] = oldVal;
      } else if (newVal && newVal.trim()) {
        merged[key] = newVal;
      } else {
        merged[key] = '';
      }
    } else {
      // For other fields, prefer new value if old is empty, otherwise prefer old (but allow new to override if both exist)
      // For most fields, prefer the new CSV value, but keep old values if new is empty
      if (newVal && newVal.trim()) {
        merged[key] = newVal;
      } else if (oldVal && oldVal.trim()) {
        merged[key] = oldVal;
      } else {
        merged[key] = '';
      }
    }
  });
  
  return merged;
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

async function mergeAndUpload() {
  console.log('🔄 Merging CSV files and uploading to Google Sheets...\n');
  
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
    // Read and parse both CSV files
    const oldCsvPath = path.join(__dirname, '../assets/raw/shipments_collection.csv');
    const newCsvPath = path.join(__dirname, '../assets/raw/Agroverse+Shipments_new.csv');
    
    console.log('📖 Reading CSV files...');
    const oldCsvContent = fs.readFileSync(oldCsvPath, 'utf-8');
    const newCsvContent = fs.readFileSync(newCsvPath, 'utf-8');
    
    const oldData = parseCSV(oldCsvContent);
    const newData = parseCSV(newCsvContent);
    
    console.log(`   Old CSV: ${oldData.dataRows.length} shipments, ${oldData.headers.length} columns`);
    console.log(`   New CSV: ${newData.dataRows.length} shipments, ${newData.headers.length} columns`);
    
    // Create a map of shipments by contract number
    const shipmentMap = new Map();
    
    // First, add all old shipments
    oldData.dataRows.forEach(shipment => {
      const key = (shipment.shipment_contract_number || '').toUpperCase();
      if (key) {
        shipmentMap.set(key, shipment);
      }
    });
    
    // Then merge with new shipments
    newData.dataRows.forEach(shipment => {
      const key = (shipment.shipment_contract_number || '').toUpperCase();
      if (key) {
        const existing = shipmentMap.get(key);
        if (existing) {
          // Merge existing with new
          shipmentMap.set(key, mergeShipments(existing, shipment));
        } else {
          // New shipment
          shipmentMap.set(key, shipment);
        }
      }
    });
    
    const mergedShipments = Array.from(shipmentMap.values());
    console.log(`\n✅ Merged ${mergedShipments.length} unique shipments`);
    
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
    
    // Check if headers need to be updated
    await sheet.loadHeaderRow();
    const currentHeaders = sheet.headerValues || [];
    
    // Check if we need to add new columns
    const missingHeaders = headers.filter(h => !currentHeaders.includes(h));
    
    if (missingHeaders.length > 0) {
      console.log(`📝 Adding ${missingHeaders.length} new column(s): ${missingHeaders.join(', ')}`);
      
      // Try to set the full header row (this will auto-expand the sheet if possible)
      try {
        await sheet.setHeaderRow(headers);
        console.log('✅ Headers updated with new columns');
      } catch (error) {
        if (error.message && error.message.includes('not large enough')) {
          // If the sheet is too small, try to add columns using batch update
          console.log('⚠️  Sheet needs more columns. Attempting to add columns...');
          
          try {
            // Use the raw API to add columns
            let google;
            try {
              google = require('googleapis');
            } catch (e) {
              // Try installing googleapis if not available
              console.log('   Installing googleapis package...');
              const { execSync } = require('child_process');
              execSync('npm install googleapis', { cwd: __dirname + '/..', stdio: 'inherit' });
              google = require('googleapis');
            }
            
            const { JWT: GoogleJWT } = require('google-auth-library');
            const auth = new GoogleJWT({
              email: credentials.client_email,
              key: credentials.private_key,
              scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });
            
            const sheets = google.sheets({ version: 'v4', auth });
            const columnsToAdd = missingHeaders.length;
            
            // Insert columns at the end
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: CONFIG.spreadsheetId,
              requestBody: {
                requests: [{
                  insertDimension: {
                    range: {
                      sheetId: sheet.sheetId,
                      dimension: 'COLUMNS',
                      startIndex: currentHeaders.length,
                      endIndex: currentHeaders.length + columnsToAdd
                    },
                    inheritFromBefore: false
                  }
                }]
              }
            });
            
            console.log(`✅ Added ${columnsToAdd} column(s) to sheet`);
            
            // Now set the headers
            await sheet.setHeaderRow(headers);
            console.log('✅ Headers updated');
          } catch (apiError) {
            console.log('⚠️  Could not automatically add columns:', apiError.message);
            console.log(`   Required columns: ${headers.length}`);
            console.log(`   Current columns: ${currentHeaders.length}`);
            console.log(`   Missing columns: ${missingHeaders.join(', ')}`);
            console.log('   Attempting to write headers directly to cells...');
            
            // Try writing headers directly to cells beyond current range
            try {
              // Use the raw API for this
              const { google } = require('googleapis');
              const { JWT: GoogleJWT } = require('google-auth-library');
              const auth = new GoogleJWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
              });
              const sheets = google.sheets({ version: 'v4', auth });
              
              // Update the header row
              await sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG.spreadsheetId,
                range: `${CONFIG.sheetName}!1:1`,
                valueInputOption: 'RAW',
                resource: {
                  values: [headers]
                }
              });
              
              console.log('✅ Headers written directly to sheet');
            } catch (writeError) {
              console.log('   Could not write headers. Please manually add columns in Google Sheets.');
              console.log('   Continuing with existing headers...');
            }
          }
        } else {
          throw error;
        }
      }
    } else if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) {
      // Headers exist but in different order or different values
      try {
        await sheet.setHeaderRow(headers);
        console.log('✅ Headers updated');
      } catch (error) {
        console.log('⚠️  Could not update headers:', error.message);
        console.log('   Continuing with existing headers...');
      }
    } else {
      console.log('✅ Headers already match');
    }
    
    // Load existing rows to preserve values
    await sheet.loadHeaderRow();
    const existingRows = await sheet.getRows();
    const existingShipmentsMap = new Map();
    
    existingRows.forEach(row => {
      const shipmentId = (row.get('Shipment ID') || '').toUpperCase();
      if (shipmentId) {
        existingShipmentsMap.set(shipmentId, row);
      }
    });
    
    console.log(`📋 Found ${existingShipmentsMap.size} existing shipments in sheet`);
    
    // Process each merged shipment
    let updatedCount = 0;
    let addedCount = 0;
    
    for (const shipment of mergedShipments) {
      const shipmentId = (shipment.shipment_contract_number || '').toUpperCase();
      if (!shipmentId) continue;
      
      const newRowData = mapShipmentToRow(shipment);
      const existingRow = existingShipmentsMap.get(shipmentId);
      
      if (existingRow) {
        // Update existing row, but preserve non-empty values
        let hasChanges = false;
        
        for (const [key, newValue] of Object.entries(newRowData)) {
          const currentValue = existingRow.get(key) || '';
          
          // Special handling for Is Cacao Shipment and Serialized - always update from CSV if value exists
          if ((key === 'Is Cacao Shipment' || key === 'Serialized') && newValue && newValue.trim() !== '') {
            // Only update if current is empty, to preserve manual edits
            if (!currentValue || currentValue.trim() === '') {
              existingRow.set(key, newValue);
              hasChanges = true;
            }
          } else {
            // For other fields, only update if current value is empty and new value is not empty
            if ((!currentValue || currentValue.trim() === '') && newValue && newValue.trim() !== '') {
              existingRow.set(key, newValue);
              hasChanges = true;
            }
          }
        }
        
        if (hasChanges) {
          await existingRow.save();
          updatedCount++;
        }
      } else {
        // Add new row
        await sheet.addRow(newRowData);
        addedCount++;
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updatedCount} existing shipments (only empty fields)`);
    console.log(`   Added: ${addedCount} new shipments`);
    
    console.log('\n✅ Successfully merged and uploaded all shipments to "Shipment Ledger Listing"');
    console.log(`🔗 Sheet URL: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit#gid=${sheet.sheetId}`);
    
  } catch (error) {
    console.error('❌ Error merging and uploading:', error);
    throw error;
  }
}

mergeAndUpload();

