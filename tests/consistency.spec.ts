import { test, expect } from '@playwright/test';

/**
 * Visual and Layout Consistency Tests for TrueSight.me
 * 
 * Tests ensure:
 * - Navigation consistency across all pages
 * - Branding elements (logo, colors, fonts) are consistent
 * - Layout structure is consistent
 * - Responsive design works across breakpoints
 */

const BASE_URL = 'https://www.truesight.me';
const BREAKPOINTS = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 }
];

// Key pages to test
const KEY_PAGES = [
  '/',
  '/dapp',
  '/ledger',
  '/exchange',
  '/governors',
  '/roadmap',
  '/bounty',
  '/quests',
  '/shipments/agl7'
];

test.describe('TrueSight.me - Visual Consistency', () => {
  
  test('Navigation is consistent across pages', async ({ page }) => {
    for (const url of KEY_PAGES) {
      await page.goto(`${BASE_URL}${url}`);
      await page.waitForLoadState('networkidle');
      
      // Check header/navigation exists (adjust selector based on actual structure)
      const header = page.locator('header, nav, .header, .navigation').first();
      if (await header.count() > 0) {
        await expect(header).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('Brand fonts are consistent', async ({ page }) => {
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    
    // Check fonts match expected (Space Grotesk + Inter)
    const body = page.locator('body');
    const bodyFont = await body.evaluate((el) => {
      return window.getComputedStyle(el).fontFamily;
    });
    
    // Should contain Space Grotesk or Inter
    expect(bodyFont).toMatch(/Space Grotesk|Inter/);
  });

  test('Responsive design works across breakpoints', async ({ page }) => {
    for (const breakpoint of BREAKPOINTS) {
      await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
      
      for (const url of ['/', '/dapp', '/ledger']) {
        await page.goto(`${BASE_URL}${url}`);
        await page.waitForLoadState('networkidle');
        
        // Check no horizontal scroll
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      }
    }
  });

  test('No broken images', async ({ page }) => {
    const brokenImages: string[] = [];
    
    page.on('response', (response) => {
      if (response.url().match(/\.(jpg|jpeg|png|gif|webp)$/i) && response.status() === 404) {
        brokenImages.push(response.url());
      }
    });

    for (const url of KEY_PAGES) {
      await page.goto(`${BASE_URL}${url}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }
    
    expect(brokenImages).toHaveLength(0);
  });

  test('Meta tags are consistent', async ({ page }) => {
    for (const url of KEY_PAGES) {
      await page.goto(`${BASE_URL}${url}`);
      
      // Check required meta tags
      await expect(page.locator('meta[property="og:type"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    }
  });
});

test.describe('TrueSight.me - Visual Regression', () => {
  
  test('Homepage visual snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('homepage-desktop.png', {
      fullPage: true,
      maxDiffPixels: 1000
    });
  });

  test('Mobile viewport snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('homepage-mobile.png', {
      fullPage: true,
      maxDiffPixels: 1000
    });
  });
});
