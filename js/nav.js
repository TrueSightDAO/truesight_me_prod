(function() {
  var navHTML =
    '<nav class="site-header">' +
    '  <div class="header-container">' +
    '    <a href="/index.html" class="header-logo">' +
    '      <img' +
    '        src="https://static.wixstatic.com/media/0e2cde_f81b16c82ebe4aaca4b5ce54b819a693~mv2.png/v1/fill/w_622,h_160,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/20240612_truesight_dao_logo_long.png"' +
    '        alt="TrueSight DAO"' +
    '        width="155"' +
    '        height="40"' +
    '        loading="eager"' +
    '      />' +
    '    </a>' +
    '    <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">' +
    '      <span class="hamburger-line"></span>' +
    '      <span class="hamburger-line"></span>' +
    '      <span class="hamburger-line"></span>' +
    '    </button>' +
    '    <ul class="nav-menu" aria-hidden="true">' +
    '      <li><a href="/index.html">Home</a></li>' +
    '      <li><a href="/about-us.html">About Us</a></li>' +
    '      <li>' +
    '        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Projects</button>' +
    '        <ul class="dropdown-menu" aria-expanded="false">' +
    '          <li><a href="/agroverse.html">Agroverse Community</a></li>' +
    '          <li><a href="/sunmint.html">Sunmint Program</a></li>' +
    '          <li><a href="/edgar.html">Edgar Platform</a></li>' +
    '          <li><a href="/programs.html">Programs</a></li>' +
    '          <li><a href="/fundraisers.html">Fundraisers</a></li>' +
    '        </ul>' +
    '      </li>' +
    '      <li><a href="https://truesight.me/proposals" target="_blank" rel="noreferrer noopener">Proposals</a></li>' +
    '      <li>' +
    '        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Community</button>' +
    '        <ul class="dropdown-menu" aria-expanded="false">' +
    '          <li><a href="https://truesight.me/quests" target="_blank" rel="noreferrer noopener">Community Challenges</a></li>' +
    '          <li><a href="https://truesight.me/governors" target="_blank" rel="noreferrer noopener">Community Leaders</a></li>' +
    '          <li><a href="/members.html">Members Directory</a></li>' +
    '          <li><a href="https://truesight.me/recurring-tdg-awards" target="_blank" rel="noreferrer noopener">Ongoing Awards</a></li>' +
    '          <li><a href="https://truesight.me/submissions/scored-and-to-be-tokenized" target="_blank" rel="noreferrer noopener">Upcoming Awards</a></li>' +
    '          <li><a href="https://sophia.truesight.me" target="_blank" rel="noreferrer noopener">Join Chat</a></li>' +
    '          <li><a href="/beerhall/updates.html">Beer Hall digests</a></li>' +
    '        </ul>' +
    '      </li>' +
    '      <li>' +
    '        <button class="dropdown-toggle" aria-expanded="false" aria-haspopup="true">Resources</button>' +
    '        <ul class="dropdown-menu" aria-expanded="false">' +
    '          <li><a href="/faq.html">Frequently Asked Questions</a></li>' +
    '          <li><a href="/whitepaper/">View Whitepaper</a></li>' +
    '          <li><a href="/contracts/">Smart Contracts</a></li>' +
    '          <li><a href="https://truesight.me/tokenomics" target="_blank" rel="noreferrer noopener">Tokenomics</a></li>' +
    '          <li><a href="https://truesight.me/dapp" target="_blank" rel="noreferrer noopener">Web App</a></li>' +
    '          <li><a href="https://truesight.me/ledger" target="_blank" rel="noreferrer noopener">Contributions Record</a></li>' +
'          <li><a href="/ledger/explorer/">Ledger Explorer</a></li>' +
    '          <li><a href="https://truesight.me/roadmap" target="_blank" rel="noreferrer noopener">Roadmap</a></li>' +
    '          <li><a href="/security-dashboard/">Security Dashboard</a></li>' +
    '        </ul>' +
    '      </li>' +
    '      <li><a href="/blog/">Blog</a></li>' +
    '    </ul>' +
    '  </div>' +
    '</nav>';

  var placeholder = document.getElementById('site-nav');
  if (placeholder) {
    placeholder.outerHTML = navHTML;
  } else {
    var temp = document.createElement('div');
    temp.innerHTML = navHTML;
    document.body.insertBefore(temp.firstChild, document.body.firstChild);
  }
})();

// --- Mobile nav behavior: hamburger toggle + dropdown accordions ---
// Centralized here (2026-09) so EVERY page that mounts the header via nav.js
// gets working mobile menus. Historically each page carried its own inline copy
// of this handler -- dozens of drifted variants, and ~17 pages shipped the header
// with NO handler at all (dead hamburger). This delegated, capture-phase listener
// makes nav.js the single source of truth: it handles the toggle clicks *before*
// any page-level handler and stops there, so pages that still carry their own copy
// neither double-fire nor need editing.
(function () {
  if (window.__tsNavMenuWired) { return; }
  window.__tsNavMenuWired = true;

  function q(sel) { return document.querySelector(sel); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) { return; }

    var navMenu = q('.nav-menu');
    var siteHeader = q('.site-header');

    // Hamburger toggle. Non-idempotent, so it must OWN the event: a page-level
    // duplicate handler would otherwise toggle the state straight back.
    var menuToggle = t.closest('.menu-toggle');
    if (menuToggle && navMenu && siteHeader) {
      var isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
      menuToggle.setAttribute('aria-expanded', String(!isExpanded));
      navMenu.setAttribute('aria-hidden', String(isExpanded));
      siteHeader.classList.toggle('menu-open', !isExpanded);
      e.stopImmediatePropagation();
      return;
    }

    // Dropdown accordions -- mobile only (desktop uses hover). Also non-idempotent.
    var dropToggle = t.closest('.nav-menu .dropdown-toggle');
    if (dropToggle && navMenu && window.innerWidth <= 768) {
      e.preventDefault();
      e.stopImmediatePropagation();
      var dExp = dropToggle.getAttribute('aria-expanded') === 'true';
      var dMenu = dropToggle.nextElementSibling;
      dropToggle.setAttribute('aria-expanded', String(!dExp));
      if (dMenu) { dMenu.setAttribute('aria-expanded', String(!dExp)); }
      return;
    }

    // Tapping a nav link closes the drawer. Idempotent -- a page copy running
    // too is harmless, so we deliberately do NOT stop the event here.
    var navLink = t.closest('.nav-menu a');
    if (navLink && navMenu && siteHeader) {
      var mt = q('.menu-toggle');
      if (mt) { mt.setAttribute('aria-expanded', 'false'); }
      navMenu.setAttribute('aria-hidden', 'true');
      siteHeader.classList.remove('menu-open');
      navMenu.querySelectorAll('.dropdown-toggle').forEach(function (dt) {
        dt.setAttribute('aria-expanded', 'false');
        var dm = dt.nextElementSibling;
        if (dm) { dm.setAttribute('aria-expanded', 'false'); }
      });
      return;
    }

    // Backdrop: click on the header itself while the drawer is open.
    if (siteHeader && t === siteHeader && siteHeader.classList.contains('menu-open')) {
      var mt2 = q('.menu-toggle');
      if (mt2) { mt2.setAttribute('aria-expanded', 'false'); }
      if (navMenu) { navMenu.setAttribute('aria-hidden', 'true'); }
      siteHeader.classList.remove('menu-open');
    }
  }, true);
})();
