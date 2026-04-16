/**
 * Load Beer Hall / ecosystem_change_logs JSON from the public GitHub raw tree.
 * Used by index.html (preview) and beerhall/updates.html (list + detail).
 */
(function () {
  'use strict';

  var RAW_BASE = 'https://raw.githubusercontent.com/TrueSightDAO/ecosystem_change_logs/main/';

  function repoFetch(relPath) {
    var path = String(relPath || '').replace(/^\//, '');
    return fetch(RAW_BASE + path, { cache: 'default' }).then(function (res) {
      if (!res.ok) {
        throw new Error(path + ': HTTP ' + res.status);
      }
      return res.json();
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
    RAW_BASE: RAW_BASE,
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
