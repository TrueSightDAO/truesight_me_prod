# TrueSight.me — Claude Code Deep Dive Notes

**Generated**: 2026-01-29
**Purpose**: Comprehensive technical notes for AI assistants working on truesight.me

---

## Project Overview

TrueSight.me is a **static website** for TrueSight DAO, migrated from Wix to GitHub Pages. It's a hand-crafted HTML/CSS/JS site that pulls data from Google Sheets and Wix APIs to generate pages dynamically at build time.

**Key Facts**:
- **Deployment**: GitHub Pages (NOT Vercel/Netlify/Apache)
- **Domain**: truesight.me (via CNAME)
- **Repo**: github.com/TrueSightDAO/truesight_me
- **Branch**: `main` (auto-deploys)
- **Design**: "Saffron Monk" aesthetic - earthen tones, no black, monastery-inspired

---

## Architecture

### Site Structure

```
truesight_me/
├── Main Pages (hand-crafted HTML)
│   ├── index.html              # Landing: stats, initiatives, DAO overview
│   ├── agroverse.html          # Cacao shipments listing
│   ├── sunmint.html            # Tree planting pledges listing
│   ├── edgar.html              # Educational modules
│   ├── about-us.html           # About DAO
│   └── faq.html                # FAQ
│
├── Generated Pages (from Google Sheets)
│   ├── agroverse-shipments/{agl}/index.html     # Individual shipment detail
│   └── sunmint-tree-planting-pledges/{agl}/     # Individual pledge detail
│
├── Redirects (HTML meta refresh)
│   ├── ttl/irs/index.html      # Hand-crafted redirects
│   └── redirects/              # Auto-generated from CSV
│
├── Data Files
│   ├── data/exchange-rates/    # Individual JSON files (from Wix/GAS)
│   ├── data/agroverse-shipments.js (legacy)
│   └── data/edgar-modules.js
│
├── Assets
│   ├── assets/shipments/       # agl0.avif, agl1.avif, ... agl7.gif, pp1.avif, sef1.avif
│   └── assets/raw/             # CSV backups (shipments_collection.csv, etc.)
│
├── Scripts (Node.js automation)
│   ├── generate-shipment-pages.js         # 🔥 Core: Generate pages from Sheets
│   ├── merge-and-upload-shipments.js      # CSV → Google Sheets
│   ├── identify-redirects.js              # Auto-detect redirects from CSV
│   ├── generate-redirects.js              # Create HTML redirect files
│   ├── syncBlogPosts.js                   # Wix Blog → HTML
│   ├── syncAllWixData.js                  # Wix → data/*.js/json
│   └── populatePerformanceStatistics.js   # Wix → Google Sheets
│
├── Styles
│   └── styles/main.css         # Design system + responsive CSS
│
├── Docs
│   ├── docs/GITHUB_PAGES_DEPLOYMENT.md  # ⭐ CRITICAL: Redirects on GH Pages
│   ├── docs/REDIRECTS.md
│   └── docs/EXCHANGE_RATES_UPDATE_APPROACH.md
│
├── Config
│   ├── .env                               # WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID
│   ├── google-service-account.json        # Google Sheets auth (NOT in git)
│   ├── package.json                       # Node deps
│   ├── CNAME                              # truesight.me
│   └── wix_redirects.csv                  # Master redirect mapping
│
└── Google Apps Scripts (reference only)
    └── google_app_scripts/
        └── sync_performance_statistics.gs  # Now in tokenomics repo
```

---

## Data Flow

### Master Data Sources

