# Integration Instructions: Sync Performance Statistics Sheet

## Overview

You need to add the `updatePerformanceStatistic()` helper function to your **existing Google Apps Script** that updates the Wix ExchangeRate collection, then call it after each Wix update.

## Your Existing Script

**File**: `/Users/garyjob/Applications/tokenomics/google_app_scripts/tdg_asset_management/tdg_wix_dashboard.gs`

This script already updates Wix ExchangeRate collection. You just need to **add one helper function** and **call it** after each Wix update.

## Step 1: Add the Helper Function

Add this function to the **end of** `tdg_wix_dashboard.gs`:

```javascript
/**
 * Helper function to update Performance Statistics sheet when updating Wix
 * Call this after updating Wix ExchangeRate collection
 * 
 * @param {string} key - The exchange rate key (e.g., "USD_TREASURY_BALANCE")
 * @param {number} value - The new exchange rate / value
 * @param {string} currency - Optional currency code
 */
function updatePerformanceStatistic(key, value, currency) {
  try {
    var performanceStatisticsSheetName = "Performance Statistics";
    var spreadsheet = SpreadsheetApp.openById(ledgerDocId);
    var sheet = spreadsheet.getSheetByName(performanceStatisticsSheetName);
    
    if (!sheet) {
      Logger.log("⚠️  Performance Statistics sheet not found - skipping update");
      return;
    }
    
    // Find the row with this key
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log("⚠️  Performance Statistics sheet has no data rows - skipping update");
      return;
    }
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, 1); // Column 1 (Key column)
    var keys = dataRange.getValues();
    
    var rowIndex = -1;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i][0] === key) {
        rowIndex = i + 2; // +2 because data starts at row 2 (row 1 is header)
        break;
      }
    }
    
    if (rowIndex === -1) {
      // Key not found - add new row
      sheet.appendRow([
        key,
        key, // description
        value !== null && value !== undefined ? value : "",
        currency || "",
        new Date(),
        new Date() // last synced
      ]);
      Logger.log("✅ Added new row to Performance Statistics for key: " + key);
    } else {
      // Update existing row
      sheet.getRange(rowIndex, 3).setValue(value !== null && value !== undefined ? value : ""); // Exchange Rate column
      if (currency) {
        sheet.getRange(rowIndex, 4).setValue(currency); // Currency column
      }
      sheet.getRange(rowIndex, 5).setValue(new Date()); // Updated Date
      sheet.getRange(rowIndex, 6).setValue(new Date()); // Last Synced
      Logger.log("✅ Updated Performance Statistics row " + rowIndex + " for key: " + key);
    }
    
  } catch (error) {
    Logger.log("⚠️  Error updating Performance Statistics: " + error.message);
    // Don't throw - allow Wix update to succeed even if sheet update fails
  }
}
```

## Step 2: Call the Helper Function After Each Wix Update

Update these functions in `tdg_wix_dashboard.gs` to call `updatePerformanceStatistic()` after updating Wix:

### Update `setAssetBalanceOnWix()`:

```javascript
function setAssetBalanceOnWix(latest_asset_balance) {
  var options = getWixRequestHeader();  
  var payload = {
    "dataCollectionId": "ExchangeRate",
    "dataItem": {
      "data": {
        "description": "USD_TREASURY_BALANCE",
        "_id": getWixAssetBalanceDataItemId(),
        "_owner": "0e2cde5f-b353-468b-9f4e-36835fc60a0e",
        "exchangeRate": latest_asset_balance,
        "currency": "USD"
      }
    }
  }

  options.payload = JSON.stringify(payload);
  options.method = 'PUT';

  var request_url = "https://www.wixapis.com/wix-data/v2/items/" + getWixAssetBalanceDataItemId();  
  var response = UrlFetchApp.fetch(request_url, options);
  var content = response.getContentText();
  var response_obj = JSON.parse(content);  
  
  // ✅ ADD THIS LINE:
  updatePerformanceStatistic("USD_TREASURY_BALANCE", latest_asset_balance, "USD");
}
```

### Update `setTDGIssuedOnWix()`:

