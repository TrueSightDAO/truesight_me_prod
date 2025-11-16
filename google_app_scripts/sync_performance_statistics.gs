/**
 * File: google_app_scripts/sync_performance_statistics.gs
 * Repository: https://github.com/TrueSightDAO/truesight_me
 * 
 * Description: One-time script to sync existing values from Wix ExchangeRate collection 
 *              to Google Sheet "Performance Statistics" tab.
 * 
 * Usage: Run once to populate the Performance Statistics tab with current Wix values.
 *        After this, other Google App Scripts updating Wix should also update this sheet.
 */

// Google Spreadsheet ID for the ledger document
var ledgerDocId = "1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU";

// Sheet name for Performance Statistics
var PERFORMANCE_STATISTICS_SHEET_NAME = "Performance Statistics";

// Wix API credentials (store in Script Properties or User Properties)
// To set: File > Project Settings > Script Properties
var wixAccessToken = PropertiesService.getScriptProperties().getProperty("WIX_API_KEY");
var wixSiteId = PropertiesService.getScriptProperties().getProperty("WIX_SITE_ID") || "d45a189f-d0cc-48de-95ee-30635a95385f";
var wixAccountId = PropertiesService.getScriptProperties().getProperty("WIX_ACCOUNT_ID") || "0e2cde5f-b353-468b-9f4e-36835fc60a0e";

// Base URL for Wix Data API
var WIX_DATA_API_BASE = "https://www.wixapis.com/wix-data/v2";

// Exchange rate keys that should be synced to Performance Statistics
var EXCHANGE_RATE_KEYS = [
  "USDC_EXCHANGE_RATE_RAYDIUM",
  "USD_TREASURY_YIELD_1_MONTH",
  "TDG_DAILY_BUY_BACK_BUDGET",
  "PAST_30_DAYS_SALES",
  "ASSET_PER_TDG_ISSUED",
  "GAS_FEE",
  "TDG_PER_USD_CONTRIBUTION",
  "TDG_PER_HOUR_CONTRIBUTION",
  "TDG_ISSUED",
  "USD_TREASURY_BALANCE",
  "USDT_EXCHANGE_RATE_LATOKENS"
];

/**
 * Main function to sync Wix ExchangeRate collection to Google Sheet
 * Run this once to populate the Performance Statistics tab
 */
function syncWixToPerformanceStatistics() {
  Logger.log("🔄 Starting sync from Wix ExchangeRate collection to Performance Statistics...");
  
  if (!wixAccessToken) {
    throw new Error("❌ WIX_API_KEY not found in Script Properties. Please set it in File > Project Settings > Script Properties");
  }
  
  try {
    // Get or create the Performance Statistics sheet
    var spreadsheet = SpreadsheetApp.openById(ledgerDocId);
    var sheet = spreadsheet.getSheetByName(PERFORMANCE_STATISTICS_SHEET_NAME);
    
    if (!sheet) {
      Logger.log("📝 Creating new sheet: " + PERFORMANCE_STATISTICS_SHEET_NAME);
      sheet = spreadsheet.insertSheet(PERFORMANCE_STATISTICS_SHEET_NAME);
      
      // Set up headers
      sheet.getRange(1, 1).setValue("Key");
      sheet.getRange(1, 2).setValue("Description");
      sheet.getRange(1, 3).setValue("Exchange Rate / Value");
      sheet.getRange(1, 4).setValue("Currency");
      sheet.getRange(1, 5).setValue("Updated Date");
      sheet.getRange(1, 6).setValue("Last Synced");
      
      // Format header row
      var headerRange = sheet.getRange(1, 1, 1, 6);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#f4a300");
      headerRange.setFontColor("#ffffff");
    }
    
    Logger.log("📄 Connected to sheet: " + PERFORMANCE_STATISTICS_SHEET_NAME);
    
    // Fetch all items from Wix ExchangeRate collection
    var wixData = fetchAllWixExchangeRates();
    Logger.log("✅ Fetched " + Object.keys(wixData).length + " items from Wix");
    
    // Prepare data for sheet (use keys in order, match with Wix data)
    var sheetData = [];
    var now = new Date();
    
    for (var i = 0; i < EXCHANGE_RATE_KEYS.length; i++) {
      var key = EXCHANGE_RATE_KEYS[i];
      var item = wixData[key] || null;
      
      if (item) {
        sheetData.push([
          key,
          item.description || key,
          item.exchangeRate !== null && item.exchangeRate !== undefined ? item.exchangeRate : "",
          item.currency || "",
          item.updatedDate ? new Date(item.updatedDate) : "",
          now
        ]);
        Logger.log("   ✅ " + key + ": " + (item.exchangeRate !== null ? item.exchangeRate : "null"));
      } else {
        // Key exists in our list but not found in Wix - add placeholder row
        sheetData.push([
          key,
          key,
          "",
          "",
          "",
          now
        ]);
        Logger.log("   ⚠️  " + key + ": Not found in Wix collection (added placeholder)");
      }
    }
    
    // Clear existing data (except header) and write new data
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
    }
    
    if (sheetData.length > 0) {
      var dataRange = sheet.getRange(2, 1, sheetData.length, 6);
      dataRange.setValues(sheetData);
      
      // Format the Updated Date and Last Synced columns as dates
      if (sheetData.length > 0) {
        sheet.getRange(2, 5, sheetData.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
        sheet.getRange(2, 6, sheetData.length, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
      }
      
      // Auto-resize columns
      sheet.autoResizeColumns(1, 6);
    }
    
    Logger.log("✅ Sync complete! Updated " + sheetData.length + " rows in Performance Statistics");
    
  } catch (error) {
    Logger.log("❌ Error syncing to Performance Statistics: " + error.message);
    throw error;
  }
}

/**
 * Fetch all items from Wix ExchangeRate collection
 * Returns object with keys matching EXCHANGE_RATE_KEYS
 */
function fetchAllWixExchangeRates() {
  var url = WIX_DATA_API_BASE + "/items/query?dataCollectionId=ExchangeRate";
  
  var payload = {
    "query": {
      "paging": {
        "limit": 1000,
        "offset": 0
      }
    }
  };
  
  var options = {
    "method": "post",
    "headers": {
      "Authorization": wixAccessToken,
      "Content-Type": "application/json",
      "wix-site-id": wixSiteId,
      "wix-account-id": wixAccountId
    },
    "payload": JSON.stringify(payload)
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      throw new Error("Wix API returned status " + responseCode + ": " + response.getContentText());
    }
    
    var result = JSON.parse(response.getContentText());
    var items = result.dataItems || result.items || [];
    
    // Build object keyed by description (matching EXCHANGE_RATE_KEYS)
    var exchangeRates = {};
    
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var data = item.data || item;
      
      // Use description as the key (it should match EXCHANGE_RATE_KEYS)
      var key = data.description;
      
      if (key && EXCHANGE_RATE_KEYS.indexOf(key) >= 0) {
        exchangeRates[key] = {
          id: data._id || item.id || item._id || null,
          description: data.description || key,
          exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : null,
          currency: data.currency || null,
          updatedDate: data.updatedDate || data._updatedDate || item.updatedDate || item._updatedDate || null,
          createdDate: data.createdDate || data._createdDate || item.createdDate || item._createdDate || null
        };
      }
    }
    
    return exchangeRates;
    
  } catch (error) {
    Logger.log("❌ Error fetching from Wix: " + error.message);
    throw error;
  }
}

