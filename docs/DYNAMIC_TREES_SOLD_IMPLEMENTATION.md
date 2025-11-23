# Dynamic Trees Sold Count Implementation

## Overview
This implementation allows individual Sunmint and Agroverse pages to display real-time "Trees to be Planted" counts by fetching sold QR code statistics from the Google Apps Script web service, eliminating the need to regenerate pages when sales occur.

## Architecture

### 1. Google Apps Script Extension (`tdg_wix_dashboard.gs`)

**New Function: `getSoldQRCodesCount(shipmentId)`**
- Queries "Agroverse QR codes" sheet
- Counts rows where:
  - Column D = "sold" (case-insensitive)
  - Column C (URL) ends with the shipment ID (lowercase)
- Returns the count

**Extended `doGet()` Function**
- Accepts `shipmentId` or `shipment_id` query parameter
- If provided, returns JSON with `treesSold` count
- Otherwise, returns all performance statistics (existing behavior)

**API Endpoint:**
```
GET https://script.google.com/macros/s/AKfycbzlfOBo9UqKOh7jIqGcmbPAMM1RxCbsJHb-UV_vM6VbvK_HSdT44KyGbbXIeo-_Ovfy/exec?shipmentId=AGL8
```

**Response:**
```json
{
  "timestamp": "2025-01-27T12:00:00.000Z",
  "shipmentId": "AGL8",
  "treesSold": 42
}
```

### 2. Frontend Integration (`generate-shipment-pages.js`)

**HTML Changes:**
- Added `data-trees-sold` and `data-shipment-id` attributes to the trees count element
- Added loading indicator (hidden by default)

**JavaScript:**
- On page load, extracts shipment ID from `data-shipment-id` attribute
- Fetches count from web service
- Updates the display with the real-time count
- Shows/hides loading indicator during fetch

## Benefits

1. ✅ **Real-time Updates**: Count updates automatically when QR codes are marked as sold
2. ✅ **No Page Regeneration**: Pages don't need to be regenerated when sales happen
3. ✅ **Single Source of Truth**: Uses the same "Agroverse QR codes" sheet
4. ✅ **Backward Compatible**: Existing doGet behavior (performance statistics) still works
5. ✅ **Graceful Degradation**: If API fails, shows original static value

## Implementation Status

### ✅ Completed
- [x] Added `getSoldQRCodesCount()` function to `tdg_wix_dashboard.gs`
- [x] Extended `doGet()` to handle `shipmentId` parameter
- [x] Updated page generation to include `data-trees-sold` attributes
- [x] Added JavaScript to fetch and update count dynamically

### 🔄 Next Steps
1. **Deploy Updated Script**: Deploy the updated `tdg_wix_dashboard.gs` to Google Apps Script
2. **Test API**: Test the endpoint with a known shipment ID:
   ```
   https://script.google.com/macros/s/AKfycbzlfOBo9UqKOh7jIqGcmbPAMM1RxCbsJHb-UV_vM6VbvK_HSdT44KyGbbXIeo-_Ovfy/exec?shipmentId=AGL8
   ```
3. **Regenerate Pages**: Run `node scripts/generate-shipment-pages.js` to update all pages with the new dynamic loading script
4. **Verify**: Check a generated page to ensure the count loads dynamically

## Configuration

### Spreadsheet Setup
- Ensure "Agroverse QR codes" sheet exists in the same spreadsheet as the ledger (`ledgerDocId`)
- Column C should contain URLs like `https://www.agroverse.shop/agl8`
- Column D should contain status values like "sold" (case-insensitive)

### Customization
If QR codes are in a different spreadsheet, update this line in `getSoldQRCodesCount()`:
```javascript
var qrCodesSpreadsheetId = ledgerDocId; // Change to your spreadsheet ID
```

## Troubleshooting

### Count shows as 0
- Check that "Agroverse QR codes" sheet exists
- Verify Column D contains "sold" (case-insensitive)
- Verify Column C URLs end with the shipment ID (e.g., `/agl8`)

### API returns error
- Check Google Apps Script execution logs
- Verify the sheet name is exactly "Agroverse QR codes"
- Ensure the script has permission to access the spreadsheet

### Count doesn't update on page
- Check browser console for JavaScript errors
- Verify the web service URL is correct
- Check that `data-shipment-id` attribute is set correctly

## Future Enhancements

1. **Caching**: Add client-side caching to reduce API calls
2. **Auto-refresh**: Periodically refresh the count (e.g., every 5 minutes)
3. **More Statistics**: Extend API to return additional shipment statistics
4. **Progress Bar**: Show visual progress (trees sold / total trees to be planted)