1. **Google Sheets** (SINGLE SOURCE OF TRUTH for shipments)
   - **Spreadsheet ID**: `1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU`
   - **Tab**: "Shipment Ledger Listing"
   - **Service Account**: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`
   - **Access**: Requires `google-service-account.json` in repo root
   - **Fields**: Shipment ID, Date, Status, Description, Cargo Size, Cacao (kg), Transaction Type, ROI, Capital Injection, Total Revenue, URLs (Ledger, Contract, Invoice, PO, Lab Report, FDA, Video), Google Maps URL, Latitude, Longitude, Shipment Image, `Is Cacao Shipment`, `Serialized`

2. **Wix CMS** (legacy data, synced to JSON)
   - **Site ID**: `d45a189f-d0cc-48de-95ee-30635a95385f`
   - **Account ID**: `0e2cde5f-b353-468b-9f4e-36835fc60a0e`
   - **Collections**: ExchangeRate, AgroverseShipments, EdgarModules, Blog
   - **Synced to**: `data/*.js` and `data/exchange-rates/*.json`

3. **CSV Files** (backup/import only)
   - `assets/raw/shipments_collection.csv`
   - `assets/raw/Agroverse+Shipments_new.csv`
   - Used ONLY for initial import → Google Sheets

### Data Flow Diagram

```
CSV Files (legacy)
    ↓
[merge-and-upload-shipments.js]
    ↓
Google Sheets "Shipment Ledger Listing" ← Manual edits (MASTER)
    ↓
[generate-shipment-pages.js] ← Reads Sheets API
    ↓
agroverse-shipments/{agl}/index.html (if is_cacao_shipment = true)
sunmint-tree-planting-pledges/{agl}/index.html (if serialized = true)

---

Wix CMS (ExchangeRate, Blog, etc.)
    ↓
[syncAllWixData.js / syncBlogPosts.js]
    ↓
data/exchange-rates/*.json
data/blog-posts.json
blog/posts/*.html

---

Google Apps Script (in tokenomics repo)
    ↓
Updates Wix → Performance Statistics sheet
    ↓
index.html loads via fetch()
```

---

## Key Scripts Deep Dive

### 1. `generate-shipment-pages.js` 🔥 MOST IMPORTANT

**Purpose**: Generate individual shipment/pledge HTML pages from Google Sheets.

**What it does**:
- Connects to Google Sheets using service account
- Reads "Shipment Ledger Listing" tab
- For each row:
  - If `Is Cacao Shipment = true` → creates `agroverse-shipments/{agl}/index.html`
  - If `Serialized = true` → creates `sunmint-tree-planting-pledges/{agl}/index.html`
- Extracts coordinates from Google Maps URL if Lat/Lng not in sheet
  - Prioritizes `3d...!4d...` pattern (actual location)
  - Falls back to `@lat,lng` (viewport center)
  - Falls back to `ll=lat,lng` query param
- Embeds Leaflet map with coordinates
- Generates SEO meta tags (OG, Twitter)
- Sanitizes WYSIWYG HTML (removes broken Google Fonts links)
- Creates mobile-responsive layout

**Run**: `node scripts/generate-shipment-pages.js`

**Dependencies**:
- `google-service-account.json` (must exist in repo root)
- Sheet must grant read access to service account
- Sheet headers must match expected names (see SCHEMA.md in tokenomics)

**Output**:
- `agroverse-shipments/agl0/index.html` through `agl14/index.html`
- `sunmint-tree-planting-pledges/agl0/index.html` through `agl14/index.html` + pp1, sef1

---

### 2. `merge-and-upload-shipments.js`

**Purpose**: Merge CSV files and upload to Google Sheets.

**What it does**:
- Reads `assets/raw/shipments_collection.csv` and `assets/raw/Agroverse+Shipments_new.csv`
- Merges rows by Shipment ID
- Prefers non-empty values (preserves existing data)
- Maps shipment images to GitHub raw URLs
- Extracts coordinates from Google Maps URLs
- Auto-adds missing columns to sheet
- **Preserves existing non-empty cells** (only updates empty cells)

**Run**: `node scripts/merge-and-upload-shipments.js`

**Use case**: When you have new CSV data to import. Otherwise, edit Google Sheets directly.

**Important**: Only updates empty cells to preserve manual edits in Sheets.

---

### 3. `identify-redirects.js` + `generate-redirects.js`

**Purpose**: Manage redirects from old Wix URLs to new static site URLs.

**Workflow**:
1. `identify-redirects.js`: Scans CSV files → generates `wix_redirects.csv`
   - Maps `/shipments/agl13` → `/agroverse-shipments/agl13`
   - Handles conflicts (prioritizes Agroverse over Sunmint)
2. `generate-redirects.js`: Creates HTML redirect files
   - Reads `wix_redirects.csv`
   - Generates `redirects/{path}/index.html`
   - Also generates `nginx-redirects.conf` (reference only, NOT used on GitHub Pages)

**Redirect HTML structure**:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="refresh" content="0; url=..." />
    <link rel="canonical" href="..." />
    <script>window.location.replace("...");</script>
    <title>Redirecting...</title>
  </head>
  <body>
    <p>If not redirected, <a href="...">click here</a>.</p>
  </body>
</html>
```

**Why HTML redirects?**: GitHub Pages doesn't support server-side redirects (`_redirects`, `.htaccess`, `vercel.json`). See `docs/GITHUB_PAGES_DEPLOYMENT.md`.

---

### 4. `syncAllWixData.js` / `syncBlogPosts.js`

**Purpose**: Sync data from Wix CMS to local JSON/JS files.

**What they do**:
- `syncAllWixData.js`: Fetches ExchangeRate, AgroverseShipments, EdgarModules → writes to `data/*.js` and `data/exchange-rates/*.json`
- `syncBlogPosts.js`: Fetches Wix Blog posts → converts Ricos format to HTML → generates `blog/posts/*.html` and `blog/index.html`

**Run**:
```bash
node scripts/syncAllWixData.js
node scripts/syncBlogPosts.js
```

**Requires**: WIX_API_KEY in `.env`

---

### 5. `populatePerformanceStatistics.js`

**Purpose**: Sync Wix ExchangeRate data to Google Sheets "Performance Statistics" tab.

**What it does**:
- Fetches ExchangeRate from Wix
- Writes to "Performance Statistics" sheet
- Used for initial data population

**Note**: Ongoing updates are handled by Google Apps Script in tokenomics repo (`tdg_wix_dashboard.gs`).

---

## Common Operations

### Adding a New Shipment

1. **Edit Google Sheets** (preferred):
   - Open [TrueSight DAO Contribution Ledger](https://docs.google.com/spreadsheets/d/1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU)
   - Go to "Shipment Ledger Listing" tab
   - Add new row with all fields
   - Set `Is Cacao Shipment = true` (for Agroverse page)
   - Set `Serialized = true` (for Sunmint page)
   - Add `Shipment Image` URL: `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/{id}.avif`
   - Add `Google Maps URL` (coordinates will be auto-extracted)

2. **Add image**:
   - Place image in `assets/shipments/` as `{id}.avif` or `{id}.gif`
   - Commit and push image to GitHub first (so URL is valid)

3. **Generate pages**:
   ```bash
   node scripts/generate-shipment-pages.js
   ```

4. **Commit and deploy**:
   ```bash
   git add agroverse-shipments/ sunmint-tree-planting-pledges/
   git commit -m "Add shipment {id}"
   git push origin main
   ```

5. **Verify**: Visit `https://truesight.me/agroverse-shipments/{id}` or `/sunmint-tree-planting-pledges/{id}`

---

### Updating Shipment Data

1. **Edit Google Sheets directly** (preferred)
2. Regenerate pages: `node scripts/generate-shipment-pages.js`
3. Commit and push

**OR** (if updating from CSV):
1. Update CSV files in `assets/raw/`
2. Run: `node scripts/merge-and-upload-shipments.js`
3. Run: `node scripts/generate-shipment-pages.js`
4. Commit and push

---

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

3. **Commit and push**:
   ```bash
   git add redirects/
   git commit -m "Add redirect: /old/path → /new/path"
   git push origin main
   ```

---

### Syncing Wix Data

1. **Sync all Wix data**:
   ```bash
   node scripts/syncAllWixData.js
   ```

2. **Sync blog posts only**:
   ```bash
   node scripts/syncBlogPosts.js
   ```

3. **Commit and push**:
   ```bash
   git add data/ blog/
   git commit -m "Sync Wix data"
   git push origin main
   ```

---

### Local Development / Preview

```bash
# Start local server
python3 -m http.server 8080

# OR use npx serve
npx serve .
```

Visit `http://localhost:8080`

---

## Design System

### Color Palette (Saffron Monk)

```css
:root {
  --text: #2C2416;           /* Soft dark brown (no black) */
  --muted: #6B5D4F;          /* Muted brown */
  --bg: #F7F1E8;             /* Earthen Sand */
  --bg-alt: #ECE2D1;         /* Weathered Clay */
  --accent: #F4A300;         /* Saffron Monk */
  --accent-dark: #D38900;    /* Deep Saffron */
  --accent-light: #F6C86D;   /* Honey Husk */
  --structure: #5F6F52;      /* Forest Canopy */
  --warmth: #C08457;         /* Amazon Clay */
}
```

### Spacing Scale

```css
--space-xs: 0.5rem;
--space-sm: 1rem;
--space-md: 1.5rem;
--space-lg: 2.5rem;
--space-xl: 4rem;
```

### Responsive Breakpoints

- **Desktop**: Default styles
- **Tablet**: `@media (max-width: 640px)`
- **Mobile**: `@media (max-width: 480px)`

### Key CSS Classes

- **Cards**: `.solution-card`, `.impact-card`, `.module-card`, `.shipment-card`
- **Tables**: `.shipment-table` (desktop), `.shipments-cards` (mobile fallback)
- **Grid**: `.shipment-detail-grid` (2-column desktop → 1-column mobile)
- **Rows**: `.shipment-detail-row` (key-value pairs, side-by-side → stacked)
- **Hero**: `.hero` with optional left alignment

---

## Deployment

### GitHub Pages (Current Platform)

1. **Push to `main` branch**
2. GitHub Pages auto-deploys (takes ~1-2 minutes)
3. Custom domain via `CNAME` file: `truesight.me`

### Pre-Deployment Checklist

- [ ] Run `node scripts/generate-shipment-pages.js` (regenerate pages from Sheets)
- [ ] Test redirects locally (if changed)
- [ ] Verify images are accessible (GitHub raw URLs)
- [ ] Check mobile responsiveness
- [ ] Verify Google Sheets access (service account)

---

## Critical Gotchas

### 1. GitHub Pages Redirects 🚨

**CRITICAL**: GitHub Pages does NOT support server-side redirects.

- ❌ NO `_redirects` (Netlify)
- ❌ NO `.htaccess` (Apache)
- ❌ NO `vercel.json` (Vercel)
- ✅ YES HTML meta refresh + JavaScript

**Always use HTML redirect files**. See `docs/GITHUB_PAGES_DEPLOYMENT.md`.

---

### 2. Google Sheets Headers

**CRITICAL**: Script column mapping is EXACT and CASE-SENSITIVE.

If Google Sheets headers change, scripts will break. Expected headers:
- "Shipment ID"
- "Shipment Date"
- "Status"
- "Description"
- "Cargo Size"
- "Cacao (kg)"
- "Transaction Type"
- "Investment ROI"
- "Capital Injection"
- "Total Revenue"
- "Ledger URL"
- "Contract URL"
- "Invoice URL"
- "Purchase Order URL"
- "Lab Report"
- "FDA Prior Notice"
- "Video Reel"
- "TrueSight DAO URL"
- "Trees to be Planted"
- "Google Maps URL"
- "Latitude"
- "Longitude"
- "Shipment Image"
- "Is Cacao Shipment"
- "Serialized"

See `tokenomics/SCHEMA.md` for canonical header names.

---

### 3. Service Account Credentials

**File**: `google-service-account.json` (NOT in git, must exist in repo root)

**Expected email**: `agroverse-qr-code-manager@get-data-io.iam.gserviceaccount.com`

**Permissions**: Service account must have:
- Read access to spreadsheet `1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU`
- Edit access (for upload scripts)

Script will warn if email doesn't match but will still attempt to use credentials.

---

### 4. Shipment Images

**Format**: `{id}.avif` or `{id}.gif` (AGL7 is a GIF, rest are AVIF)

**Location**: `assets/shipments/`

**Reference**: GitHub raw URL in Google Sheets:
```
https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/{id}.avif
```

**Important**: Commit and push images BEFORE generating pages (so URLs are valid).

---

### 5. Coordinate Extraction Priority

Script extracts coordinates from Google Maps URL in this order:
1. `3d{lat}!4d{lng}` pattern (actual location, MOST ACCURATE)
2. `@{lat},{lng}` pattern (viewport center)
3. `ll={lat},{lng}` query param

If Latitude/Longitude columns are populated in Sheets, script uses those instead of URL.

---

### 6. CSV Upload Behavior

`merge-and-upload-shipments.js` **preserves existing non-empty cells**.

- Only updates empty cells
- Prefers non-empty values from either CSV
- Special-cases Google Maps fields (always takes newer value)

**Implication**: To force-update a cell, clear it in Google Sheets first, then run upload script.

---

### 7. Clean URLs

Pages use clean URLs: `/agroverse-shipments/agl13` (NOT `/agroverse-shipments/agl13.html`)

**How**: Create directory `agroverse-shipments/agl13/` with `index.html` inside.

GitHub Pages serves `index.html` when visiting directory URL.

---

### 8. Exchange Rates

Exchange rates are updated via **Google Apps Script** (NOT Node scripts).

**Live logic**: `tokenomics/google_app_scripts/tdg_asset_management/tdg_wix_dashboard.gs`

**Local files**: `google_app_scripts/sync_performance_statistics.gs` (one-time bootstrap only)

**Data**: `data/exchange-rates/*.json` (individual files per metric)

**Display**: `index.html` loads via `fetch()` and renders with Chart.js

---

## Cross-Repo Relationships

### Tokenomics Repository

**Path**: `/Users/garyjob/Applications/tokenomics`

**Connections**:
1. **Google Apps Script**: `tdg_wix_dashboard.gs` updates Wix → Google Sheets Performance Statistics
2. **SCHEMA.md**: Authoritative source for Google Sheets structure
3. **API.md**: GAS endpoints used by DApp

**Data flow**: Tokenomics GAS → Wix ExchangeRate → Google Sheets → truesight.me (via `populatePerformanceStatistics.js` or direct fetch)

---

### DApp Repository

**Path**: `/Users/garyjob/Applications/dapp`

**Connections**:
1. **UX_CONVENTIONS.md**: Shared UX patterns (loading states, verification flows)
2. **API calls**: DApp calls tokenomics APIs for signatures, voting, expenses

---

### Agroverse Context

**Path**: `/Users/garyjob/Applications/agentic_ai_context`

**Connections**:
1. **NOTES_truesight_me.md**: Working notes for AI assistants
2. **WORKSPACE_CONTEXT.md**: Multi-repo workspace overview
3. **PROJECT_INDEX.md**: Per-project summary

---

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

### Frontend Libraries (CDN)

- **Chart.js**: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
- **Leaflet**: Embedded in generated pages (map rendering)
- **Google Fonts**: Space Grotesk, Inter

---

## Troubleshooting

### Pages Not Generating

1. **Check Google Sheets access**: Verify service account credentials
2. **Verify flags**: Ensure `Is Cacao Shipment` or `Serialized` is set correctly
3. **Check headers**: Ensure Google Sheets headers match expected names
4. **Check script output**: Look for error messages

### Redirects Not Working

1. **Check file exists**: Verify `{path}/index.html` exists in repo
2. **Check deployment**: Wait 1-2 minutes for GitHub Pages to update
3. **Clear cache**: Hard refresh browser (Cmd+Shift+R)
4. **Check URL structure**: Ensure directory structure matches old URL path

### Images Not Loading

1. **Check GitHub raw URL**: Verify image exists at `https://raw.githubusercontent.com/TrueSightDAO/truesight_me/main/assets/shipments/{id}.avif`
2. **Check repo is public**: GitHub raw URLs only work for public repos
3. **Check file extension**: Must be `.avif` or `.gif` (case-sensitive)

### Mobile Layout Issues

1. **Check CSS media queries**: Verify `styles/main.css` has mobile styles
2. **Check classes**: Ensure `shipment-detail-grid` and `shipment-detail-row` are applied
3. **Test on real devices**: Don't rely solely on browser dev tools

### Exchange Rates Not Updating

1. **Check Google Apps Script**: Verify `tdg_wix_dashboard.gs` is deployed and running
2. **Check Wix API**: Verify WIX_API_KEY is valid
3. **Check sheet access**: Verify GAS has write access to "Performance Statistics" sheet
4. **Check fetch URL**: Verify `index.html` is fetching from correct GAS web app URL

---

## Current State (as of 2026-01-29)

### What's Working

- ✅ Static site deployed on GitHub Pages
- ✅ Custom domain (truesight.me)
- ✅ Google Sheets integration for shipment data
- ✅ Page generation scripts
- ✅ HTML redirects from old Wix URLs
- ✅ Responsive design (desktop/tablet/mobile)
- ✅ SEO meta tags (OG, Twitter)
- ✅ Leaflet maps on shipment pages

### What's Legacy / Deprecated

- ⚠️ CSV files in `assets/raw/` (use Google Sheets directly now)
- ⚠️ `data/agroverse-shipments.js` (legacy, use Google Sheets)
- ⚠️ Local `google_app_scripts/` (live logic now in tokenomics repo)
- ⚠️ Wix CMS (being phased out, data synced to JSON for now)

### What's In Progress / TODO

- 🚧 Harden header mapping by normalizing whitespace/case
- 🚧 Move shared UI fragments (header/footer) to partials
- 🚧 Add `npm run build` script to sequence all operations
- 🚧 Add JS health check to detect stale exchange-rates JSON

---

## Quick Reference Commands

```bash
# Generate pages from Google Sheets
node scripts/generate-shipment-pages.js

# Upload CSV to Google Sheets (only if needed)
node scripts/merge-and-upload-shipments.js

# Generate redirects
node scripts/identify-redirects.js    # Auto-detect from CSV
node scripts/generate-redirects.js    # Create HTML files

# Sync Wix data
node scripts/syncAllWixData.js        # All collections
node scripts/syncBlogPosts.js         # Blog only
node scripts/populatePerformanceStatistics.js  # Stats to Sheets

# Local preview
python3 -m http.server 8080
# OR
npx serve .

# Deploy
git add .
git commit -m "Update"
git push origin main
# Wait ~1-2 min for GitHub Pages
```

---

## Important Files Checklist

Before working on this project, ensure these files exist:

- ✅ `google-service-account.json` (NOT in git, must be in repo root)
- ✅ `.env` (WIX_API_KEY, WIX_SITE_ID, WIX_ACCOUNT_ID)
- ✅ `CNAME` (truesight.me)
- ✅ `wix_redirects.csv` (redirect mappings)
- ✅ `package.json` + `node_modules/` (run `npm install`)

---

## Related Documentation

- **README.md**: Main project documentation
- **docs/GITHUB_PAGES_DEPLOYMENT.md**: ⭐ CRITICAL for understanding redirects
- **docs/REDIRECTS.md**: Redirect system details
- **docs/EXCHANGE_RATES_UPDATE_APPROACH.md**: Exchange rates logic
- **tokenomics/SCHEMA.md**: Google Sheets structure
- **tokenomics/API.md**: GAS API endpoints
- **dapp/UX_CONVENTIONS.md**: Shared UX patterns
- **agentic_ai_context/NOTES_truesight_me.md**: Working notes

---

## AI Assistant Notes

### When to Regenerate Pages

- After editing Google Sheets data
- After adding new shipment
- After updating shipment metadata
- Before deployment (pre-deploy checklist)

### When NOT to Regenerate Pages

- After only changing CSS
- After only editing main HTML pages (index.html, agroverse.html, etc.)
- After only updating blog posts (unless using syncBlogPosts.js)

### Common Mistakes to Avoid

1. **Don't commit `google-service-account.json`** (it's in `.gitignore`)
2. **Don't use server-side redirects** (GitHub Pages doesn't support them)
3. **Don't edit generated pages directly** (they'll be overwritten)
4. **Don't assume CSV is master** (Google Sheets is master now)
5. **Don't skip `node_modules/`** (run `npm install` first)

### Pro Tips

1. **Test locally first**: Use `python3 -m http.server 8080` before deploying
2. **Commit images first**: Push images to GitHub before generating pages
3. **Use verbose logging**: Scripts print helpful debug info
4. **Check Google Sheets**: When in doubt, verify data in Sheets
5. **Read GITHUB_PAGES_DEPLOYMENT.md**: Critical for understanding deployment constraints

---

**End of Notes**
