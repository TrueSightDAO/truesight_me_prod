#!/usr/bin/env node

/**
 * Script to add Google Analytics (gtag.js) to all HTML files in the truesight_me project
 * 
 * This script:
 * 1. Finds all HTML files in the project
 * 2. Checks if Google Analytics is already present
 * 3. Adds the Google Analytics code right after the <head> tag if missing
 * 4. Ensures all pages have tracking enabled
 */

const fs = require('fs');
const path = require('path');

const GOOGLE_ANALYTICS_CODE = `<!-- Google tag (gtag.js) - only on truesight.me production -->
<script>
(function() {
  var h = window.location.hostname;
  if (h !== 'truesight.me' && h !== 'www.truesight.me') return;
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=G-9QN16RFM0T';
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-9QN16RFM0T');
})();
</script>`;

const GA_ID = 'G-9QN16RFM0T';

// Directories to exclude from processing
const EXCLUDE_DIRS = ['node_modules', '.git', '.vercel'];

/**
 * Recursively find all HTML files in a directory
 */
function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip excluded directories
    if (stat.isDirectory()) {
      const dirName = path.basename(filePath);
      if (!EXCLUDE_DIRS.includes(dirName)) {
        findHtmlFiles(filePath, fileList);
      }
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Check if a file already has Google Analytics
 */
function hasGoogleAnalytics(content) {
  return content.includes(GA_ID) || 
         content.includes('googletagmanager.com/gtag/js') ||
         content.includes('gtag(');
}

/**
 * Add Google Analytics to an HTML file
 */
function addGoogleAnalytics(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has Google Analytics
    if (hasGoogleAnalytics(content)) {
      console.log(`⏭️  Skipping (already has GA): ${filePath}`);
      return { updated: false, skipped: true };
    }

    // Find the <head> tag
    const headMatch = content.match(/<head[^>]*>/i);
    if (!headMatch) {
      console.log(`⚠️  No <head> tag found: ${filePath}`);
      return { updated: false, error: 'No head tag' };
    }

    const headTag = headMatch[0];
    const headIndex = content.indexOf(headTag);
    const insertPosition = headIndex + headTag.length;

    // Insert Google Analytics right after <head>
    const beforeHead = content.substring(0, insertPosition);
    const afterHead = content.substring(insertPosition);

    // Add newline if needed
    const newline = afterHead.startsWith('\n') ? '' : '\n';
    const updatedContent = beforeHead + newline + '    ' + GOOGLE_ANALYTICS_CODE.replace(/\n/g, '\n    ') + '\n' + afterHead;

    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✅ Updated: ${filePath}`);
    return { updated: true };
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return { updated: false, error: error.message };
  }
}

/**
 * Main function
 */
function main() {
  const projectRoot = path.join(__dirname, '..');
  console.log(`🔍 Searching for HTML files in: ${projectRoot}\n`);

  const htmlFiles = findHtmlFiles(projectRoot);
  console.log(`Found ${htmlFiles.length} HTML files\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  htmlFiles.forEach(filePath => {
    const relativePath = path.relative(projectRoot, filePath);
    const result = addGoogleAnalytics(filePath);
    
    if (result.updated) {
      updatedCount++;
    } else if (result.skipped) {
      skippedCount++;
    } else if (result.error) {
      errorCount++;
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updatedCount} files`);
  console.log(`   ⏭️  Skipped: ${skippedCount} files (already have GA)`);
  console.log(`   ❌ Errors: ${errorCount} files`);
  console.log(`   📄 Total: ${htmlFiles.length} files`);
}

if (require.main === module) {
  main();
}

module.exports = { addGoogleAnalytics, hasGoogleAnalytics };





