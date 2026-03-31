# Playwright Consistency Tests for TrueSight.me

Automated tests to ensure visual and layout consistency across all pages.

## Setup

```bash
# Install Playwright
npm install -D @playwright/test
npx playwright install
```

## Running Tests

```bash
# Run all tests
npx playwright test

# Run in UI mode (interactive)
npx playwright test --ui

# Run with browser visible
npx playwright test --headed
```

## Test Coverage

- Navigation consistency
- Font consistency
- Responsive design
- No broken images
- Meta tags consistency
- Visual regression snapshots

## Key Pages Tested

- Homepage (`/`)
- DApp (`/dapp`)
- Ledger (`/ledger`)
- Exchange (`/exchange`)
- Governors (`/governors`)
- Roadmap (`/roadmap`)
- Quests (`/quests`)
- Shipments (`/shipments/*`)
