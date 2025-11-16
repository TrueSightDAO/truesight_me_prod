#!/usr/bin/env node

/**
 * Generate individual shipment and impact registry pages from Google Sheets
 * Creates two types of pages:
 * 1. Agroverse shipment pages: agroverse-shipments/{agl}/index.html
 * 2. Sunmint impact registry pages: sunmint-tree-planting-pledges/{agl}/index.html
 * 
 * Uses Google Sheets "Shipment Ledger Listing" as the master data source
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

// Map Google Sheets column names to internal field names
// google-spreadsheet library uses get() method or direct property access
function mapSheetRowToShipment(row) {
  // Try both get() method and direct property access
  const getValue = (key) => {
    if (typeof row.get === 'function') {
      return row.get(key) || '';
    }
    return row[key] || '';
  };
  
  // Get latitude and longitude from sheet, or extract from URL if not available
  const latStr = getValue('Latitude');
  const lngStr = getValue('Longitude');
  const googleMapUrl = getValue('Google Maps URL');
  
  let coordinates = null;
  if (latStr && lngStr) {
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (!isNaN(lat) && !isNaN(lng)) {
      coordinates = { lat, lng };
    }
  }
  
  // Fallback to extracting from URL if coordinates not in sheet
  if (!coordinates && googleMapUrl) {
    coordinates = extractCoordinates(googleMapUrl);
  }
  
  return {
    shipment_contract_number: getValue('Shipment ID'),
    shipment_date: getValue('Shipment Date'),
    shipment_status: getValue('Status'),
    shipment_description: getValue('Description'),
    cargo_size: getValue('Cargo Size'),
    cacao_kg: getValue('Cacao (kg)'),
    transaction_type: getValue('Transaction Type'),
    investment_roi: getValue('Investment ROI'),
    capital_injection: getValue('Capital Injection'),
    total_revenue: getValue('Total Revenue'),
    ledger_url: getValue('Ledger URL'),
    contract_url: getValue('Contract URL'),
    fda_prior_notice: getValue('FDA Prior Notice'),
    shipment_invoice_url: getValue('Invoice URL'),
    purchase_order_url: getValue('Purchase Order URL'),
    lab_report: getValue('Lab Report'),
    video_reel: getValue('Video Reel'),
    truesight_dao_shipment_url: getValue('TrueSight DAO URL'),
    trees_to_be_planted: getValue('Trees to be Planted'),
    google_map_url: googleMapUrl,
    coordinates: coordinates, // Add coordinates directly to shipment object
    is_cacao_shipment: getValue('Is Cacao Shipment'),
    serialized: getValue('Serialized'),
    'Created Date': getValue('Created Date'),
    'Updated Date': getValue('Updated Date')
  };
}

async function loadShipmentsFromGoogleSheets() {
  console.log('📡 Loading shipments from Google Sheets...\n');
  
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
    // Connect to Google Sheets
    const doc = new GoogleSpreadsheet(CONFIG.spreadsheetId, new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
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
    
    // Map rows to shipment objects
    return rows.map(row => mapSheetRowToShipment(row));
    
  } catch (error) {
    console.error('❌ Error loading from Google Sheets:', error);
    throw error;
  }
}

// Main execution
let shipments = [];
loadShipmentsFromGoogleSheets()
  .then(data => {
    shipments = data;
    // Continue with page generation (rest of the script)
    generatePages();
  })
  .catch(error => {
    console.error('Failed to load shipments:', error);
    process.exit(1);
  });

function generatePages() {

// Helper to format dates
function formatDate(dateStr) {
  if (!dateStr || dateStr === '') return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Helper to strip HTML tags and clean text for meta descriptions
function stripHtmlAndClean(text) {
  if (!text) return '';
  // Remove HTML tags
  let cleaned = text.replace(/<[^>]*>/g, '');
  // Decode HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // Escape quotes for HTML attributes
  cleaned = cleaned.replace(/"/g, '&quot;');
  cleaned = cleaned.replace(/'/g, '&#39;');
  return cleaned;
}

// Helper to get image path
function getImagePath(shipmentNumber) {
  const lower = shipmentNumber.toLowerCase();
  const ext = lower === 'agl7' ? 'gif' : 'avif';
  return `assets/shipments/${lower}.${ext}`;
}


// Template for Agroverse shipment page
function generateAgroverseShipmentPage(shipment) {
  const shipmentNumber = shipment.shipment_contract_number || '';
  const title = shipmentNumber;
  const description = shipment.shipment_description || '';
  const status = shipment.shipment_status || '';
  const date = formatDate(shipment.shipment_date);
  const cacaoKg = shipment.cacao_kg || shipment.cargo_size || '';
  const financing = shipment.transaction_type || '';
  const roi = shipment.investment_roi || '';
  const capitalInjection = shipment.capital_injection || '';
  const totalRevenue = shipment.total_revenue || '';
  const ledgerUrl = shipment.ledger_url || '';
  const financingContract = shipment.contract_url || '';
  const invoiceUrl = shipment.shipment_invoice_url || '';
  const fdaPriorNotice = shipment.fda_prior_notice || '';
  const purchaseOrderUrl = shipment.purchase_order_url || '';
  const labReport = shipment.lab_report || '';
  const videoReel = shipment.video_reel || '';
  const googleMapUrl = shipment.google_map_url || '';
  const googleMapImage = shipment.google_map_image || '';
  const shopUrl = ledgerUrl && ledgerUrl.includes('agroverse.shop') ? ledgerUrl : '';
  const truesightDaoShipmentUrl = shipment.truesight_dao_shipment_url || '';
  const imagePath = getImagePath(shipmentNumber);
  // Use coordinates from Google Sheet if available, otherwise extract from URL
  const coordinates = shipment.coordinates || extractCoordinates(googleMapUrl);
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Agroverse Shipment | TrueSight DAO</title>
    <meta
      name="description"
      content="${stripHtmlAndClean(description).substring(0, 160)}"
    />
    <link
      rel="icon"
      href="https://static.wixstatic.com/ficons/0e2cde_dd65db118f8f499eb06c159d7262167d%7Emv2.ico"
      type="image/x-icon"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <link rel="stylesheet" href="../../styles/main.css" />
  </head>
  <body>
    <nav class="site-header">
      <div class="header-container">
        <a href="../../index.html" class="header-logo">
          <img
            src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"
            alt="TrueSight DAO"
            width="155"
            height="40"
            loading="eager"
          />
        </a>
        <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <ul class="nav-menu" aria-hidden="true">
          <li><a href="../../index.html">Home</a></li>
          <li><a href="../../agroverse.html">Agroverse</a></li>
          <li><a href="../../sunmint.html">Sunmint</a></li>
          <li><a href="../../edgar.html">Edgar</a></li>
          <li><a href="../../about-us.html">About Us</a></li>
          <li><a href="../../blog/index.html">Blog</a></li>
          <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer">Whitepaper</a></li>
          <li><a href="https://dapp.truesight.me" target="_blank" rel="noreferrer">DApp</a></li>
        </ul>
      </div>
    </nav>
    <div class="page">
      <div style="margin-bottom: var(--space-md);">
        <a href="../../agroverse.html" class="text-link">← Back to Agroverse</a>
      </div>
      
      <header class="hero" style="text-align: left; padding-bottom: var(--space-md);">
        <p class="pill">Shipment</p>
        <h1>${title}</h1>
        <p class="section-lead">
          View transparent details for this Agroverse shipment, managed by TrueSight DAO.
        </p>
      </header>

      <section>
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div>
            ${fs.existsSync(path.join(__dirname, `../${imagePath}`)) ? `<img src="../../${imagePath}" alt="${title}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: var(--space-md);" loading="lazy" />` : ''}
            <h2 style="margin-top: 0;">${title}</h2>
            <h3>Shipment Description</h3>
            <p>${description.replace(/\n/g, '<br>')}</p>
          </div>
          
          <div>
            <h3>Shipment Overview</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Shipment Title</dt>
                <dd style="margin: 0; color: var(--muted);">${title}</dd>
              </div>
              ${status ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Status</dt>
                <dd style="margin: 0; color: var(--muted);">${status}</dd>
              </div>
              ` : ''}
              ${date ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Farm Shipment Date</dt>
                <dd style="margin: 0; color: var(--muted);">${date}</dd>
              </div>
              ` : ''}
              ${cacaoKg ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Cacao in kg.</dt>
                <dd style="margin: 0; color: var(--muted);">${cacaoKg}</dd>
              </div>
              ` : ''}
              ${shopUrl ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Transparency Ledger</dt>
                <dd style="margin: 0;"><a href="${shopUrl}" target="_blank" rel="noreferrer" class="text-link">View Ledger</a></dd>
              </div>
              ` : ''}
            </dl>
            
            <h3 style="margin-top: var(--space-lg);">Financing</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              ${financing ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Funding approach</dt>
                <dd style="margin: 0; color: var(--muted);">${financing}</dd>
              </div>
              ` : ''}
              ${financingContract ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Financing Contract</dt>
                <dd style="margin: 0;"><a href="${financingContract}" target="_blank" rel="noreferrer" class="text-link">View</a></dd>
              </div>
              ` : ''}
              ${roi ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Capital Returns</dt>
                <dd style="margin: 0; color: var(--muted);">${roi}</dd>
              </div>
              ` : ''}
            </dl>
            
            <h3 style="margin-top: var(--space-lg);">Documents</h3>
            <ul style="list-style: none; padding: 0;">
              ${invoiceUrl ? `<li style="margin-bottom: var(--space-xs);"><a href="${invoiceUrl}" target="_blank" rel="noreferrer" class="text-link">Farmer's Invoice</a></li>` : ''}
              ${fdaPriorNotice ? `<li style="margin-bottom: var(--space-xs);"><a href="${fdaPriorNotice}" target="_blank" rel="noreferrer" class="text-link">FDA prior Notice</a></li>` : ''}
              ${purchaseOrderUrl ? `<li style="margin-bottom: var(--space-xs);"><a href="${purchaseOrderUrl}" target="_blank" rel="noreferrer" class="text-link">Purchase Order</a></li>` : ''}
              ${labReport ? `<li style="margin-bottom: var(--space-xs);"><a href="${labReport}" target="_blank" rel="noreferrer" class="text-link">Lab Report</a></li>` : ''}
            </ul>
            
            ${videoReel ? `
            <h3 style="margin-top: var(--space-lg);">Video</h3>
            <p><a href="${videoReel}" target="_blank" rel="noreferrer" class="text-link">Watch Video Reel</a></p>
            ` : ''}
            
            ${coordinates || googleMapUrl ? `
            <h3 style="margin-top: var(--space-lg); margin-bottom: var(--space-sm);">Location</h3>
            ${coordinates ? `
            <div id="map-${shipmentNumber.toLowerCase()}" style="width: 100%; height: 400px; border-radius: 12px; margin-bottom: var(--space-sm); border: 1px solid rgba(95, 111, 82, 0.2);"></div>
            ` : ''}
            ${googleMapUrl ? `<p style="margin-top: ${coordinates ? 'var(--space-xs)' : '0'};"><a href="${googleMapUrl}" target="_blank" rel="noreferrer" class="text-link">View on Google Maps</a></p>` : ''}
            ` : ''}
            
            ${truesightDaoShipmentUrl ? `
            <h3 style="margin-top: var(--space-lg);">Additional Resources</h3>
            <ul style="list-style: none; padding: 0;">
              <li style="margin-bottom: var(--space-xs);"><a href="${truesightDaoShipmentUrl}" target="_blank" rel="noreferrer" class="text-link">TrueSight DAO Shipment Page</a></li>
            </ul>
            ` : ''}
          </div>
        </div>
      </section>
    </div>
    <footer style="margin: var(--space-xl) auto var(--space-lg); text-align: center;">
      TrueSight DAO · Transparent impact data available at <a href="https://truesight.me">truesight.me</a>
    </footer>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      // Initialize Leaflet map if coordinates are available
      ${coordinates ? `
      (function() {
        function initMap() {
          if (typeof L === 'undefined') {
            setTimeout(initMap, 100);
            return;
          }
          const map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')} = L.map('map-${shipmentNumber.toLowerCase()}').setView([${coordinates.lat}, ${coordinates.lng}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
          }).addTo(map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')});
          L.marker([${coordinates.lat}, ${coordinates.lng}]).addTo(map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')})
            .bindPopup('${title.replace(/'/g, "\\'")}<br><a href="${(googleMapUrl || '').replace(/'/g, "\\'")}" target="_blank" rel="noreferrer">View on Google Maps</a>')
            .openPopup();
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initMap);
        } else {
          initMap();
        }
      })();
      ` : ''}
      
      // Hamburger menu toggle
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
        
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
    </script>
  </body>
</html>`;
}

// Template for Sunmint impact registry page
function generateSunmintImpactPage(shipment) {
  const shipmentNumber = shipment.shipment_contract_number || '';
  const title = shipmentNumber;
  const description = shipment.shipment_description || '';
  const status = shipment.shipment_status || '';
  const date = formatDate(shipment.shipment_date);
  const ledgerUrl = shipment.ledger_url || '';
  const treesToBePlanted = shipment.trees_to_be_planted || '';
  const googleMapUrl = shipment.google_map_url || '';
  const googleMapImage = shipment.google_map_image || '';
  const shopUrl = ledgerUrl && ledgerUrl.includes('agroverse.shop') ? ledgerUrl : '';
  const truesightDaoShipmentUrl = shipment.truesight_dao_shipment_url || '';
  const imagePath = getImagePath(shipmentNumber);
  // Use coordinates from Google Sheet if available, otherwise extract from URL
  const coordinates = shipment.coordinates || extractCoordinates(googleMapUrl);
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · Sunmint Tree-Planting Pledge | TrueSight DAO</title>
    <meta
      name="description"
      content="${stripHtmlAndClean(description).substring(0, 160)}"
    />
    <link
      rel="icon"
      href="https://static.wixstatic.com/ficons/0e2cde_dd65db118f8f499eb06c159d7262167d%7Emv2.ico"
      type="image/x-icon"
    />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
    <link rel="stylesheet" href="../../styles/main.css" />
  </head>
  <body>
    <nav class="site-header">
      <div class="header-container">
        <a href="../../index.html" class="header-logo">
          <img
            src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"
            alt="TrueSight DAO"
            width="155"
            height="40"
            loading="eager"
          />
        </a>
        <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <ul class="nav-menu" aria-hidden="true">
          <li><a href="../../index.html">Home</a></li>
          <li><a href="../../agroverse.html">Agroverse</a></li>
          <li><a href="../../sunmint.html">Sunmint</a></li>
          <li><a href="../../edgar.html">Edgar</a></li>
          <li><a href="../../about-us.html">About Us</a></li>
          <li><a href="../../blog/index.html">Blog</a></li>
          <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer">Whitepaper</a></li>
          <li><a href="https://dapp.truesight.me" target="_blank" rel="noreferrer">DApp</a></li>
        </ul>
      </div>
    </nav>
    <div class="page">
      <div style="margin-bottom: var(--space-md);">
        <a href="../../sunmint.html" class="text-link">← Back to Sunmint</a>
      </div>
      
      <header class="hero" style="text-align: left; padding-bottom: var(--space-md);">
        <p class="pill">PLEDGE TITLE:</p>
        <h1>${title}</h1>
        <p class="section-lead">
          View transparent details for this Sunmint tree-planting pledge, supported by TrueSight DAO.
        </p>
      </header>

      <section>
        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div>
            ${fs.existsSync(path.join(__dirname, `../${imagePath}`)) ? `<img src="../../${imagePath}" alt="${title}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: var(--space-md);" loading="lazy" />` : ''}
            <h2 style="margin-top: 0;">${title}</h2>
          </div>
          
          <div>
            <h3>PLEDGE Overview</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">PLEDGE TITLE</dt>
                <dd style="margin: 0; color: var(--muted);">${title}</dd>
              </div>
              ${status ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Status</dt>
                <dd style="margin: 0; color: var(--muted);">${status}</dd>
              </div>
              ` : ''}
              ${date ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">PLEDGE START Date</dt>
                <dd style="margin: 0; color: var(--muted);">${date}</dd>
              </div>
              ` : ''}
              ${treesToBePlanted ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Trees to be Planted</dt>
                <dd style="margin: 0; color: var(--muted);">${treesToBePlanted}</dd>
              </div>
              ` : ''}
              ${shopUrl ? `
              <div style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Transparency Ledger</dt>
                <dd style="margin: 0;"><a href="${shopUrl}" target="_blank" rel="noreferrer" class="text-link">View Ledger</a></dd>
              </div>
              ` : ''}
            </dl>
            
            <h3 style="margin-top: var(--space-lg);">PLEDGE DETAILS</h3>
            <p>${description.replace(/\n/g, '<br>')}</p>
            
            ${coordinates || googleMapUrl ? `
            <h3 style="margin-top: var(--space-lg); margin-bottom: var(--space-sm);">Location</h3>
            ${coordinates ? `
            <div id="map-${shipmentNumber.toLowerCase()}" style="width: 100%; height: 400px; border-radius: 12px; margin-bottom: var(--space-sm); border: 1px solid rgba(95, 111, 82, 0.2);"></div>
            ` : ''}
            ${googleMapUrl ? `<p style="margin-top: ${coordinates ? 'var(--space-xs)' : '0'};"><a href="${googleMapUrl}" target="_blank" rel="noreferrer" class="text-link">View on Google Maps</a></p>` : ''}
            ` : ''}
            
            ${truesightDaoShipmentUrl ? `
            <h3 style="margin-top: var(--space-lg);">Additional Resources</h3>
            <ul style="list-style: none; padding: 0;">
              <li style="margin-bottom: var(--space-xs);"><a href="${truesightDaoShipmentUrl}" target="_blank" rel="noreferrer" class="text-link">TrueSight DAO Shipment Page</a></li>
            </ul>
            ` : ''}
          </div>
        </div>
      </section>
    </div>
    <footer style="margin: var(--space-xl) auto var(--space-lg); text-align: center;">
      TrueSight DAO · Transparent impact data available at <a href="https://truesight.me">truesight.me</a>
    </footer>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
    <script>
      // Initialize Leaflet map if coordinates are available
      ${coordinates ? `
      (function() {
        function initMap() {
          if (typeof L === 'undefined') {
            setTimeout(initMap, 100);
            return;
          }
          const map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')} = L.map('map-${shipmentNumber.toLowerCase()}').setView([${coordinates.lat}, ${coordinates.lng}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
          }).addTo(map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')});
          L.marker([${coordinates.lat}, ${coordinates.lng}]).addTo(map${shipmentNumber.replace(/[^a-zA-Z0-9]/g, '')})
            .bindPopup('${title.replace(/'/g, "\\'")}<br><a href="${(googleMapUrl || '').replace(/'/g, "\\'")}" target="_blank" rel="noreferrer">View on Google Maps</a>')
            .openPopup();
        }
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', initMap);
        } else {
          initMap();
        }
      })();
      ` : ''}
      
      // Hamburger menu toggle
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
        
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
    </script>
  </body>
</html>`;
}

  // Generate pages
  const agroverseDir = path.join(__dirname, '../agroverse-shipments');
  const sunmintDir = path.join(__dirname, '../sunmint-tree-planting-pledges');

  // Filter shipments based on is_cacao_shipment and serialized flags
  // Agroverse pages: shipments where is_cacao_shipment is true/yes/1
  const agroverseShipments = shipments.filter(s => {
    const isCacao = (s.is_cacao_shipment || '').toString().toLowerCase();
    return isCacao === 'true' || isCacao === 'yes' || isCacao === '1' || isCacao === 'y';
  });
  
  // Sunmint pages: shipments where serialized is true/yes/1
  const sunmintShipments = shipments.filter(s => {
    const serialized = (s.serialized || '').toString().toLowerCase();
    return serialized === 'true' || serialized === 'yes' || serialized === '1' || serialized === 'y';
  });

  // Generate Agroverse pages (create directory structure with index.html for clean URLs)
  agroverseShipments.forEach(shipment => {
    const shipmentNumber = shipment.shipment_contract_number.toLowerCase();
    const html = generateAgroverseShipmentPage(shipment);
    const shipmentDir = path.join(agroverseDir, shipmentNumber);
    if (!fs.existsSync(shipmentDir)) {
      fs.mkdirSync(shipmentDir, { recursive: true });
    }
    const filePath = path.join(shipmentDir, 'index.html');
    fs.writeFileSync(filePath, html);
    console.log(`Generated: ${filePath}`);
  });

  // Generate Sunmint pages (create directory structure with index.html for clean URLs)
  sunmintShipments.forEach(shipment => {
    const shipmentNumber = shipment.shipment_contract_number.toLowerCase();
    const html = generateSunmintImpactPage(shipment);
    const shipmentDir = path.join(sunmintDir, shipmentNumber);
    if (!fs.existsSync(shipmentDir)) {
      fs.mkdirSync(shipmentDir, { recursive: true });
    }
    const filePath = path.join(shipmentDir, 'index.html');
    fs.writeFileSync(filePath, html);
    console.log(`Generated: ${filePath}`);
  });

  console.log(`\n✅ Generated ${agroverseShipments.length} Agroverse shipment pages`);
  console.log(`✅ Generated ${sunmintShipments.length} Sunmint impact registry pages`);
}

