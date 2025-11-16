/**
 * File: google_app_scripts/performance_statistics_webservice.gs
 * Repository: https://github.com/TrueSightDAO/truesight_me
 * 
 * Description: Web service exposing doGet endpoint to return all Performance Statistics 
 *              values from Google Sheet as JSON.
 * 
 * Deployment:
 * 1. Deploy as web app: Publish > Deploy as web app
 * 2. Set "Execute as: Me" and "Who has access: Anyone, even anonymous"
 * 3. Copy the web app URL and use it in index.html
 * 
 * Endpoint: GET (doGet)
 * Returns: JSON object with all performance statistics
 */

// Google Spreadsheet ID for the ledger document
var ledgerDocId = "1GE7PUq-UT6x2rBN-Q2ksogbWpgyuh2SaxJyG_uEK6PU";

// Sheet name for Performance Statistics
var PERFORMANCE_STATISTICS_SHEET_NAME = "Performance Statistics";

/**
 * Web service endpoint (doGet) - returns all Performance Statistics as JSON
 * 
 * URL format: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
 * 
 * Returns JSON:
 * {
 *   "timestamp": "2025-01-27T12:00:00.000Z",
 *   "data": {
 *     "USDC_EXCHANGE_RATE_RAYDIUM": {
 *       "key": "USDC_EXCHANGE_RATE_RAYDIUM",
 *       "description": "USDC_EXCHANGE_RATE_RAYDIUM",
 *       "exchangeRate": 1.001,
 *       "currency": "USDC",
 *       "updatedDate": "2025-01-27T10:00:00.000Z"
 *     },
 *     ...
 *   }
 * }
 */
function doGet(e) {
  try {
    var data = readPerformanceStatistics();
    
    var response = {
      timestamp: new Date().toISOString(),
      data: data
    };
    
    // Return as JSON with proper CORS headers
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    // Return error as JSON
    var errorResponse = {
      timestamp: new Date().toISOString(),
      error: true,
      message: error.message || "Unknown error occurred"
    };
    
    return ContentService
      .createTextOutput(JSON.stringify(errorResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Read all performance statistics from Google Sheet
 * Returns object keyed by exchange rate key
 */
function readPerformanceStatistics() {
  try {
    var spreadsheet = SpreadsheetApp.openById(ledgerDocId);
    var sheet = spreadsheet.getSheetByName(PERFORMANCE_STATISTICS_SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Sheet '" + PERFORMANCE_STATISTICS_SHEET_NAME + "' not found. Please run syncWixToPerformanceStatistics() first.");
    }
    
    // Get all data (assuming header is in row 1)
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      throw new Error("No data found in Performance Statistics sheet");
    }
    
    var dataRange = sheet.getRange(2, 1, lastRow - 1, 6); // Start from row 2, get 6 columns
    var values = dataRange.getValues();
    
    // Build object keyed by the Key column (column 1)
    var performanceStats = {};
    
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var key = row[0]; // Key column
      var description = row[1]; // Description column
      var exchangeRate = row[2]; // Exchange Rate / Value column
      var currency = row[3]; // Currency column
      var updatedDate = row[4]; // Updated Date column
      
      if (key) {
        performanceStats[key] = {
          key: key,
          description: description || key,
          exchangeRate: exchangeRate !== "" ? exchangeRate : null,
          currency: currency || null,
          updatedDate: updatedDate instanceof Date ? updatedDate.toISOString() : (updatedDate || null)
        };
      }
    }
    
    return performanceStats;
    
  } catch (error) {
    Logger.log("❌ Error reading Performance Statistics: " + error.message);
    throw error;
  }
}

/**
 * Helper function to update a single performance statistic value in the sheet
 * This can be called from other scripts when updating Wix
 * 
 * @param {string} key - The exchange rate key (e.g., "USD_TREASURY_BALANCE")
 * @param {number} value - The new exchange rate / value
 * @param {string} currency - Optional currency code
 */
function updatePerformanceStatistic(key, value, currency) {
  try {
    var spreadsheet = SpreadsheetApp.openById(ledgerDocId);
    var sheet = spreadsheet.getSheetByName(PERFORMANCE_STATISTICS_SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Sheet '" + PERFORMANCE_STATISTICS_SHEET_NAME + "' not found");
    }
    
    // Find the row with this key
    var lastRow = sheet.getLastRow();
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
      Logger.log("✅ Added new row for key: " + key);
    } else {
      // Update existing row
      sheet.getRange(rowIndex, 3).setValue(value !== null && value !== undefined ? value : ""); // Exchange Rate column
      if (currency) {
        sheet.getRange(rowIndex, 4).setValue(currency); // Currency column
      }
      sheet.getRange(rowIndex, 5).setValue(new Date()); // Updated Date
      sheet.getRange(rowIndex, 6).setValue(new Date()); // Last Synced
      Logger.log("✅ Updated row " + rowIndex + " for key: " + key);
    }
    
  } catch (error) {
    Logger.log("❌ Error updating Performance Statistic: " + error.message);
    throw error;
  }
}

