/**
 * Shared rendering shell for per-program credentialing surfaces.
 *
 * Used by:
 *   - programs/<slug>/index.html       (program landing)
 *   - programs/<slug>/members.html     (cohort listing)
 *   - programs/<slug>/credentials/index.html  (per-member CV, QR target)
 *
 * Each consumer:
 *   1. Calls TrueSightProgramShell.init({ manifestPath, type })
 *      where `type` is one of 'landing' | 'members' | 'credential'
 *      and `manifestPath` is the relative path to the program's manifest.json
 *      (typically './manifest.json' or '../manifest.json' for credential pages).
 *   2. Provides the DOM hooks the renderer expects (see each render function below).
 *
 * Fetches use the jsDelivr-primary + raw.github fallback pattern from
 * `js/ecosystem-change-log-feed.js` (the GFW-resilience fix shipped in
 * truesight_me_beta#82). Reused here so program pages stay readable
 * for users on networks that can't reach raw.githubusercontent.com.
 *
 * Spec: agentic_ai_context/CREDENTIALING_PROGRAM_PAGES.md
 */
(function () {
  'use strict';

  var LINEAGE_PRIMARY = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-credentials@main';
  var LINEAGE_FALLBACK = 'https://raw.githubusercontent.com/TrueSightDAO/lineage-credentials/main';

  function fetchJsonWithFallback(relPath) {
    var primary = LINEAGE_PRIMARY + relPath;
    var fallback = LINEAGE_FALLBACK + relPath;
    return fetch(primary, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error('primary HTTP ' + r.status);
      return r.json();
    }).catch(function (primaryErr) {
      try { console.warn('lineage feed primary failed, retrying via raw:', primaryErr && primaryErr.message); } catch (e) {}
      return fetch(fallback, { cache: 'default' }).then(function (r) {
        if (!r.ok) throw new Error(relPath + ': HTTP ' + r.status);
        return r.json();
      });
    });
  }

  function loadManifest(manifestPath) {
    return fetch(manifestPath, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(manifestPath + ': HTTP ' + r.status);
      return r.json();
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      var s = String(iso);
      var d = new Date(s.indexOf('Z') === -1 && s.indexOf('+') === -1 ? s + 'Z' : s);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return iso; }
  }

  /** Insert a co-brand chrome strip into el. Idempotent. */
  function renderCoBrandStrip(el, manifest, opts) {
    if (!el || !manifest) return;
    var partnerLogo = (manifest.co_brand && manifest.co_brand.partner_logo_url) || '';
    var partnerName = manifest.partner_organization || manifest.display_name || '';
    var programName = manifest.display_name || manifest.program_slug || '';
    var partnerUrl = manifest.partner_url || '';
    var html = '<div class="cobrand-strip">';
    if (partnerLogo) {
      html += '<img class="cobrand-logo" src="' + escapeHtml(partnerLogo) + '" alt="' + escapeHtml(partnerName) + '" onerror="this.style.display=\'none\'" />';
    }
    html += '<div class="cobrand-text">';
    html += '<div class="cobrand-line">';
    html += '<span class="cobrand-program">' + escapeHtml(programName) + '</span>';
    html += '<span class="cobrand-divider">·</span>';
    html += '<span class="cobrand-issuer">Co-issued with <a href="../../index.html">TrueSight DAO</a></span>';
    html += '</div>';
    if (opts && opts.tagline && manifest.tagline) {
      html += '<div class="cobrand-tagline">' + escapeHtml(manifest.tagline) + '</div>';
    }
    if (partnerUrl) {
      html += '<a class="cobrand-partner-link" href="' + escapeHtml(partnerUrl) + '" target="_blank" rel="noopener noreferrer">Visit ' + escapeHtml(partnerName) + ' →</a>';
    }
    html += '</div></div>';
    el.innerHTML = html;
  }

  function memberCardHtml(m, programSlug) {
    var slug = m.slug || (m.pk_hash || '');
    var html = '<a class="member-card" href="credentials/#' + encodeURIComponent(slug) + '">';
    html += '<div class="name">' + escapeHtml(m.display_name || slug) + '</div>';
    var sub = [];
    if (m.total_contributions) {
      sub.push(escapeHtml(String(m.total_contributions)) + (m.total_contributions === 1 ? ' contribution' : ' contributions'));
    }
    if (sub.length) html += '<div class="meta">' + sub.join(' · ') + '</div>';
    var badges = [];
    if (m.is_governor) badges.push('<span class="badge governor">Governor</span>');
    if (m.has_elective_records) badges.push('<span class="badge practitioner">Practitioner</span>');
    if (badges.length) html += '<div class="badges">' + badges.join('') + '</div>';
    html += '</a>';
    return html;
  }

  function renderMembers(manifest) {
    var statusEl = document.getElementById('members-status');
    var errEl = document.getElementById('members-error');
    var gridEl = document.getElementById('members-grid');
    var emptyEl = document.getElementById('members-empty');
    if (!gridEl) return;

    var filterProgram = (manifest.membership_filter && manifest.membership_filter.primary_program) || manifest.program_slug;

    fetchJsonWithFallback('/_cache/index.json').then(function (data) {
      if (statusEl) statusEl.textContent = '';
      var all = data.members || [];
      var cohort = all.filter(function (m) { return m.primary_program === filterProgram; });

      if (!cohort.length) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      // Sort: governors first, then by total_tdg_controlled desc, then display_name asc.
      cohort.sort(function (a, b) {
        var ga = a.is_governor ? 0 : 1;
        var gb = b.is_governor ? 0 : 1;
        if (ga !== gb) return ga - gb;
        var ta = a.total_tdg_controlled || 0;
        var tb = b.total_tdg_controlled || 0;
        if (ta !== tb) return tb - ta;
        return (a.display_name || '').localeCompare(b.display_name || '');
      });
      gridEl.innerHTML = cohort.map(function (m) { return memberCardHtml(m, manifest.program_slug); }).join('');
      if (gridEl.parentElement) gridEl.parentElement.style.display = 'block';

      var countEl = document.getElementById('members-count');
      if (countEl) countEl.textContent = String(cohort.length);
    }).catch(function (err) {
      if (statusEl) statusEl.textContent = '';
      if (errEl) {
        errEl.textContent = 'Failed to load cohort: ' + err.message;
        errEl.style.display = 'block';
      }
    });
  }

  function renderCredential(manifest) {
    var slug = (window.location.hash || '').replace(/^#/, '').trim();
    var errEl = document.getElementById('credential-error');
    var bodyEl = document.getElementById('credential-body');
    var statusEl = document.getElementById('credential-status');

    if (!slug) {
      if (statusEl) statusEl.textContent = '';
      if (errEl) {
        errEl.innerHTML = 'No member id in URL. Browse the <a href="../members.html">cohort listing</a> to find a profile.';
        errEl.style.display = 'block';
      }
      return;
    }

    fetchJsonWithFallback('/_cache/cv/' + encodeURIComponent(slug) + '.json').then(function (cv) {
      if (statusEl) statusEl.textContent = '';
      var programFilter = (manifest.membership_filter && manifest.membership_filter.primary_program) || manifest.program_slug;
      var programs = cv.programs || {};
      var programRecord = programs[programFilter] || null;

      var html = '';
      html += '<header class="credential-header">';
      html += '<h1 class="credential-name">' + escapeHtml(cv.display_name || slug) + '</h1>';
      html += '<p class="credential-tagline">Credentialed via <strong>' + escapeHtml(manifest.display_name) + '</strong></p>';
      html += '</header>';

      if (!programRecord) {
        html += '<p class="credential-warn">No <strong>' + escapeHtml(manifest.display_name) + '</strong> records on file for this member yet. They may appear in another program — see the <a href="../../../credentials/#' + encodeURIComponent(slug) + '">full credential profile</a>.</p>';
      } else {
        html += '<section class="credential-section">';
        html += '<h2>' + escapeHtml(programRecord.display_name || manifest.display_name) + '</h2>';
        var summary = [];
        if (programRecord.practice_count) summary.push('<strong>' + escapeHtml(String(programRecord.practice_count)) + '</strong> practice session' + (programRecord.practice_count === 1 ? '' : 's'));
        if (programRecord.total_practice_minutes) summary.push('<strong>' + escapeHtml(String(programRecord.total_practice_minutes)) + '</strong> minutes logged');
        if (programRecord.lineage_root) summary.push('Lineage root: <strong>' + escapeHtml(programRecord.lineage_root) + '</strong>');
        if (summary.length) html += '<p class="credential-summary">' + summary.join(' · ') + '</p>';

        var events = programRecord.recent_events || [];
        if (events.length) {
          html += '<h3>Recent events</h3><ul class="credential-events">';
          for (var i = 0; i < Math.min(events.length, 10); i++) {
            var ev = events[i];
            var when = formatDate(ev.captured_at);
            var what = ev.practice_type || ev.event_type || 'event';
            var srcLink = ev.source_url ? ' · <a href="' + escapeHtml(ev.source_url) + '" target="_blank" rel="noopener noreferrer">source</a>' : '';
            html += '<li><time>' + escapeHtml(when) + '</time> · ' + escapeHtml(what) + srcLink + '</li>';
          }
          html += '</ul>';
        }
        html += '</section>';
      }

      html += '<footer class="credential-footer">';
      html += '<a class="btn-link" href="../../../credentials/#' + encodeURIComponent(slug) + '">View full credential profile →</a>';
      html += '<a class="btn-link secondary" href="../members.html">All ' + escapeHtml(manifest.display_name) + ' cohort →</a>';
      html += '</footer>';

      if (bodyEl) bodyEl.innerHTML = html;
    }).catch(function (err) {
      if (statusEl) statusEl.textContent = '';
      if (errEl) {
        errEl.innerHTML = 'Could not load this credential. The id <code>' + escapeHtml(slug) + '</code> may not exist yet. Browse <a href="../members.html">all ' + escapeHtml(manifest.display_name) + ' members</a>.';
        errEl.style.display = 'block';
      }
    });

    // React to hash changes (shouldn't happen for QR scans but useful for in-site nav)
    window.addEventListener('hashchange', function () { renderCredential(manifest); });
  }

  window.TrueSightProgramShell = {
    init: function (opts) {
      var manifestPath = (opts && opts.manifestPath) || './manifest.json';
      var type = opts && opts.type;
      loadManifest(manifestPath).then(function (manifest) {
        // Apply manifest-driven page metadata
        if (manifest.display_name) {
          var titleSuffix = ' | TrueSight DAO';
          var prefix = type === 'landing' ? '' : type === 'members' ? 'Cohort — ' : type === 'credential' ? 'Credential — ' : '';
          document.title = prefix + manifest.display_name + titleSuffix;
        }
        // Render co-brand strip if a host element exists
        var strip = document.getElementById('cobrand-strip');
        if (strip) renderCoBrandStrip(strip, manifest, { tagline: type !== 'credential' });

        // Render landing-specific fields
        if (type === 'landing') {
          var descEl = document.getElementById('program-description');
          if (descEl && manifest.description_md) descEl.textContent = manifest.description_md;
          var taglineEl = document.getElementById('program-tagline');
          if (taglineEl && manifest.tagline) taglineEl.textContent = manifest.tagline;
          var nameEl = document.getElementById('program-name');
          if (nameEl) nameEl.textContent = manifest.display_name;
          var partnerEl = document.getElementById('program-partner');
          if (partnerEl) partnerEl.textContent = manifest.partner_organization;
          var sourceEl = document.getElementById('program-source-link');
          if (sourceEl && manifest.source_pages && manifest.source_pages.length) {
            sourceEl.href = manifest.source_pages[0];
            sourceEl.style.display = 'inline-block';
          }
        }
        if (type === 'members') renderMembers(manifest);
        if (type === 'credential') renderCredential(manifest);
      }).catch(function (err) {
        var hosts = ['program-status', 'members-status', 'credential-status'];
        hosts.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.innerHTML = 'Manifest load failed: ' + escapeHtml(err.message);
        });
      });
    },
    fetchJsonWithFallback: fetchJsonWithFallback,
    escapeHtml: escapeHtml,
  };
})();
