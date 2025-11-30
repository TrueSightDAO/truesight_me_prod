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
    shipment_image: getValue('Shipment Image'), // GitHub raw URL for meta tags
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

// Helper to escape HTML entities
function escapeHtml(text) {
  if (!text) return '';
  // First remove broken link tags and malformed HTML fragments
  let cleaned = String(text)
    // Remove corrupted link tags with malformed attributes
    .replace(/<link[^>]*css2\?[^>]*>/gi, '') // Remove link tags with css2? in them
    .replace(/<link[^>]*family=[^>]*>/gi, '') // Remove link tags with family= in them
    .replace(/family=[^"'>]*display=swap[^"'>]*rel=["']stylesheet["'][^>]*>/gi, '') // Remove broken link tags
    .replace(/family=[^"'>]*wght@[^"'>]*display[^"'>]*>/gi, '') // Remove broken font link fragments
    .replace(/<link[^>]*>/gi, '') // Remove any remaining link tags
    .replace(/fonts\.googleapis\.com[^"'>]*/gi, '') // Remove googleapis.com fragments
    .replace(/css2\?[^"'>]*/gi, '') // Remove css2? fragments
    .replace(/Playfair\+Display[^"'>]*/gi, '') // Remove Playfair Display fragments
    .replace(/Open\+Sans[^"'>]*/gi, '') // Remove Open Sans fragments
    .replace(/<[^>]*>/g, ''); // Remove all remaining HTML tags
  
  // Then escape HTML entities
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Helper to strip HTML tags and clean text for meta descriptions
function stripHtmlAndClean(text) {
  if (!text) return '';
  // Remove broken link tags and malformed HTML fragments first
  let cleaned = text
    // Remove corrupted link tags with malformed attributes
    .replace(/<link[^>]*css2\?[^>]*>/gi, '') // Remove link tags with css2? in them
    .replace(/<link[^>]*family=[^>]*>/gi, '') // Remove link tags with family= in them
    .replace(/family=[^"'>]*display=swap[^"'>]*rel=["']stylesheet["'][^>]*>/gi, '') // Remove broken link tags
    .replace(/family=[^"'>]*wght@[^"'>]*display[^"'>]*>/gi, '') // Remove broken font link fragments
    .replace(/<link[^>]*>/gi, '') // Remove any remaining link tags
    .replace(/fonts\.googleapis\.com[^"'>]*/gi, '') // Remove googleapis.com fragments
    .replace(/css2\?[^"'>]*/gi, '') // Remove css2? fragments
    .replace(/Playfair\+Display[^"'>]*/gi, '') // Remove Playfair Display fragments
    .replace(/Open\+Sans[^"'>]*/gi, '') // Remove Open Sans fragments
    .replace(/<[^>]*>/g, ''); // Remove all remaining HTML tags
  
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

// Helper to generate Open Graph and Twitter Card meta tags
function generateMetaTags(options) {
  const {
    title,
    description,
    imageUrl,
    url,
    type = 'website',
    siteName = 'TrueSight DAO'
  } = options;
  
  const baseUrl = 'https://www.truesight.me';
  const fullUrl = url ? `${baseUrl}${url}` : baseUrl;
  const fullImageUrl = imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `${baseUrl}/${imageUrl}`) : `${baseUrl}/assets/truesight-logo.png`;
  const cleanDescription = stripHtmlAndClean(description || '').substring(0, 200);
  
  return `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${fullUrl}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${cleanDescription}" />
    <meta property="og:image" content="${fullImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="${siteName}" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="${fullUrl}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${cleanDescription}" />
    <meta name="twitter:image" content="${fullImageUrl}" />
    <meta name="twitter:site" content="@TrueSightDAO" />
  `;
}

// Generate footer HTML (shared across all pages)
function generateFooterHTML(basePath = '../../') {
  return `
    <footer class="footer">
      <div class="footer-content">
        <div style="margin-bottom: var(--space-lg);">
          <div style="margin-bottom: var(--space-md);">
            <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--space-xs); color: var(--text); text-align: center; text-transform: uppercase; letter-spacing: 0.05em;">Transparency</h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-sm) var(--space-lg);">
              <li><a href="https://truesight.me/physical-asset-movements" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Shipment History</a></li>
              <li><a href="https://truesight.me/physical-transactions" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Financial Records</a></li>
              <li><a href="https://agroverse.shop/consignments" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Consignment Tracking</a></li>
              <li><a href="https://truesight.me/physical-assets/serialized" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Product Verification</a></li>
              <li><a href="https://truesight.me/digital-assets" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Token Holdings</a></li>
            </ul>
          </div>
          <div style="margin-bottom: var(--space-md);">
            <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--space-xs); color: var(--text); text-align: center; text-transform: uppercase; letter-spacing: 0.05em;">Governance & Records</h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-sm) var(--space-lg);">
              <li><a href="https://truesight.me/rubric" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Scoring Rubric</a></li>
              <li><a href="https://truesight.me/submissions/raw-telegram-chatlogs" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Engagement Logs</a></li>
            </ul>
          </div>
          <div style="margin-bottom: var(--space-md);">
            <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--space-xs); color: var(--text); text-align: center; text-transform: uppercase; letter-spacing: 0.05em;">Data & Records</h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-sm) var(--space-lg);">
              <li><a href="https://truesight.me/offchain-assets" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Physical Assets</a></li>
              <li><a href="https://truesight.me/offchain-asset-location" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Asset Location</a></li>
              <li><a href="https://truesight.me/digital-signatures" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Digital Signatures</a></li>
              <li><a href="https://truesight.me/notarizations" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Notarizations</a></li>
              <li><a href="https://truesight.me/currencies" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Currencies</a></li>
              <li><a href="https://truesight.me/physical-assets/serialized/sold" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Sold Products</a></li>
              <li><a href="https://truesight.me/ttl" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">TTL Records</a></li>
            </ul>
          </div>
          <div>
            <h4 style="font-size: 0.875rem; font-weight: 600; margin-bottom: var(--space-xs); color: var(--text); text-align: center; text-transform: uppercase; letter-spacing: 0.05em;">Partnerships</h4>
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-sm) var(--space-lg);">
              <li><a href="https://agroverse.shop/community-warehouse-manager/sla" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Warehouse Partnership Terms</a></li>
              <li><a href="https://agroverse.shop/community-distributor/agreement" target="_blank" rel="noreferrer noopener" style="color: var(--muted); text-decoration: none; font-size: 0.9375rem;">Distribution Partnership Terms</a></li>
            </ul>
          </div>
        </div>
        <h2>JOIN OUR MOVEMENT</h2>
        <p>Co-Create with us</p>
        <div class="footer-social">
          <a href="https://t.me/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="Telegram">
            <img src="${basePath}assets/telegram-icon.jpg" alt="Telegram" width="48" height="48" loading="lazy" />
          </a>
          <a href="https://github.com/TrueSightDAO" target="_blank" rel="noreferrer noopener" aria-label="GitHub">
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="currentColor">
              <title>GitHub</title>
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
        </div>
        <p style="margin-top: var(--space-lg); font-size: 0.875rem; color: var(--muted);">
          TrueSight DAO · Transparent impact data available at <a href="${basePath}index.html" style="color: var(--accent-2);">truesight.me</a>
        </p>
      </div>
    </footer>
  `;
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
  const treesToBePlanted = shipment.trees_to_be_planted || '';
  const shopUrl = ledgerUrl && ledgerUrl.includes('agroverse.shop') ? ledgerUrl : '';
  let truesightDaoShipmentUrl = shipment.truesight_dao_shipment_url || '';
  // Convert absolute truesight.me URLs to relative paths
  if (truesightDaoShipmentUrl && truesightDaoShipmentUrl.includes('truesight.me')) {
    truesightDaoShipmentUrl = truesightDaoShipmentUrl.replace(/https?:\/\/(www\.)?truesight\.me/, '');
  }
  const imagePath = getImagePath(shipmentNumber);
  // Use coordinates from Google Sheet if available, otherwise extract from URL
  const coordinates = shipment.coordinates || extractCoordinates(googleMapUrl);
  
  // Get image URL for meta tags (use GitHub raw URL if available from sheet, otherwise construct it)
  const shipmentImageUrl = shipment.shipment_image || `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/${imagePath}`;
  const pageUrl = `/agroverse-shipments/${title.toLowerCase()}`;
  const pageTitle = `${title} · Agroverse Shipment | TrueSight DAO`;
  const pageDescription = stripHtmlAndClean(description).substring(0, 160);
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <meta
      name="description"
      content="${pageDescription}"
    />
    ${generateMetaTags({
      title: pageTitle,
      description: description,
      imageUrl: shipmentImageUrl,
      url: pageUrl,
      type: 'article'
    })}
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
          <li><a href="../../about-us.html">About Us</a></li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Projects</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="../../agroverse.html">Agroverse Community</a></li>
              <li><a href="../../sunmint.html">Sunmint Program</a></li>
              <li><a href="../../edgar.html">Edgar Platform</a></li>
            </ul>
          </li>
          <li><a href="https://truesight.me/proposals" target="_blank" rel="noreferrer noopener">Proposals</a></li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Community</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="https://truesight.me/quests" target="_blank" rel="noreferrer noopener">Community Challenges</a></li>
              <li><a href="https://truesight.me/governors" target="_blank" rel="noreferrer noopener">Community Leaders</a></li>
              <li><a href="https://truesight.me/members-directory" target="_blank" rel="noreferrer noopener">Members Directory</a></li>
              <li><a href="https://truesight.me/recurring-tdg-awards" target="_blank" rel="noreferrer noopener">Ongoing Awards</a></li>
              <li><a href="https://truesight.me/submissions/scored-and-to-be-tokenized" target="_blank" rel="noreferrer noopener">Upcoming Awards</a></li>
              <li><a href="https://truesight.me/beerhall" target="_blank" rel="noreferrer noopener">Join Chat</a></li>
            </ul>
          </li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Resources</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="../../faq.html">Frequently Asked Questions</a></li>
              <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer noopener">Whitepaper</a></li>
              <li><a href="https://truesight.me/tokenomics" target="_blank" rel="noreferrer noopener">Tokenomics</a></li>
              <li><a href="https://truesight.me/dapp" target="_blank" rel="noreferrer noopener">Web App</a></li>
              <li><a href="https://truesight.me/ledger" target="_blank" rel="noreferrer noopener">Contributions Record</a></li>
              <li><a href="https://truesight.me/roadmap" target="_blank" rel="noreferrer noopener">Roadmap</a></li>
            </ul>
          </li>
          <li><a href="../../blog/index.html">Blog</a></li>
        </ul>
      </div>
    </nav>
    <div class="page">
      <div style="margin-bottom: var(--space-sm);">
        <a href="../../agroverse.html" class="text-link">← Back to Agroverse</a>
      </div>
      
      <header class="hero" style="text-align: left; padding-top: var(--space-sm); padding-bottom: var(--space-md);">
        <p class="pill">Shipment</p>
        <h1>${title}</h1>
        <p class="section-lead">
          View transparent details for this Agroverse shipment, managed by TrueSight DAO.
        </p>
        ${treesToBePlanted ? `
        <div style="margin-top: var(--space-lg); padding: var(--space-lg); background: rgba(244, 163, 0, 0.1); border: 2px solid rgba(244, 163, 0, 0.3); border-radius: 16px; display: inline-block;">
          <div style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin-bottom: var(--space-xs);">Trees to be Planted</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--accent-2); line-height: 1.2;">
            <span data-trees-sold data-shipment-id="${title.toLowerCase()}" style="display: inline-block;">
              ${treesToBePlanted}
            </span>
            <span class="trees-sold-loading" style="display: none; margin-left: 0.5rem; font-size: 1rem; color: var(--muted); font-weight: 400;">(updating...)</span>
          </div>
        </div>
        ` : ''}
      </header>

      <section>
        <div class="shipment-detail-grid" style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div>
            ${fs.existsSync(path.join(__dirname, `../${imagePath}`)) ? `<img src="../../${imagePath}" alt="${title}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: var(--space-md);" loading="lazy" />` : ''}
            <h2 style="margin-top: 0;">${title}</h2>
            <h3>Shipment Description</h3>
            <p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>
          </div>
          
          <div>
            <h3>Shipment Overview</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Shipment Title</dt>
                <dd style="margin: 0; color: var(--muted);">${title}</dd>
              </div>
              ${status ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Status</dt>
                <dd style="margin: 0; color: var(--muted);">${status}</dd>
              </div>
              ` : ''}
              ${date ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Farm Shipment Date</dt>
                <dd style="margin: 0; color: var(--muted);">${date}</dd>
              </div>
              ` : ''}
              ${cacaoKg ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Cacao in kg.</dt>
                <dd style="margin: 0; color: var(--muted);">${cacaoKg}</dd>
              </div>
              ` : ''}
              ${treesToBePlanted ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Trees to be Planted</dt>
                <dd style="margin: 0; color: var(--muted);">
                  <span data-trees-sold data-shipment-id="${title.toLowerCase()}" style="display: inline-block;">
                    ${treesToBePlanted}
                  </span>
                  <span class="trees-sold-loading" style="display: none; margin-left: 0.5rem; font-size: 0.875rem; color: var(--muted);">(updating...)</span>
                </dd>
              </div>
              ` : ''}
              ${shopUrl ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Transparency Ledger</dt>
                <dd style="margin: 0;"><a href="${shopUrl}" target="_blank" rel="noreferrer" class="text-link">View Ledger</a></dd>
              </div>
              ` : ''}
            </dl>
            
            <h3 style="margin-top: var(--space-lg);">Financing</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              ${financing ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Funding approach</dt>
                <dd style="margin: 0; color: var(--muted);">${financing}</dd>
              </div>
              ` : ''}
              ${financingContract ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Financing Contract</dt>
                <dd style="margin: 0;"><a href="${financingContract}" target="_blank" rel="noreferrer" class="text-link">View</a></dd>
              </div>
              ` : ''}
              ${roi ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
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
              <li style="margin-bottom: var(--space-xs);"><a href="${truesightDaoShipmentUrl}" ${truesightDaoShipmentUrl.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''} class="text-link">TrueSight DAO Shipment Page</a></li>
            </ul>
            ` : ''}
          </div>
        </div>
      </section>
    </div>
    ${generateFooterHTML('../../')}
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
      
      // Hamburger menu toggle and dropdown functionality
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        // Hamburger menu toggle
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        // Dropdown toggle functionality (for mobile)
        const dropdownToggles = navMenu.querySelectorAll('.dropdown-toggle');
        dropdownToggles.forEach(function(toggle) {
          toggle.addEventListener('click', function(e) {
            // On mobile, toggle the dropdown
            if (window.innerWidth <= 768) {
              e.preventDefault();
              e.stopPropagation();
              const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
              const dropdownMenu = toggle.nextElementSibling;
              
              toggle.setAttribute('aria-expanded', !isExpanded);
              if (dropdownMenu) {
                dropdownMenu.setAttribute('aria-expanded', !isExpanded);
              }
            }
          });
        });
        
        // Close menu when clicking on a link
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
            
            // Close all dropdowns
            dropdownToggles.forEach(function(toggle) {
              toggle.setAttribute('aria-expanded', 'false');
              const dropdownMenu = toggle.nextElementSibling;
              if (dropdownMenu) {
                dropdownMenu.setAttribute('aria-expanded', 'false');
              }
            });
          }
        });
        
        // Close menu when clicking overlay
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
      
      // Load trees sold count dynamically
      (function() {
        const treesSoldElement = document.querySelector('[data-trees-sold]');
        if (!treesSoldElement) return;
        
        const shipmentId = treesSoldElement.getAttribute('data-shipment-id');
        if (!shipmentId) return;
        
        const loadingElement = document.querySelector('.trees-sold-loading');
        if (loadingElement) {
          loadingElement.style.display = 'inline';
        }
        
        const serviceUrl = 'https://script.google.com/macros/s/AKfycbzlfOBo9UqKOh7jIqGcmbPAMM1RxCbsJHb-UV_vM6VbvK_HSdT44KyGbbXIeo-_Ovfy/exec';
        fetch(serviceUrl + '?shipmentId=' + encodeURIComponent(shipmentId))
          .then(function(response) {
            if (!response.ok) {
              throw new Error('HTTP error! status: ' + response.status);
            }
            return response.json();
          })
          .then(function(data) {
            if (data.error) {
              console.warn('Error fetching trees sold:', data.message);
              return;
            }
            
            if (data.treesSold !== undefined && data.treesSold !== null) {
              treesSoldElement.textContent = data.treesSold;
              treesSoldElement.classList.add('loaded');
            }
          })
          .catch(function(error) {
            console.warn('Error fetching trees sold count:', error);
          })
          .finally(function() {
            if (loadingElement) {
              loadingElement.style.display = 'none';
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
  let truesightDaoShipmentUrl = shipment.truesight_dao_shipment_url || '';
  // Convert absolute truesight.me URLs to relative paths
  if (truesightDaoShipmentUrl && truesightDaoShipmentUrl.includes('truesight.me')) {
    truesightDaoShipmentUrl = truesightDaoShipmentUrl.replace(/https?:\/\/(www\.)?truesight\.me/, '');
  }
  const imagePath = getImagePath(shipmentNumber);
  // Use coordinates from Google Sheet if available, otherwise extract from URL
  const coordinates = shipment.coordinates || extractCoordinates(googleMapUrl);
  
  // Get image URL for meta tags (use GitHub raw URL if available from sheet, otherwise construct it)
  const shipmentImageUrl = shipment.shipment_image || `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/${imagePath}`;
  const pageUrl = `/sunmint-tree-planting-pledges/${title.toLowerCase()}`;
  const pageTitle = `${title} · Sunmint Tree-Planting Pledge | TrueSight DAO`;
  const pageDescription = stripHtmlAndClean(description).substring(0, 160);
  
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${pageTitle}</title>
    <meta
      name="description"
      content="${pageDescription}"
    />
    ${generateMetaTags({
      title: pageTitle,
      description: description,
      imageUrl: shipmentImageUrl,
      url: pageUrl,
      type: 'article'
    })}
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
          <li><a href="../../about-us.html">About Us</a></li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Projects</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="../../agroverse.html">Agroverse Community</a></li>
              <li><a href="../../sunmint.html">Sunmint Program</a></li>
              <li><a href="../../edgar.html">Edgar Platform</a></li>
            </ul>
          </li>
          <li><a href="https://truesight.me/proposals" target="_blank" rel="noreferrer noopener">Proposals</a></li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Community</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="https://truesight.me/quests" target="_blank" rel="noreferrer noopener">Community Challenges</a></li>
              <li><a href="https://truesight.me/governors" target="_blank" rel="noreferrer noopener">Community Leaders</a></li>
              <li><a href="https://truesight.me/members-directory" target="_blank" rel="noreferrer noopener">Members Directory</a></li>
              <li><a href="https://truesight.me/recurring-tdg-awards" target="_blank" rel="noreferrer noopener">Ongoing Awards</a></li>
              <li><a href="https://truesight.me/submissions/scored-and-to-be-tokenized" target="_blank" rel="noreferrer noopener">Upcoming Awards</a></li>
              <li><a href="https://truesight.me/beerhall" target="_blank" rel="noreferrer noopener">Join Chat</a></li>
            </ul>
          </li>
          <li>
            <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Resources</button>
            <ul class="dropdown-menu" aria-expanded="false">
              <li><a href="../../faq.html">Frequently Asked Questions</a></li>
              <li><a href="https://truesight.me/whitepaper" target="_blank" rel="noreferrer noopener">Whitepaper</a></li>
              <li><a href="https://truesight.me/tokenomics" target="_blank" rel="noreferrer noopener">Tokenomics</a></li>
              <li><a href="https://truesight.me/dapp" target="_blank" rel="noreferrer noopener">Web App</a></li>
              <li><a href="https://truesight.me/ledger" target="_blank" rel="noreferrer noopener">Contributions Record</a></li>
              <li><a href="https://truesight.me/roadmap" target="_blank" rel="noreferrer noopener">Roadmap</a></li>
            </ul>
          </li>
          <li><a href="../../blog/index.html">Blog</a></li>
        </ul>
      </div>
    </nav>
    <div class="page">
      <div style="margin-bottom: var(--space-sm);">
        <a href="../../sunmint.html" class="text-link">← Back to Sunmint</a>
      </div>
      
      <header class="hero" style="text-align: left; padding-top: var(--space-sm); padding-bottom: var(--space-md);">
        <p class="pill">PLEDGE TITLE:</p>
        <h1>${title}</h1>
        <p class="section-lead">
          View transparent details for this Sunmint tree-planting pledge, supported by TrueSight DAO.
        </p>
        ${treesToBePlanted ? `
        <div style="margin-top: var(--space-lg); padding: var(--space-lg); background: rgba(244, 163, 0, 0.1); border: 2px solid rgba(244, 163, 0, 0.3); border-radius: 16px; display: inline-block;">
          <div style="font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); font-weight: 600; margin-bottom: var(--space-xs);">Trees to be Planted</div>
          <div style="font-size: 2.5rem; font-weight: 700; color: var(--accent-2); line-height: 1.2;">
            <span data-trees-sold data-shipment-id="${title.toLowerCase()}" style="display: inline-block;">
              ${treesToBePlanted}
            </span>
            <span class="trees-sold-loading" style="display: none; margin-left: 0.5rem; font-size: 1rem; color: var(--muted); font-weight: 400;">(updating...)</span>
          </div>
        </div>
        ` : ''}
      </header>

      <section>
        <div class="shipment-detail-grid" style="display: grid; grid-template-columns: 1fr 2fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div>
            ${fs.existsSync(path.join(__dirname, `../${imagePath}`)) ? `<img src="../../${imagePath}" alt="${title}" style="width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: var(--space-md);" loading="lazy" />` : ''}
            <h2 style="margin-top: 0;">${title}</h2>
          </div>
          
          <div>
            <h3>PLEDGE Overview</h3>
            <dl style="display: grid; gap: var(--space-xs);">
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">PLEDGE TITLE</dt>
                <dd style="margin: 0; color: var(--muted);">${title}</dd>
              </div>
              ${status ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Status</dt>
                <dd style="margin: 0; color: var(--muted);">${status}</dd>
              </div>
              ` : ''}
              ${date ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">PLEDGE START Date</dt>
                <dd style="margin: 0; color: var(--muted);">${date}</dd>
              </div>
              ` : ''}
              ${treesToBePlanted ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
                <dt style="font-weight: 600; color: var(--text);">Trees to be Planted</dt>
                <dd style="margin: 0; color: var(--muted);">
                  <span data-trees-sold data-shipment-id="${title.toLowerCase()}" style="display: inline-block;">
                    ${treesToBePlanted}
                  </span>
                  <span class="trees-sold-loading" style="display: none; margin-left: 0.5rem; font-size: 0.875rem; color: var(--muted);">(updating...)</span>
                </dd>
              </div>
              ` : ''}
              ${shopUrl ? `
              <div class="shipment-detail-row" style="display: grid; grid-template-columns: 200px 1fr; gap: var(--space-sm); padding: var(--space-xs) 0; border-bottom: 1px solid rgba(95, 111, 82, 0.1);">
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
              <li style="margin-bottom: var(--space-xs);"><a href="${truesightDaoShipmentUrl}" ${truesightDaoShipmentUrl.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''} class="text-link">TrueSight DAO Shipment Page</a></li>
            </ul>
            ` : ''}
          </div>
        </div>
      </section>
    </div>
    ${generateFooterHTML('../../')}
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
      
      // Hamburger menu toggle and dropdown functionality
      (function() {
        const menuToggle = document.querySelector('.menu-toggle');
        const navMenu = document.querySelector('.nav-menu');
        const siteHeader = document.querySelector('.site-header');
        
        if (!menuToggle || !navMenu) return;
        
        // Hamburger menu toggle
        menuToggle.addEventListener('click', function() {
          const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
          menuToggle.setAttribute('aria-expanded', !isExpanded);
          navMenu.setAttribute('aria-hidden', isExpanded);
          siteHeader.classList.toggle('menu-open', !isExpanded);
        });
        
        // Dropdown toggle functionality (for mobile)
        const dropdownToggles = navMenu.querySelectorAll('.dropdown-toggle');
        dropdownToggles.forEach(function(toggle) {
          toggle.addEventListener('click', function(e) {
            // On mobile, toggle the dropdown
            if (window.innerWidth <= 768) {
              e.preventDefault();
              e.stopPropagation();
              const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
              const dropdownMenu = toggle.nextElementSibling;
              
              toggle.setAttribute('aria-expanded', !isExpanded);
              if (dropdownMenu) {
                dropdownMenu.setAttribute('aria-expanded', !isExpanded);
              }
            }
          });
        });
        
        // Close menu when clicking on a link
        navMenu.addEventListener('click', function(e) {
          if (e.target.tagName === 'A') {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
            
            // Close all dropdowns
            dropdownToggles.forEach(function(toggle) {
              toggle.setAttribute('aria-expanded', 'false');
              const dropdownMenu = toggle.nextElementSibling;
              if (dropdownMenu) {
                dropdownMenu.setAttribute('aria-expanded', 'false');
              }
            });
          }
        });
        
        // Close menu when clicking overlay
        siteHeader.addEventListener('click', function(e) {
          if (e.target === siteHeader || e.target.classList.contains('site-header')) {
            menuToggle.setAttribute('aria-expanded', 'false');
            navMenu.setAttribute('aria-hidden', 'true');
            siteHeader.classList.remove('menu-open');
          }
        });
      })();
      
      // Load trees sold count dynamically
      (function() {
        const treesSoldElement = document.querySelector('[data-trees-sold]');
        if (!treesSoldElement) return;
        
        const shipmentId = treesSoldElement.getAttribute('data-shipment-id');
        if (!shipmentId) return;
        
        const loadingElement = document.querySelector('.trees-sold-loading');
        if (loadingElement) {
          loadingElement.style.display = 'inline';
        }
        
        const serviceUrl = 'https://script.google.com/macros/s/AKfycbzlfOBo9UqKOh7jIqGcmbPAMM1RxCbsJHb-UV_vM6VbvK_HSdT44KyGbbXIeo-_Ovfy/exec';
        fetch(serviceUrl + '?shipmentId=' + encodeURIComponent(shipmentId))
          .then(function(response) {
            if (!response.ok) {
              throw new Error('HTTP error! status: ' + response.status);
            }
            return response.json();
          })
          .then(function(data) {
            if (data.error) {
              console.warn('Error fetching trees sold:', data.message);
              return;
            }
            
            if (data.treesSold !== undefined && data.treesSold !== null) {
              treesSoldElement.textContent = data.treesSold;
              treesSoldElement.classList.add('loaded');
            }
          })
          .catch(function(error) {
            console.warn('Error fetching trees sold count:', error);
          })
          .finally(function() {
            if (loadingElement) {
              loadingElement.style.display = 'none';
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

// Main execution
if (require.main === module) {
  loadShipmentsFromGoogleSheets().then(() => {
    console.log('\n✅ All pages generated successfully!');
  }).catch(error => {
    console.error('❌ Error generating pages:', error);
    process.exit(1);
  });
}





