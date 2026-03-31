# Running Visual Consistency Tests

## Local Development

### Quick Start

```bash
# Install dependencies (first time only)
npm install
npx playwright install

# Run all tests
npm test

# Run tests with browser visible
npm run test:headed

# Run tests in interactive UI mode (recommended!)
npm run test:ui
```

### Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests headless |
| `npm run test:ui` | Run tests in interactive UI mode |
| `npm run test:headed` | Run tests with browser visible |
| `npm run test:update` | Update visual snapshots |
| `npm run test:report` | Open last test report |

---

## CI/CD (GitHub Actions)

Tests automatically run on:
- ✅ Every push to `main`/`master` branch
- ✅ Every pull request
- ✅ Manual trigger

See `.github/workflows/visual-consistency.yml` for configuration.

---

## Troubleshooting

See `agroverse_shop/tests/RUN_TESTS.md` for detailed troubleshooting guide.
