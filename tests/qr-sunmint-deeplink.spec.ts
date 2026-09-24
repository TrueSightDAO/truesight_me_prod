import { test, expect, Page } from '@playwright/test';

/**
 * QR-page -> SunMint deep-link regression tests (truesight_me_beta).
 *
 * WHY: the QR provenance page had a SunMint ``?deep`` link gated on
 * ``manifest.asset_type === 'tree'``. A cacao BAG whose seedling tree is
 * registered has ``asset_type: 'cacao_bag'``, so the link never rendered for
 * the very asset it was wanted for (thread 35189). The gate is now "any QR
 * the trees registry resolves to a planted tree".
 *
 * These tests assert the two invariants that fix establishes:
 *   1. a tree-linked bag QR shows the SunMint deep-link, carrying ?tree=<id>
 *   2. an asset that EXISTS but is NOT tree-linked shows no SunMint link
 *      (no false positives), and the page raises no uncaught errors
 *
 * The QR page reads the trees registry at runtime, so these are live-data
 * tests: QR_PATH values are real lineage-assets manifests, and the expected
 * presence depends on sunmint/trees/index.geojson. If a governor unlinks the
 * tree the first case would legitimately flip - the assertion is on the
 * INVARIANT (registry-linked ⇒ link shown), not on a hardcoded string alone.
 */

const QR_PATH = '/qr/';
// A real cacao-bag QR whose seedling tree is registered
// (trees/index.geojson: Edgar_20260903083523_003 -> qr_code 2024OSCAR_CB_20260620_1).
const LINKED_BAG_QR = '2024OSCAR_CB_20260620_1';
// A real manifest that exists but is NOT tree-linked - the false-positive control.
const UNLINKED_QR = '2024OSCARD_20251218_1';

function collectPageErrors(page: Page) {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return pageErrors;
}

async function gotoQr(page: Page, qrId: string) {
  await page.goto(`${QR_PATH}?id=${encodeURIComponent(qrId)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  // The page fetches the manifest then the trees registry before rendering,
  // so wait for the related section to settle.
  await page.waitForSelector('.qr-related-grid', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function sunmintLinks(page: Page) {
  return page.$$eval('a.qr-related-link', (as) =>
    as
      .map((a) => ({
        label: (a.querySelector('.label')?.textContent || '').trim(),
        href: a.getAttribute('href') || '',
      }))
      .filter((l) => /SunMint/i.test(l.label)),
  );
}

test.describe('QR page -> SunMint deep-link', () => {
  test('tree-linked cacao bag QR shows the SunMint deep-link with ?tree=', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await gotoQr(page, LINKED_BAG_QR);

    const links = await sunmintLinks(page);
    expect(links.length, 'Expected exactly one SunMint link').toBe(1);

    const href = links[0].href;
    expect(href).toContain('/sunmint.html?');
    // The registry links this bag to a specific tree, so the deep-link must
    // carry the tree id, not just fall back to the qr id.
    expect(href).toContain('tree=Edgar_20260903083523_003');
    // Root-relative: must NOT hardcode a host (regression guard for the old
    // beta.truesight.me wart).
    expect(href.startsWith('/sunmint.html')).toBe(true);

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  });

  test('exists-but-unlinked QR renders no SunMint link (no false positives)', async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await gotoQr(page, UNLINKED_QR);

    // The manifest exists and the page renders (badges present)...
    const badges = await page.$$eval('.qr-badge', (bs) => bs.length);
    expect(badges, 'Control QR should render its badges').toBeGreaterThan(0);
    // ...but there is no tree link, so no SunMint deep-link may appear.
    expect(await sunmintLinks(page)).toEqual([]);

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join('; ')}`).toEqual([]);
  });
});
