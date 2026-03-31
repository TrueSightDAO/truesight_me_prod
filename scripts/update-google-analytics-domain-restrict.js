#!/usr/bin/env node

/**
 * Replaces existing Google Analytics snippet with a domain-restricted version
 * that only loads on truesight.me and www.truesight.me (not beta, localhost, file://)
 */

const fs = require('fs');
const path = require('path');

const NEW_GA_SNIPPET = `<!-- Google tag (gtag.js) - only on truesight.me production -->
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

// Regex to match the old GA block (flexible whitespace)
const OLD_GA_PATTERN = /<!--\s*Google tag \(gtag\.js\)\s*-->\s*<script\s+async\s+src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-9QN16RFM0T"><\/script>\s*<script>\s*window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\];\s*function\s+gtag\(\)\{dataLayer\.push\(arguments\);\}\s*gtag\('js',\s*new\s+Date\(\)\);?\s*gtag\('config',\s*'G-9QN16RFM0T'\);\s*<\/script>/gi;

// Also match the new snippet to avoid double-updating (idempotent)
const NEW_GA_PATTERN = /<!--\s*Google tag \(gtag\.js\)\s*-\s*only on truesight\.me production\s*-->/;

const EXCLUDE_DIRS = ['node_modules', '.git', '.vercel'];

function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
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

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip if already has the new domain-restricted snippet
    if (NEW_GA_PATTERN.test(content)) {
      return { updated: false, skipped: 'already updated' };
    }

    // Replace old GA with new
    const newContent = content.replace(OLD_GA_PATTERN, NEW_GA_SNIPPET);
    if (newContent === content) {
      return { updated: false, skipped: 'no match' };
    }

    fs.writeFileSync(filePath, newContent, 'utf8');
    return { updated: true };
  } catch (error) {
    return { updated: false, error: error.message };
  }
}

function main() {
  const projectRoot = path.join(__dirname, '..');
  console.log('Replacing GA snippet with domain-restricted version...\n');

  const htmlFiles = findHtmlFiles(projectRoot);
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  htmlFiles.forEach(filePath => {
    const result = updateFile(filePath);
    const rel = path.relative(projectRoot, filePath);
    if (result.updated) {
      console.log('  Updated:', rel);
      updated++;
    } else if (result.error) {
      console.error('  Error:', rel, result.error);
      errors++;
    } else {
      skipped++;
    }
  });

  console.log('\nSummary:');
  console.log('  Updated:', updated);
  console.log('  Skipped:', skipped);
  console.log('  Errors:', errors);
}

main();