```javascript
function setTDGIssuedOnWix() {
  var tdg_issed = getTdgTokensIssued();

  var options = getWixRequestHeader();  
  var payload = {
    "dataCollectionId": "ExchangeRate",
    "dataItem": {
      "data": {
        "description": "TDG_ISSUED",
        "_id": getWixTDGIssuedTdgDataItemId(),
        "_owner": "0e2cde5f-b353-468b-9f4e-36835fc60a0e",
        "exchangeRate": tdg_issed,
        "currency": "TDG"
      }
    }
  }

  options.payload = JSON.stringify(payload);
  options.method = 'PUT';

  var request_url = "https://www.wixapis.com/wix-data/v2/items/" + getWixTDGIssuedTdgDataItemId();  
  var response = UrlFetchApp.fetch(request_url, options);
  var content = response.getContentText();
  var response_obj = JSON.parse(content);  
  
  // ✅ ADD THIS LINE:
  updatePerformanceStatistic("TDG_ISSUED", tdg_issed, "TDG");
}
```

### Update `setAssetPerIssuedTdgBalanceOnWix()`:

```javascript
function setAssetPerIssuedTdgBalanceOnWix(calculated_asset_per_issued_tdg) {
  // ... existing code ...
  
  // ✅ ADD THIS LINE AT THE END:
  updatePerformanceStatistic("ASSET_PER_TDG_ISSUED", calculated_asset_per_issued_tdg, "USD");
}
```

### Update `set30DaysSalesOnWix()`:

```javascript
function set30DaysSalesOnWix(latest_30days_sales) {
  // ... existing code ...
  
  // ✅ ADD THIS LINE AT THE END:
  updatePerformanceStatistic("PAST_30_DAYS_SALES", latest_30days_sales, "USD");
}
```

### Update `setDailyTdgBuyBackBudget()`:

```javascript
function setDailyTdgBuyBackBudget() {
  // ... existing code that calculates budget ...
  
  // ✅ ADD THIS LINE AFTER updating Wix:
  updatePerformanceStatistic("TDG_DAILY_BUY_BACK_BUDGET", calculated_budget, "USD");
}
```

### Update `setUSTreasuryYieldOnWix()`:

```javascript
function setUSTreasuryYieldOnWix(treasuryYield) {
  // ... existing code ...
  
  // ✅ ADD THIS LINE AT THE END:
  updatePerformanceStatistic("USD_TREASURY_YIELD_1_MONTH", treasuryYield, "USD");
}
```

## Complete Example

Here's a complete example showing how one function should look:

```javascript
function setAssetBalanceOnWix(latest_asset_balance) {
  // Update Wix
  var options = getWixRequestHeader();  
  var payload = {
    "dataCollectionId": "ExchangeRate",
    "dataItem": {
      "data": {
        "description": "USD_TREASURY_BALANCE",
        "_id": getWixAssetBalanceDataItemId(),
        "_owner": "0e2cde5f-b353-468b-9f4e-36835fc60a0e",
        "exchangeRate": latest_asset_balance,
        "currency": "USD"
      }
    }
  }

  options.payload = JSON.stringify(payload);
  options.method = 'PUT';

  var request_url = "https://www.wixapis.com/wix-data/v2/items/" + getWixAssetBalanceDataItemId();  
  var response = UrlFetchApp.fetch(request_url, options);
  var content = response.getContentText();
  var response_obj = JSON.parse(content);  
  
  // ✅ Sync to Performance Statistics sheet
  updatePerformanceStatistic("USD_TREASURY_BALANCE", latest_asset_balance, "USD");
}
```

## Testing

After adding the function and calls:

1. Run one of your existing functions (e.g., `updateTotalDAOAssetOnWix()`)
2. Check the "Performance Statistics" sheet to verify the value was updated
3. Check the logs to see "✅ Updated Performance Statistics..." messages

## Important Notes

- The `updatePerformanceStatistic()` function is designed to **not throw errors** if the sheet doesn't exist - it just logs a warning and continues
- This ensures your Wix updates always succeed even if the sheet sync fails
- The function will automatically find the correct row by matching the "Key" column

