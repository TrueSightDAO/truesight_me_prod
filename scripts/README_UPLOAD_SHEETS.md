# Upload Shipments to Google Sheets

This script uploads shipment data from `assets/raw/shipments_collection.csv` to the Google Sheets "Shipment Ledger Listing" tab.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get Google Service Account credentials:**
   - Download the JSON key file for the service account: `agroverse-qr-code-manager@get-data-io`
   - Place it in the project root as `google-service-account.json`
   - Ensure the service account has edit access to the spreadsheet

3. **Run the script:**
   ```bash
   node scripts/upload-shipments-to-sheets.js
   ```

## Headers

The script will create/update the "Shipment Ledger Listing" tab with the following columns:

- **Shipment ID** - The shipment contract number (e.g., AGL13)
- **Shipment Date** - Date of the shipment
- **Status** - Current status (e.g., MANUFACTURING, COMPLETED, SALES IN PROGRESS)
- **Description** - Shipment description (truncated to 200 chars)
- **Cargo Size** - Size of cargo
- **Cacao (kg)** - Amount of cacao in kilograms
- **Transaction Type** - Financing type (e.g., Defi Pre-Purchase, DAO financed)
- **Investment ROI** - Return on investment percentage
- **Capital Injection** - Capital amount
- **Total Revenue** - Total revenue generated
- **Ledger URL** - Link to the transparency ledger (usually agroverse.shop link)
- **Contract URL** - Link to financing contract
- **FDA Prior Notice** - Link to FDA prior notice document
- **Invoice URL** - Link to farmer's invoice
- **Purchase Order URL** - Link to purchase order
- **Lab Report** - Link to lab report
- **Video Reel** - Link to video content
- **TrueSight DAO URL** - Link to TrueSight DAO shipment page
- **Trees to be Planted** - Number of trees (for Sunmint pledges)
- **Google Maps URL** - Link to location on Google Maps
- **Created Date** - When the record was created
- **Updated Date** - When the record was last updated

## Notes

- The script will **clear existing data** in the "Shipment Ledger Listing" tab before uploading
- If the tab doesn't exist, it will be created automatically
- The script uses the same CSV parser as `generate-shipment-pages.js` to handle multi-line fields correctly

