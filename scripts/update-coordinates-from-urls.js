#!/usr/bin/env node

/**
 * Update Google Sheets with coordinates extracted from specific Google Maps URLs
 * This script updates specific shipment entries with coordinates from the provided URLs
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

// Helper to extract coordinates from Google Maps URL
function extractCoordinates(mapUrl) {
  if (!mapUrl) return null;
  
  // First, try to extract from 3d-lat!4d-lng pattern (actual location coordinates)
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
  
  // Try to extract from @lat,lng pattern (viewport center)
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

// Shipment data from the snippet provided
const shipmentUpdates = [
  {
    id: 'AGL14',
    googleMapUrl: 'https://www.google.com/maps/place/14%C2%B003\'09.5%22S+39%C2%B026\'17.5%22W/@-17.6600337,-78.5775156,3.11z/data=!4m4!3m3!8m2!3d-14.0526389!4d-39.4381944?entry=tts&g_ep=EgoyMDI1MDkxNy4wIPu8ASoASAFQAw%3D%3D&skid=d9d16b90-47a3-4e3e-a3c9-470b69d8b266'
  },
  {
    id: 'AGL13',
    googleMapUrl: 'https://www.google.com/maps/place/14%C2%B019\'28.1%22S+39%C2%B000\'51.1%22W/@-14.3291178,-39.0166392,15z/data=!4m4!3m3!8m2!3d-14.324474!4d-39.014201?entry=tts&g_ep=EgoyMDI1MDkxMC4wIPu8ASoASAFQAw%3D%3D&skid=9d547f87-2baf-409a-bced-53caa645117f'
  },
  {
    id: 'AGL10',
    googleMapUrl: 'https://www.google.com/maps/place/Fazenda+Capela+Velha/@-14.6038568,-39.3950584,9.06z/data=!4m6!3m5!1s0x739035284534b29:0x1eff3c1d6135cc02!8m2!3d-14.6173663!4d-39.2711487!16s%2Fg%2F11fhqvl0dh!5m1!1e1?entry=tts&g_ep=EgoyMDI1MDYyMy4yIPu8ASoASAFQAw%3D%3D&skid=2bb09a83-97db-4a9c-a58a-dc42d88639bf'
  },
  {
    id: 'AGL6',
    googleMapUrl: 'https://www.google.com/maps/place/Fazenda+S%C3%A3o+Jorge/@-15.5466282,-65.2172061,3.94z/data=!4m6!3m5!1s0x738fda0117584df:0xbf46b82f369097e9!8m2!3d-14.6289989!4d-39.4028297!16s%2Fg%2F11j8q1c8d7!5m1!1e1?entry=ttu&g_ep=EgoyMDI1MDQyOS4wIKXMDSoASAFQAw%3D%3D'
  },
  {
    id: 'AGL4',
    googleMapUrl: 'https://www.google.com/maps/place/14%C2%B027\'49.3%22S+39%C2%B007\'56.1%22W/@-33.3837125,-105.1869744,3z/data=!4m13!1m8!3m7!1s0x739106c675ce9bb:0x795150bef2cd194d!2sLagoa+Encantada,+Ilh%C3%A9us+-+State+of+Bahia,+Brazil!3b1!8m2!3d-14.6207075!4d-39.1397344!16s%2Fg%2F1q5hrc_bh!3m3!8m2!3d-14.4636944!4d-39.13225!5m1!1e1?entry=ttu&g_ep=EgoyMDI1MDQyOS4wIKXMDSoASAFQAw%3D%3D'
  },
  {
    id: 'AGL8',
    googleMapUrl: 'https://www.google.com/maps/place/3%C2%B023\'32.0%22S+51%C2%B051\'09.1%22W/@-29.3170975,-101.1799934,3z/data=!4m4!3m3!8m2!3d-3.3922222!4d-51.8525278!5m1!1e1?entry=ttu&g_ep=EgoyMDI1MDQyOS4wIKXMDSoASAFQAw%3D%3D'
  }
];

async function updateCoordinates() {
  console.log('🔄 Updating coordinates in Google Sheets...\n');
  
  // Load credentials
  const credentialsPath = path.join(__dirname, '../google-service-account.json');
  if (!fs.existsSync(credentialsPath)) {
    console.error('❌ No Google service account credentials found at:', credentialsPath);
    return;
  }
  
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
  
  try {
    // Connect to Google Sheets
    const doc = new GoogleSpreadsheet(CONFIG.spreadsheetId, new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    }));
    
    await doc.loadInfo();
    console.log(`📄 Connected to spreadsheet: ${doc.title}`);
    
    // Get the sheet
    const sheet = doc.sheetsByTitle[CONFIG.sheetName];
    if (!sheet) {
      throw new Error(`Sheet "${CONFIG.sheetName}" not found`);
    }
    
    console.log(`📝 Reading from sheet: ${CONFIG.sheetName}`);
    
    // Load header row and all rows
    await sheet.loadHeaderRow();
    const rows = await sheet.getRows();
    
    console.log(`✅ Loaded ${rows.length} shipments from Google Sheets\n`);
    
    // Process each update
    let updatedCount = 0;
    for (const update of shipmentUpdates) {
      const row = rows.find(r => {
        const shipmentId = r.get('Shipment ID') || '';
        return shipmentId.toUpperCase() === update.id.toUpperCase();
      });
      
      if (!row) {
        console.log(`⚠️  Shipment ${update.id} not found in sheet`);
        continue;
      }
      
      // Extract coordinates
      const coordinates = extractCoordinates(update.googleMapUrl);
      
      // Only update if the field is empty
      let needsUpdate = false;
      
      // Check and update Google Maps URL if empty
      const currentUrl = row.get('Google Maps URL') || '';
      if (!currentUrl || currentUrl.trim() === '') {
        row.set('Google Maps URL', update.googleMapUrl);
        needsUpdate = true;
      }
      
      if (coordinates) {
        // Check and update Latitude if empty
        const currentLat = row.get('Latitude') || '';
        if (!currentLat || currentLat.trim() === '') {
          row.set('Latitude', coordinates.lat.toString());
          needsUpdate = true;
        }
        
        // Check and update Longitude if empty
        const currentLng = row.get('Longitude') || '';
        if (!currentLng || currentLng.trim() === '') {
          row.set('Longitude', coordinates.lng.toString());
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          await row.save();
          console.log(`✅ Updated ${update.id}: lat=${coordinates.lat}, lng=${coordinates.lng}`);
          updatedCount++;
        } else {
          console.log(`ℹ️  ${update.id} already has coordinates, skipping update`);
        }
      } else {
        console.log(`⚠️  Could not extract coordinates from URL for ${update.id}: ${update.googleMapUrl}`);
        if (needsUpdate) {
          await row.save();
          console.log(`   Updated Google Maps URL for ${update.id}`);
        } else {
          console.log(`   ${update.id} already has Google Maps URL, skipping update`);
        }
      }
    }
    
    console.log(`\n✅ Successfully updated ${updatedCount} shipments with coordinates`);
    console.log(`🔗 Sheet URL: https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/edit#gid=${sheet.sheetId}`);
    
  } catch (error) {
    console.error('❌ Error updating coordinates:', error);
    throw error;
  }
}

updateCoordinates();

