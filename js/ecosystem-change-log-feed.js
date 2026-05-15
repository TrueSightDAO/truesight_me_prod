/**
 * Load Beer Hall / ecosystem_change_logs JSON from a CDN with fallback.
 * Used by index.html (preview) and beerhall/updates.html (list + detail).
 *
 * Why two bases (2026-05-14):
 *   raw.githubusercontent.com is regionally unreliable — blocked by the
 *   GFW for users in mainland China, and occasionally throttles aggressive
 *   refreshes. jsDelivr proxies the same Git tree via a global edge CDN
 *   (Cloudflare + Bunny) that reaches into China and serves cached blobs
 *   sub-second. We try jsDelivr first, fall back to raw on any error so
 *   the homepage Beer Hall section degrades gracefully if either CDN is
 *   blocked, throttled, or stale.
 *
 *   jsDelivr caches `@main` aggressively (~12h TTL). That's acceptable
 *   here because Beer Hall digests are weekly-ish; if an operator needs
 *   to surface a freshly-merged digest immediately, raw.githubusercontent
 *   will pick it up on the fallback path.
 */
(function () {
  'use strict';

  var PRIMARY_BASE = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/ecosystem_change_logs@main/';
  var FALLBACK_BASE = 'https://raw.githubusercontent.com/TrueSightDAO/ecosystem_change_logs/main/';

  function fetchJsonFrom(base, relPath) {
    return fetch(base + relPath, { cache: 'default' }).then(function (res) {
      if (!res.ok) {
        throw new Error(base + relPath + ': HTTP ' + res.status);
      }
      return res.json();
    });
  }

  function repoFetch(relPath) {
    var path = String(relPath || '').replace(/^\//, '');
    return fetchJsonFrom(PRIMARY_BASE, path).catch(function (primaryErr) {
      try {
        console.warn('ecosystem feed primary failed, retrying via raw:', primaryErr && primaryErr.message);
      } catch (e) {}
      return fetchJsonFrom(FALLBACK_BASE, path);
    });
  }

  function formatPostedAt(iso) {
    if (!iso) return '';
    try {
      var s = String(iso);
      var d = new Date(s.indexOf('Z') === -1 && s.indexOf('+') === -1 ? s + 'Z' : s);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  /** @param {string} p repo-relative e.g. beer_hall/entries/beer-hall_....json */
  function entryStemFromJsonPath(p) {
    if (!p || typeof p !== 'string') return '';
    var slash = p.lastIndexOf('/');
    var file = slash >= 0 ? p.slice(slash + 1) : p;
    if (!/^beer-hall_[a-zA-Z0-9._-]+\.json$/.test(file)) return '';
    return file.replace(/\.json$/, '');
  }

  function isValidEntryStem(stem) {
    return typeof stem === 'string' && /^beer-hall_[a-zA-Z0-9._-]+$/.test(stem);
  }

  window.TrueSightEcosystemFeed = {
    // Historical alias — some callers reference RAW_BASE directly.
    RAW_BASE: FALLBACK_BASE,
    PRIMARY_BASE: PRIMARY_BASE,
    FALLBACK_BASE: FALLBACK_BASE,
    repoFetch: repoFetch,
    formatPostedAt: formatPostedAt,
    entryStemFromJsonPath: entryStemFromJsonPath,
    isValidEntryStem: isValidEntryStem,
    loadManifest: function () {
      return repoFetch('beer_hall/feed/manifest.json');
    },
    loadPage: function (pageNum) {
      var n = parseInt(String(pageNum), 10);
      if (!n || n < 1) n = 1;
      return repoFetch('beer_hall/feed/page-' + n + '.json');
    },
    loadEntryJson: function (stem) {
      if (!isValidEntryStem(stem)) {
        return Promise.reject(new Error('Invalid entry id'));
      }
      return repoFetch('beer_hall/entries/' + stem + '.json');
    },
    githubBlobUrl: function (repoRelativePath) {
      var p = String(repoRelativePath || '').replace(/^\//, '');
      return 'https://github.com/TrueSightDAO/ecosystem_change_logs/blob/main/' + encodeURI(p);
    },
  };
})();
