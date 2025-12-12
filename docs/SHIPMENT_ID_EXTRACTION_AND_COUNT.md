# Shipment ID Extraction and Tree Count Solution

## Problem
- Column T "Trees to be Planted" in "Shipment Ledger Listing" should count sold QR codes
- Count rows in "Agroverse QR codes" where:
  - Column D = "sold" (or marked as sold)
  - Column C ends with the Shipment ID (from Column A of "Shipment Ledger Listing", lowercased)
- Column C in "Agroverse QR codes" contains URLs like `https://www.agroverse.shop/agl8`

## Solution 1: Extract Shipment ID from URL (Recommended)

### Formula to Extract Shipment ID from Column C
Use this formula to extract the shipment ID (everything after the final "/"):

```excel
=REGEXEXTRACT(C238, "[^/]+$")
```

Or if you want to handle trailing slashes:

```excel
=TRIM(REGEXEXTRACT(C238, "[^/]+$"))
```

**Explanation:**
- `[^/]+$` matches one or more non-slash characters at the end of the string
- This extracts "agl8" from "https://www.agroverse.shop/agl8"

### Alternative (if REGEXEXTRACT doesn't work):
```excel
=RIGHT(C238, LEN(C238) - FIND("~", SUBSTITUTE(C238, "/", "~", LEN(C238)-LEN(SUBSTITUTE(C238, "/", "")))))
```

Or simpler:
```excel
=TRIM(RIGHT(SUBSTITUTE(C238, "/", REPT(" ", 100)), 100))
```

## Solution 2: Count Sold QR Codes by Shipment ID

### Option A: Direct COUNTIFS (No Helper Column Needed)

In Column T of "Shipment Ledger Listing", use:

```excel
=COUNTIFS('Agroverse QR codes'!D:D, "sold", 'Agroverse QR codes'!C:C, "*" & LOWER(A2))
```

**Where:**
- `A2` is the Shipment ID in "Shipment Ledger Listing" (e.g., "AGL8")
- `LOWER(A2)` converts it to lowercase (e.g., "agl8")
- `"*" & LOWER(A2)` creates a wildcard pattern (e.g., "*agl8")
- This counts rows where Column D = "sold" AND Column C ends with the shipment ID

### Option B: With Helper Column (Cleaner for Complex Logic)

**Step 1:** Add a helper column in "Agroverse QR codes" (e.g., Column E) to extract Shipment ID:

```excel
=TRIM(REGEXEXTRACT(C2, "[^/]+$"))
```

**Step 2:** In Column T of "Shipment Ledger Listing":

```excel
=COUNTIFS('Agroverse QR codes'!D:D, "sold", 'Agroverse QR codes'!E:E, LOWER(A2))
```

## Recommended Approach

**I recommend Option A (Direct COUNTIFS)** because:
1. ✅ No helper column needed - keeps sheet cleaner
2. ✅ Updates automatically when QR codes are marked as sold
3. ✅ Single formula, easy to maintain
4. ✅ Works with wildcard matching

**However, if you want the helper column approach:**
- ✅ More explicit and easier to debug
- ✅ Can be used for other purposes (filtering, validation)
- ✅ Better performance if you have many rows

## Implementation Steps

### For Direct COUNTIFS (Recommended):

1. In "Shipment Ledger Listing", Column T, Row 2 (assuming Row 1 is headers):
   ```excel
   =COUNTIFS('Agroverse QR codes'!D:D, "sold", 'Agroverse QR codes'!C:C, "*" & LOWER(A2))
   ```

2. Copy this formula down for all shipment rows

3. The formula will automatically:
   - Count QR codes where Column D = "sold"
   - Match URLs in Column C that end with the shipment ID (lowercase)

### For Helper Column Approach:

1. In "Agroverse QR codes", add a new column (e.g., Column E) with header "Extracted Shipment ID"

2. In Row 2 of that column:
   ```excel
   =IF(C2="", "", TRIM(REGEXEXTRACT(C2, "[^/]+$")))
   ```

3. Copy down for all rows

4. In "Shipment Ledger Listing", Column T, Row 2:
   ```excel
   =COUNTIFS('Agroverse QR codes'!D:D, "sold", 'Agroverse QR codes'!E:E, LOWER(A2))
   ```

## Notes

- The wildcard `*` in `"*" & LOWER(A2)` matches any characters before the shipment ID
- This handles URLs like:
  - `https://www.agroverse.shop/agl8` ✅
  - `https://agroverse.shop/agl8` ✅
  - `agl8` ✅
- Make sure Column D uses consistent values for "sold" status (case-sensitive in COUNTIFS)
- If "sold" might be "Sold", "SOLD", etc., use:
  ```excel
  =COUNTIFS('Agroverse QR codes'!D:D, "sold", 'Agroverse QR codes'!C:C, "*" & LOWER(A2)) + COUNTIFS('Agroverse QR codes'!D:D, "Sold", 'Agroverse QR codes'!C:C, "*" & LOWER(A2))
  ```
  Or better, normalize the "sold" values in Column D to be consistent.

## Testing

Test with a known shipment:
1. Find a shipment ID (e.g., "AGL8" in Column A)
2. Manually count sold QR codes in "Agroverse QR codes" where Column C ends with "agl8"
3. Verify the formula returns the same count









