# TrueSight DAO Website

A lightweight, hand-crafted static website for TrueSight DAO, migrated from WIX to a modern static site architecture. The site focuses on the DAO's mission, transparent ecosystem statistics, community initiatives, and the community-governed workflow.

## Table of Contents

- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Data Sources](#data-sources)
- [Key Workflows](#key-workflows)
- [Scripts Reference](#scripts-reference)
- [Making Changes](#making-changes)
- [Styling & Design System](#styling--design-system)
- [Deployment](#deployment)
- [Dependencies](#dependencies)

## Project Overview

This is a static website built with vanilla HTML, CSS, and JavaScript. The site includes:

- **Main landing page** (`index.html`) - DAO overview, stats, initiatives
- **Agroverse page** (`agroverse.html`) - Cacao shipment listings and details
- **Sunmint page** (`sunmint.html`) - Tree planting impact registry
- **Edgar page** (`edgar.html`) - Educational modules
- **Blog** (`blog/`) - Blog posts and articles
- **Individual shipment/pledge pages** - Dynamically generated detail pages

### Design Philosophy

- Foundation uses **Earthen Sand** `#F7F1E8` and **Weathered Clay** `#ECE2D1` for a natural, monk-inspired calm
- Primary accent remains **Saffron Monk** `#F4A300`, paired with **Deep Saffron** `#D38900` and **Honey Husk** `#F6C86D`
- Supporting tones: **Forest Canopy** `#5F6F52` for structure and **Amazon Clay** `#C08457` for warmth
- The site avoids black entirely, leaning on soft beige gradients and saffron blooms reminiscent of monastery lantern light

## Project Structure

```
truesight_me/
├── index.html                 # Main landing page
├── agroverse.html             # Agroverse shipments listing
├── sunmint.html               # Sunmint impact registry listing
├── edgar.html                 # Edgar educational modules
├── about-us.html              # About page
├── blog/                      # Blog posts
│   ├── index.html
│   └── posts/                 # Individual blog post HTML files
├── agroverse-shipments/       # Individual shipment detail pages
│   └── {agl}/index.html       # e.g., agl13/index.html
├── sunmint-tree-planting-pledges/  # Individual impact registry pages
│   └── {agl}/index.html       # e.g., agl13/index.html
├── redirects/                 # HTML redirect pages for old WIX URLs
├── assets/
│   ├── shipments/             # Shipment images (AGL, PP1, SEF1)
│   ├── raw/                   # Temporary/raw assets (to be cleaned up)
│   └── ...                    # Other static assets
├── data/
│   ├── exchange-rates/        # Individual JSON files for exchange rates
│   ├── agroverse-shipments.js # Shipment data (legacy, now uses Google Sheets)
│   ├── blog-posts.js          # Blog post metadata
│   └── edgar-modules.js       # Edgar module data
├── styles/
│   └── main.css               # Main stylesheet with design system
├── scripts/                   # Node.js automation scripts
│   ├── generate-shipment-pages.js    # Generate individual pages from Google Sheets
│   ├── merge-and-upload-shipments.js # Upload CSV data to Google Sheets
│   ├── generate-redirects.js         # Generate redirect files
│   ├── identify-redirects.js          # Auto-identify redirects from CSV
│   └── ...                    # Other utility scripts
├── docs/                      # Documentation
│   ├── GITHUB_PAGES_DEPLOYMENT.md  # GitHub Pages deployment guide ⭐
│   ├── REDIRECTS.md           # Redirect system documentation
│   └── EXCHANGE_RATES_UPDATE_APPROACH.md
├── wix_redirects.csv          # Master redirect mapping file
└── google-service-account.json # Google Sheets API credentials (gitignored)

```

## Data Sources

### Primary Data Source: Google Sheets

**Master Spreadsheet**: [TrueSight DAO Contribution Ledger](https://docs.google.com/spreadsheets/d/1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU)

- **Tab**: "Shipment Ledger Listing"
- **Service Account**: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`
- **Credentials**: `google-service-account.json` (not in git)

This Google Sheet is the **single source of truth** for:
- Shipment data (AGL0-AGL14, PP1, SEF1)
- Shipment images (GitHub URLs)
- Coordinates (Latitude/Longitude extracted from Google Maps URLs)
- Flags (`is_cacao_shipment`, `serialized`) that determine which pages to generate

### CSV Files (Legacy/Backup)

- `assets/raw/shipments_collection.csv` - Original shipment data
- `assets/raw/Agroverse+Shipments_new.csv` - Updated shipment data

**Note**: CSV files are used for initial data import/merge, but Google Sheets is the master.

### Exchange Rates

Individual JSON files in `data/exchange-rates/`:
- `ASSET_PER_TDG_ISSUED.json`
- `GAS_FEE.json`
- `PAST_30_DAYS_SALES.json`
- `TDG_DAILY_BUY_BACK_BUDGET.json`
- etc.

These are updated via Google Apps Script (see `google_app_scripts/`).

## Key Workflows

### 1. Generating Individual Shipment/Pledge Pages

**Script**: `scripts/generate-shipment-pages.js`

**What it does**:
- Reads data from Google Sheets "Shipment Ledger Listing"
- Generates individual HTML pages for:
  - **Agroverse shipments**: `agroverse-shipments/{agl}/index.html` (where `is_cacao_shipment = true`)
  - **Sunmint pledges**: `sunmint-tree-planting-pledges/{agl}/index.html` (where `serialized = true`)
- Embeds Leaflet maps using Latitude/Longitude from Google Sheets
- Includes all shipment metadata, links, and images

**Usage**:
```bash
node scripts/generate-shipment-pages.js
```

**Output**:
- Creates directory structure: `agroverse-shipments/agl13/index.html`
- Each page includes: image, description, overview, financing details, document links, embedded map

**Key Features**:
- Extracts coordinates from Google Maps URLs if Latitude/Longitude not present
- Sanitizes meta descriptions (strips HTML, escapes quotes)
- Mobile-responsive with proper CSS classes
- Clean URLs (no `.html` extension)

### 2. Uploading Data to Google Sheets

**Script**: `scripts/merge-and-upload-shipments.js`

**What it does**:
- Merges data from both CSV files (`shipments_collection.csv` and `Agroverse+Shipments_new.csv`)
- Uploads merged data to Google Sheets
- **Preserves existing values** - only updates empty cells
- Automatically adds missing columns to the sheet
- Extracts coordinates from Google Maps URLs
- Maps shipment images to GitHub URLs

**Usage**:
```bash
node scripts/merge-and-upload-shipments.js
```

**Important**:
- Requires `google-service-account.json` in project root
- Service account must have edit access to the Google Sheet
- Only updates empty cells to preserve manual edits

### 3. Managing Redirects

**Workflow**:

1. **Identify redirects** (auto-detect from CSV):
   ```bash
   node scripts/identify-redirects.js
   ```
   - Scans CSV files for old URL patterns
   - Maps `/shipments/agl13` → `/agroverse-shipments/agl13`
   - Handles conflicts (shipments in both Agroverse and Sunmint)
   - Generates `wix_redirects.csv`

2. **Generate redirect files**:
   ```bash
   node scripts/generate-redirects.js
   ```
   - Creates HTML redirect pages in `redirects/` directory
   - Generates platform-specific configs: `nginx-redirects.conf` (for reference only)

3. **Manual redirects**: Edit `wix_redirects.csv` and re-run step 2

**See**: `docs/REDIRECTS.md` for detailed documentation

### 4. Updating Exchange Rates

Exchange rates are stored as individual JSON files in `data/exchange-rates/`. These are updated via Google Apps Script (see `google_app_scripts/sync_performance_statistics.gs`).

The main page (`index.html`) dynamically loads these files.

## Scripts Reference

### Core Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `generate-shipment-pages.js` | Generate individual shipment/pledge pages from Google Sheets | After updating Google Sheets data |
| `merge-and-upload-shipments.js` | Upload CSV data to Google Sheets | When importing new CSV data |
| `generate-redirects.js` | Generate redirect files from CSV | When adding/updating redirects |
| `identify-redirects.js` | Auto-detect redirects from CSV | Before generating redirects |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `update-coordinates-from-urls.js` | Extract and update coordinates from Google Maps URLs |
| `update-cacao-serialized-values.js` | Force-update `is_cacao_shipment` and `serialized` flags |
| `syncBlogPosts.js` | Sync blog posts from WIX |
| `syncAgroverseShipments.js` | Sync shipments from WIX (legacy) |

## Making Changes

### Adding a New Shipment

1. **Add data to Google Sheets**:
   - Open [TrueSight DAO Contribution Ledger](https://docs.google.com/spreadsheets/d/1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU)
   - Go to "Shipment Ledger Listing" tab
   - Add new row with shipment data
   - Set `Is Cacao Shipment` = `true` for Agroverse pages
   - Set `Serialized` = `true` for Sunmint pages
   - Add `Shipment Image` URL (GitHub raw URL)
   - Add `Google Maps URL` (coordinates will be auto-extracted)

2. **Generate pages**:
   ```bash
   node scripts/generate-shipment-pages.js
   ```

3. **Add image**:
   - Place image in `assets/shipments/` as `{shipment_id}.avif` or `{shipment_id}.gif`
   - Update Google Sheet with GitHub URL: `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/{shipment_id}.{ext}`

### Updating Shipment Data

1. **Edit Google Sheets** directly (preferred)
2. **Or** update CSV and upload:
   ```bash
   node scripts/merge-and-upload-shipments.js
   ```
3. **Regenerate pages**:
   ```bash
   node scripts/generate-shipment-pages.js
   ```

### Adding a Redirect

1. **Edit `wix_redirects.csv`**:
   ```csv
   old_url,new_url
   /old/path,/new/path
   ```

2. **Generate redirect files**:
   ```bash
   node scripts/generate-redirects.js
   ```

### Updating Styling

- **Main stylesheet**: `styles/main.css`
- **Design tokens**: CSS variables at the top of `main.css`
- **Responsive breakpoints**: `@media (max-width: 640px)` and `@media (max-width: 480px)`

**Key CSS classes**:
- `.shipment-detail-grid` - Main content grid (2 columns desktop, 1 column mobile)
- `.shipment-detail-row` - Definition list rows (side-by-side desktop, stacked mobile)
- `.hero[style*="text-align: left"]` - Left-aligned hero sections

### Updating Exchange Rates

Exchange rates are managed via Google Apps Script. See `google_app_scripts/sync_performance_statistics.gs`.

## Styling & Design System

### CSS Variables

Located at the top of `styles/main.css`:

```css
:root {
  --space-xs: 0.5rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2.5rem;
  --space-xl: 4rem;
  
  --text: #2C2416;
  --muted: #6B5D4F;
  --bg: #F7F1E8;
  --bg-alt: #ECE2D1;
  --accent: #F4A300;
  --accent-dark: #D38900;
  --accent-light: #F6C86D;
  --structure: #5F6F52;
  --warmth: #C08457;
}
```

### Responsive Design

- **Desktop**: Default styles
- **Tablet** (`@media (max-width: 640px)`): Adjusted spacing, stacked layouts
- **Mobile** (`@media (max-width: 480px)`): Further reduced spacing, single-column layouts

### Key Components

- **Cards**: `.solution-card`, `.impact-card`, `.module-card`, `.shipment-card`
- **Tables**: `.shipment-table` (desktop), `.shipments-cards` (mobile)
- **Hero sections**: `.hero` with optional left alignment
- **Definition lists**: `.shipment-detail-row` for key-value pairs

## Deployment

### GitHub Pages

1. Push changes to `main` branch
2. GitHub Pages automatically deploys from `main` branch
3. Custom domain configured via `CNAME` file

### Other Platforms (Not Currently Used)

If migrating to other platforms in the future:
- **Netlify**: Create `_redirects` file for redirects
- **Apache**: Create `.htaccess` file for redirects
- **Nginx**: Include `nginx-redirects.conf` in server config

**Note:** Currently, truesight.me uses GitHub Pages exclusively. Redirects are implemented as HTML files (e.g., `ttl/irs/index.html`), not server-side configuration files.

### Pre-Deployment Checklist

- [ ] Run `node scripts/generate-shipment-pages.js` to ensure pages are up-to-date
- [ ] Test redirects locally if changed
- [ ] Verify images are accessible (GitHub raw URLs)
- [ ] Check mobile responsiveness
- [ ] Verify Google Sheets access (service account)

## Dependencies

### Node.js Packages

```json
{
  "dependencies": {
    "dotenv": "^17.2.3",
    "google-auth-library": "^9.15.1",
    "google-spreadsheet": "^4.1.5",
    "googleapis": "^166.0.0"
  },
  "devDependencies": {
    "jsdom": "^27.2.0",
    "playwright": "^1.56.1"
  }
}
```

### Installation

```bash
npm install
```

### Required Files

- `google-service-account.json` - Google Sheets API credentials (not in git)
  - Service account: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`
  - Must have edit access to spreadsheet `1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU`

## Local Development

### Preview

```bash
# Simple HTTP server
python3 -m http.server 8080

# Or use any static file server
npx serve .
```

Visit `http://localhost:8080`

### Testing Scripts

```bash
# Generate pages
node scripts/generate-shipment-pages.js

# Upload to Google Sheets
node scripts/merge-and-upload-shipments.js

# Generate redirects
node scripts/generate-redirects.js
```

## Important Notes

### URL Structure

- Individual pages use clean URLs: `/agroverse-shipments/agl13` (not `/agroverse-shipments/agl13.html`)
- Achieved by creating directories with `index.html` files
- Redirects maintain old WIX URL structure

### Image Management

- Shipment images stored in `assets/shipments/`
- Images referenced via GitHub raw URLs in Google Sheets
- Format: `{shipment_id}.avif` or `{shipment_id}.gif`

### Data Flow

```
CSV Files → Google Sheets (merge-and-upload-shipments.js)
                ↓
         Google Sheets (master)
                ↓
    Individual Pages (generate-shipment-pages.js)
```

### Conflict Resolution

- **Shipments in both Agroverse and Sunmint**: Scripts prioritize Agroverse for redirects
- **Empty vs. existing values**: Upload scripts preserve existing non-empty values
- **Missing columns**: Scripts automatically add missing columns to Google Sheets

## Troubleshooting

### Pages not generating

- Check Google Sheets access (service account credentials)
- Verify `is_cacao_shipment` and `serialized` flags are set correctly
- Check for JavaScript errors in generated pages

### Redirects not working

- Verify redirect HTML files are deployed (e.g., `ttl/irs/index.html`)
- Check `redirects/` directory is included in deployment
- Test redirect URLs manually

### Images not loading

- Verify GitHub raw URLs in Google Sheets
- Check image files exist in `assets/shipments/`
- Ensure GitHub repository is public

### Mobile layout issues

- Check CSS media queries in `styles/main.css`
- Verify `shipment-detail-grid` and `shipment-detail-row` classes are applied
- Test on actual mobile devices, not just browser dev tools

## Additional Documentation

- **GitHub Pages Deployment**: See `docs/GITHUB_PAGES_DEPLOYMENT.md` ⭐ **Important: Read this to understand redirects**
- **Redirects**: See `docs/REDIRECTS.md`
- **Exchange Rates**: See `docs/EXCHANGE_RATES_UPDATE_APPROACH.md`
- **Google Sheets Upload**: See `scripts/README_UPLOAD_SHEETS.md`

---

**Repository**: [github.com/TrueSightDAO/truesight_me](https://github.com/TrueSightDAO/truesight_me)  
**Live Site**: [truesight.me](https://truesight.me)  
**Deployment Platform**: GitHub Pages (not Vercel/Netlify/Apache)

truesight_me/
├── index.html                 # Main landing page
├── agroverse.html             # Agroverse shipments listing
├── sunmint.html               # Sunmint impact registry listing
├── edgar.html                 # Edgar educational modules
├── about-us.html              # About page
├── blog/                      # Blog posts
│   ├── index.html
│   └── posts/                 # Individual blog post HTML files
├── agroverse-shipments/       # Individual shipment detail pages
│   └── {agl}/index.html       # e.g., agl13/index.html
├── sunmint-tree-planting-pledges/  # Individual impact registry pages
│   └── {agl}/index.html       # e.g., agl13/index.html
├── redirects/                 # HTML redirect pages for old WIX URLs
├── assets/
│   ├── shipments/             # Shipment images (AGL, PP1, SEF1)
│   ├── raw/                   # Temporary/raw assets (to be cleaned up)
│   └── ...                    # Other static assets
├── data/
│   ├── exchange-rates/        # Individual JSON files for exchange rates
│   ├── agroverse-shipments.js # Shipment data (legacy, now uses Google Sheets)
│   ├── blog-posts.js          # Blog post metadata
│   └── edgar-modules.js       # Edgar module data
├── styles/
│   └── main.css               # Main stylesheet with design system
├── scripts/                   # Node.js automation scripts
│   ├── generate-shipment-pages.js    # Generate individual pages from Google Sheets
│   ├── merge-and-upload-shipments.js # Upload CSV data to Google Sheets
│   ├── generate-redirects.js         # Generate redirect files
│   ├── identify-redirects.js          # Auto-identify redirects from CSV
│   └── ...                    # Other utility scripts
├── docs/                      # Documentation
│   ├── GITHUB_PAGES_DEPLOYMENT.md  # GitHub Pages deployment guide ⭐
│   ├── REDIRECTS.md           # Redirect system documentation
│   └── EXCHANGE_RATES_UPDATE_APPROACH.md
├── wix_redirects.csv          # Master redirect mapping file
└── google-service-account.json # Google Sheets API credentials (gitignored)

```

## Data Sources

### Primary Data Source: Google Sheets

**Master Spreadsheet**: [TrueSight DAO Contribution Ledger](https://docs.google.com/spreadsheets/d/1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU)

- **Tab**: "Shipment Ledger Listing"
- **Service Account**: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`
- **Credentials**: `google-service-account.json` (not in git)

This Google Sheet is the **single source of truth** for:
- Shipment data (AGL0-AGL14, PP1, SEF1)
- Shipment images (GitHub URLs)
- Coordinates (Latitude/Longitude extracted from Google Maps URLs)
- Flags (`is_cacao_shipment`, `serialized`) that determine which pages to generate

### CSV Files (Legacy/Backup)

- `assets/raw/shipments_collection.csv` - Original shipment data
- `assets/raw/Agroverse+Shipments_new.csv` - Updated shipment data

**Note**: CSV files are used for initial data import/merge, but Google Sheets is the master.

### Exchange Rates

Individual JSON files in `data/exchange-rates/`:
- `ASSET_PER_TDG_ISSUED.json`
- `GAS_FEE.json`
- `PAST_30_DAYS_SALES.json`
- `TDG_DAILY_BUY_BACK_BUDGET.json`
- etc.

These are updated via Google Apps Script (see `google_app_scripts/`).

## Key Workflows

### 1. Generating Individual Shipment/Pledge Pages

**Script**: `scripts/generate-shipment-pages.js`

**What it does**:
- Reads data from Google Sheets "Shipment Ledger Listing"
- Generates individual HTML pages for:
  - **Agroverse shipments**: `agroverse-shipments/{agl}/index.html` (where `is_cacao_shipment = true`)
  - **Sunmint pledges**: `sunmint-tree-planting-pledges/{agl}/index.html` (where `serialized = true`)
- Embeds Leaflet maps using Latitude/Longitude from Google Sheets
- Includes all shipment metadata, links, and images

**Usage**:
```bash
node scripts/generate-shipment-pages.js
```

**Output**:
- Creates directory structure: `agroverse-shipments/agl13/index.html`
- Each page includes: image, description, overview, financing details, document links, embedded map

**Key Features**:
- Extracts coordinates from Google Maps URLs if Latitude/Longitude not present
- Sanitizes meta descriptions (strips HTML, escapes quotes)
- Mobile-responsive with proper CSS classes
- Clean URLs (no `.html` extension)

### 2. Uploading Data to Google Sheets

**Script**: `scripts/merge-and-upload-shipments.js`

**What it does**:
- Merges data from both CSV files (`shipments_collection.csv` and `Agroverse+Shipments_new.csv`)
- Uploads merged data to Google Sheets
- **Preserves existing values** - only updates empty cells
- Automatically adds missing columns to the sheet
- Extracts coordinates from Google Maps URLs
- Maps shipment images to GitHub URLs

**Usage**:
```bash
node scripts/merge-and-upload-shipments.js
```

**Important**:
- Requires `google-service-account.json` in project root
- Service account must have edit access to the Google Sheet
- Only updates empty cells to preserve manual edits

### 3. Managing Redirects

**Workflow**:

1. **Identify redirects** (auto-detect from CSV):
   ```bash
   node scripts/identify-redirects.js
   ```
   - Scans CSV files for old URL patterns
   - Maps `/shipments/agl13` → `/agroverse-shipments/agl13`
   - Handles conflicts (shipments in both Agroverse and Sunmint)
   - Generates `wix_redirects.csv`

2. **Generate redirect files**:
   ```bash
   node scripts/generate-redirects.js
   ```
   - Creates HTML redirect pages in `redirects/` directory
   - Generates platform-specific configs: `nginx-redirects.conf` (for reference only)

3. **Manual redirects**: Edit `wix_redirects.csv` and re-run step 2

**See**: `docs/REDIRECTS.md` for detailed documentation

### 4. Updating Exchange Rates

Exchange rates are stored as individual JSON files in `data/exchange-rates/`. These are updated via Google Apps Script (see `google_app_scripts/sync_performance_statistics.gs`).

The main page (`index.html`) dynamically loads these files.

## Scripts Reference

### Core Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `generate-shipment-pages.js` | Generate individual shipment/pledge pages from Google Sheets | After updating Google Sheets data |
| `merge-and-upload-shipments.js` | Upload CSV data to Google Sheets | When importing new CSV data |
| `generate-redirects.js` | Generate redirect files from CSV | When adding/updating redirects |
| `identify-redirects.js` | Auto-detect redirects from CSV | Before generating redirects |

### Utility Scripts

| Script | Purpose |
|--------|---------|
| `update-coordinates-from-urls.js` | Extract and update coordinates from Google Maps URLs |
| `update-cacao-serialized-values.js` | Force-update `is_cacao_shipment` and `serialized` flags |
| `syncBlogPosts.js` | Sync blog posts from WIX |
| `syncAgroverseShipments.js` | Sync shipments from WIX (legacy) |

## Making Changes

### Adding a New Shipment

1. **Add data to Google Sheets**:
   - Open [TrueSight DAO Contribution Ledger](https://docs.google.com/spreadsheets/d/1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU)
   - Go to "Shipment Ledger Listing" tab
   - Add new row with shipment data
   - Set `Is Cacao Shipment` = `true` for Agroverse pages
   - Set `Serialized` = `true` for Sunmint pages
   - Add `Shipment Image` URL (GitHub raw URL)
   - Add `Google Maps URL` (coordinates will be auto-extracted)

2. **Generate pages**:
   ```bash
   node scripts/generate-shipment-pages.js
   ```

3. **Add image**:
   - Place image in `assets/shipments/` as `{shipment_id}.avif` or `{shipment_id}.gif`
   - Update Google Sheet with GitHub URL: `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/{shipment_id}.{ext}`

### Updating Shipment Data

1. **Edit Google Sheets** directly (preferred)
2. **Or** update CSV and upload:
   ```bash
   node scripts/merge-and-upload-shipments.js
   ```
3. **Regenerate pages**:
   ```bash
   node scripts/generate-shipment-pages.js
   ```

### Adding a Redirect

1. **Edit `wix_redirects.csv`**:
   ```csv
   old_url,new_url
   /old/path,/new/path
   ```

2. **Generate redirect files**:
   ```bash
   node scripts/generate-redirects.js
   ```

### Updating Styling

- **Main stylesheet**: `styles/main.css`
- **Design tokens**: CSS variables at the top of `main.css`
- **Responsive breakpoints**: `@media (max-width: 640px)` and `@media (max-width: 480px)`

**Key CSS classes**:
- `.shipment-detail-grid` - Main content grid (2 columns desktop, 1 column mobile)
- `.shipment-detail-row` - Definition list rows (side-by-side desktop, stacked mobile)
- `.hero[style*="text-align: left"]` - Left-aligned hero sections

### Updating Exchange Rates

Exchange rates are managed via Google Apps Script. See `google_app_scripts/sync_performance_statistics.gs`.

## Styling & Design System

### CSS Variables

Located at the top of `styles/main.css`:

```css
:root {
  --space-xs: 0.5rem;
  --space-sm: 1rem;
  --space-md: 1.5rem;
  --space-lg: 2.5rem;
  --space-xl: 4rem;
  
  --text: #2C2416;
  --muted: #6B5D4F;
  --bg: #F7F1E8;
  --bg-alt: #ECE2D1;
  --accent: #F4A300;
  --accent-dark: #D38900;
  --accent-light: #F6C86D;
  --structure: #5F6F52;
  --warmth: #C08457;
}
```

### Responsive Design

- **Desktop**: Default styles
- **Tablet** (`@media (max-width: 640px)`): Adjusted spacing, stacked layouts
- **Mobile** (`@media (max-width: 480px)`): Further reduced spacing, single-column layouts

### Key Components

- **Cards**: `.solution-card`, `.impact-card`, `.module-card`, `.shipment-card`
- **Tables**: `.shipment-table` (desktop), `.shipments-cards` (mobile)
- **Hero sections**: `.hero` with optional left alignment
- **Definition lists**: `.shipment-detail-row` for key-value pairs

## Deployment

### GitHub Pages

1. Push changes to `main` branch
2. GitHub Pages automatically deploys from `main` branch
3. Custom domain configured via `CNAME` file

### Other Platforms (Not Currently Used)

If migrating to other platforms in the future:
- **Netlify**: Create `_redirects` file for redirects
- **Apache**: Create `.htaccess` file for redirects
- **Nginx**: Include `nginx-redirects.conf` in server config

**Note:** Currently, truesight.me uses GitHub Pages exclusively. Redirects are implemented as HTML files (e.g., `ttl/irs/index.html`), not server-side configuration files.

### Pre-Deployment Checklist

- [ ] Run `node scripts/generate-shipment-pages.js` to ensure pages are up-to-date
- [ ] Test redirects locally if changed
- [ ] Verify images are accessible (GitHub raw URLs)
- [ ] Check mobile responsiveness
- [ ] Verify Google Sheets access (service account)

## Dependencies

### Node.js Packages

```json
{
  "dependencies": {
    "dotenv": "^17.2.3",
    "google-auth-library": "^9.15.1",
    "google-spreadsheet": "^4.1.5",
    "googleapis": "^166.0.0"
  },
  "devDependencies": {
    "jsdom": "^27.2.0",
    "playwright": "^1.56.1"
  }
}
```

### Installation

```bash
npm install
```

### Required Files

- `google-service-account.json` - Google Sheets API credentials (not in git)
  - Service account: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`
  - Must have edit access to spreadsheet `1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU`

## Local Development

### Preview

```bash
# Simple HTTP server
python3 -m http.server 8080

# Or use any static file server
npx serve .
```

Visit `http://localhost:8080`

### Testing Scripts

```bash
# Generate pages
node scripts/generate-shipment-pages.js

# Upload to Google Sheets
node scripts/merge-and-upload-shipments.js

# Generate redirects
node scripts/generate-redirects.js
```

## Important Notes

### URL Structure

- Individual pages use clean URLs: `/agroverse-shipments/agl13` (not `/agroverse-shipments/agl13.html`)
- Achieved by creating directories with `index.html` files
- Redirects maintain old WIX URL structure

### Image Management

- Shipment images stored in `assets/shipments/`
- Images referenced via GitHub raw URLs in Google Sheets
- Format: `{shipment_id}.avif` or `{shipment_id}.gif`

### Data Flow

```
CSV Files → Google Sheets (merge-and-upload-shipments.js)
                ↓
         Google Sheets (master)
                ↓
    Individual Pages (generate-shipment-pages.js)
```

### Conflict Resolution

- **Shipments in both Agroverse and Sunmint**: Scripts prioritize Agroverse for redirects
- **Empty vs. existing values**: Upload scripts preserve existing non-empty values
- **Missing columns**: Scripts automatically add missing columns to Google Sheets

## Troubleshooting

### Pages not generating

- Check Google Sheets access (service account credentials)
- Verify `is_cacao_shipment` and `serialized` flags are set correctly
- Check for JavaScript errors in generated pages

### Redirects not working

- Verify redirect HTML files are deployed (e.g., `ttl/irs/index.html`)
- Check `redirects/` directory is included in deployment
- Test redirect URLs manually

### Images not loading

- Verify GitHub raw URLs in Google Sheets
- Check image files exist in `assets/shipments/`
- Ensure GitHub repository is public

### Mobile layout issues

- Check CSS media queries in `styles/main.css`
- Verify `shipment-detail-grid` and `shipment-detail-row` classes are applied
- Test on actual mobile devices, not just browser dev tools

## Additional Documentation

- **GitHub Pages Deployment**: See `docs/GITHUB_PAGES_DEPLOYMENT.md` ⭐ **Important: Read this to understand redirects**
- **Redirects**: See `docs/REDIRECTS.md`
- **Exchange Rates**: See `docs/EXCHANGE_RATES_UPDATE_APPROACH.md`
- **Google Sheets Upload**: See `scripts/README_UPLOAD_SHEETS.md`

---
