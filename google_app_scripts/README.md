# Performance Statistics Google Apps Scripts

This directory contains Google Apps Scripts for managing Performance Statistics data synchronization between Wix collections and Google Sheets.

## Files

- **`sync_performance_statistics.gs`**: One-time sync script to populate the "Performance Statistics" tab in Google Sheets with existing values from the Wix ExchangeRate collection.

**Note**: The web service functionality (`doGet` endpoint) is now integrated into the main `tdg_wix_dashboard.gs` file in the `tokenomics` repository. See integration instructions below.

## Integration Status

✅ **Integrated**: All Performance Statistics functionality has been merged into:
- **`/Users/garyjob/Applications/tokenomics/google_app_scripts/tdg_asset_management/tdg_wix_dashboard.gs`**

This single file now contains:
- All Wix update functions (automatically sync to Performance Statistics sheet)
- `updatePerformanceStatistic()` helper function
- `doGet()` web service endpoint
- `readPerformanceStatistics()` function

## Setup Instructions

### 1. Configure Script Properties

1. Open the Google Apps Script editor (either by creating a new Apps Script project or using existing one).
2. Go to **File > Project Settings > Script Properties**.
3. Add the following properties:
   - `WIX_API_KEY`: Your Wix API key
   - `WIX_SITE_ID`: Your Wix site ID (default: `d45a189f-d0cc-48de-95ee-30635a95385f`)
   - `WIX_ACCOUNT_ID`: Your Wix account ID (default: `0e2cde5f-b353-468b-9f4e-36835fc60a0e`)

### 2. One-Time Sync: Populate Performance Statistics Sheet

1. Copy the contents of `sync_performance_statistics.gs` into your Google Apps Script editor.
2. Ensure the spreadsheet ID in the script matches your Google Sheet:
   ```javascript
   var ledgerDocId = "1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU";
   ```
3. Run the function `syncWixToPerformanceStatistics()` once:
   - In the Apps Script editor, select the function `syncWixToPerformanceStatistics` from the dropdown.
   - Click **Run** ▶️.
   - Authorize the script if prompted (needs access to Google Sheets and Wix APIs).
4. This will create the "Performance Statistics" tab (if it doesn't exist) and populate it with current values from the Wix ExchangeRate collection.

### 3. Deploy Web Service

**The web service is now in `tdg_wix_dashboard.gs`** (in the `tokenomics` repository). To deploy:

1. Open your Google Apps Script project that contains `tdg_wix_dashboard.gs`.
2. Click **Deploy > New deployment**.
3. Select type: **Web app**.
4. Configure:
   - **Execute as**: Me
   - **Who has access**: Anyone (to allow public access from your website)
5. Click **Deploy**.
6. Copy the **Web app URL** (e.g., `https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec`).
7. Update `index.html` with this URL (see next section).

**Note**: You can deploy the same `tdg_wix_dashboard.gs` script for both automation (scheduled triggers) and web service access. The `doGet()` function will handle web requests, while your existing functions handle automation.

### 4. Automatic Sync (Already Integrated!)

✅ **Done!** All Wix update functions in `tdg_wix_dashboard.gs` have been automatically updated to sync to the Performance Statistics sheet:

- `setAssetBalanceOnWix()` → automatically syncs `USD_TREASURY_BALANCE`
- `setTDGIssuedOnWix()` → automatically syncs `TDG_ISSUED`
- `setAssetPerIssuedTdgBalanceOnWix()` → automatically syncs `ASSET_PER_TDG_ISSUED`
- `set30DaysSalesOnWix()` → automatically syncs `PAST_30_DAYS_SALES`
- `setDailyTdgBuyBackBudget()` → automatically syncs `TDG_DAILY_BUY_BACK_BUDGET`
- `setUSTreasuryYieldOnWix()` → automatically syncs `USD_TREASURY_YIELD_1_MONTH`

**No additional code needed!** Just copy and paste the updated `tdg_wix_dashboard.gs` file into your Google Apps Script project.

## Supported Keys

The following exchange rate keys are synced to Performance Statistics:

- `USDC_EXCHANGE_RATE_RAYDIUM`
- `USD_TREASURY_YIELD_1_MONTH`
- `TDG_DAILY_BUY_BACK_BUDGET`
- `PAST_30_DAYS_SALES`
- `ASSET_PER_TDG_ISSUED`
- `GAS_FEE`
- `TDG_PER_USD_CONTRIBUTION`
- `TDG_PER_HOUR_CONTRIBUTION`
- `TDG_ISSUED`
- `USD_TREASURY_BALANCE`
- `USDT_EXCHANGE_RATE_LATOKENS`

## Google Sheet Structure

The "Performance Statistics" tab has the following columns:

1. **Key** - Exchange rate key identifier
2. **Description** - Human-readable description
3. **Exchange Rate / Value** - The numeric value
4. **Currency** - Currency code (if applicable)
5. **Updated Date** - When the value was last updated in Wix
6. **Last Synced** - When the row was last synced to this sheet

## API Response Format

The web service returns JSON in this format:

```json
{
  "timestamp": "2025-01-27T12:00:00.000Z",
  "data": {
    "USD_TREASURY_BALANCE": {
      "key": "USD_TREASURY_BALANCE",
      "description": "USD_TREASURY_BALANCE",
      "exchangeRate": 12345.67,
      "currency": "USD",
      "updatedDate": "2025-01-27T10:00:00.000Z"
    },
    ...
  }
}
```

## Troubleshooting

### Script Properties Not Found
- Ensure you've set `WIX_API_KEY` in Script Properties (File > Project Settings > Script Properties).

### Sheet Not Found
- Run `syncWixToPerformanceStatistics()` first to create the "Performance Statistics" tab.

### CORS Errors
- Ensure the web app is deployed with "Who has access: Anyone".

### No Data Returned
- Check that the "Performance Statistics" sheet exists and has data.
- Verify the spreadsheet ID in the script matches your Google Sheet.

