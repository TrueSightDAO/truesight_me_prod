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

  function fetchJsonWithFallback(relPath, opts) {
    opts = opts || {};
    var primary = LINEAGE_PRIMARY + relPath;
    var fallback = LINEAGE_FALLBACK + relPath;

    // For index.json, skip jsDelivr's long cache — accuracy matters more than speed.
    if (opts.fresh) {
      return fetch(fallback, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(relPath + ': HTTP ' + r.status);
        return r.json();
      });
    }

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

  // Minimal inline-markdown renderer for manifest description_md fields.
  // Supports: ### headings, 1. ordered lists, - /* unordered lists,
  // [label](url) links, `code`, and \n\n paragraph breaks.
  // Escape first so any pre-existing HTML in the manifest is neutralised
  // before we add our own.
  function renderInlineMarkdown(md) {
    var s = escapeHtml(md);

    // Process inline constructs (links, code) within a line of text.
    function renderLine(line) {
      var r = line;
      r = r.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, text, url) {
        return '<a href="' + url + '" target="_blank" rel="noreferrer noopener">' + text + '</a>';
      });
      r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
      return r;
    }

    // Split into paragraphs on \n\n (or \r\n\r\n).
    var paragraphs = s.split(/\n{2,}|\r\n{2,}/);
    var out = [];
    for (var i = 0; i < paragraphs.length; i++) {
      var block = paragraphs[i].trim();
      if (!block) continue;

      // ### heading
      var headingMatch = block.match(/^#{3}\s+(.+)$/m);
      if (headingMatch) {
        out.push('<h3>' + renderLine(headingMatch[1]) + '</h3>');
        continue;
      }

      // Ordered list: lines starting with /^\d+\.\s/
      var olLines = [];
      var lines = block.split(/\n/);
      var isOl = true;
      for (var j = 0; j < lines.length; j++) {
        var l = lines[j].trim();
        if (!l) continue;
        var liMatch = l.match(/^\d+\.\s+(.+)$/);
        if (liMatch) {
          olLines.push('<li>' + renderLine(liMatch[1]) + '</li>');
        } else {
          isOl = false;
          break;
        }
      }
      if (isOl && olLines.length) {
        out.push('<ol>' + olLines.join('') + '</ol>');
        continue;
      }

      // Unordered list: lines starting with /^[-*]\s/
      var ulLines = [];
      var isUl = true;
      for (var k = 0; k < lines.length; k++) {
        var l2 = lines[k].trim();
        if (!l2) continue;
        var liMatch2 = l2.match(/^[-*]\s+(.+)$/);
        if (liMatch2) {
          ulLines.push('<li>' + renderLine(liMatch2[1]) + '</li>');
        } else {
          isUl = false;
          break;
        }
      }
      if (isUl && ulLines.length) {
        out.push('<ul>' + ulLines.join('') + '</ul>');
        continue;
      }

      // Plain paragraph — render inline and wrap.
      out.push('<p>' + renderLine(block) + '</p>');
    }

    return out.join('\n');
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

  // Render one practice-event row inside the credential page's
  // "Recent events" list. If the event carries a `payload` block (theme,
  // moves_practiced, music_played, total_practice_minutes — populated by
  // capoeira/assets/js/practice-event-submit.js and persisted through
  // lineage-engine's cache build), wrap it in a <details> so tapping the
  // row reveals what was actually practiced. Events without a payload
  // (legacy or non-practice event types) fall back to the original
  // single-line rendering.
  function renderEventListItem(ev) {
    var when = formatDate(ev.captured_at);
    var what = ev.practice_type || ev.event_type || 'event';
    var payload = (ev && ev.payload) || null;
    var theme = payload && payload.theme;
    var totalMin = payload && payload.total_practice_minutes;
    var moves = (payload && payload.moves_practiced) || [];
    var music = (payload && payload.music_played) || [];
    var srcUrl = ev && ev.source_url;

    var summaryHtml =
      '<time>' + escapeHtml(when) + '</time>' +
      ' · ' + escapeHtml(what) +
      (theme ? ' · <span class="event-theme">' + escapeHtml(theme) + '</span>' : '') +
      (totalMin ? ' · ' + escapeHtml(String(totalMin)) + ' min' : '');

    var bodyHtml = '';
    if (moves.length) {
      bodyHtml += '<div class="event-detail-block"><h4>Moves practiced</h4><ul class="event-moves">';
      for (var j = 0; j < moves.length; j++) {
        var m = moves[j] || {};
        var name = m.name_pt || m.name || m.id || 'move';
        var secs = m.duration_seconds || 0;
        var min = secs ? Math.round(secs / 60) : 0;
        bodyHtml += '<li><span class="event-move-name">' + escapeHtml(name) + '</span>' +
                    (min ? ' <span class="event-move-dur">· ' + escapeHtml(String(min)) + ' min</span>' : '') +
                    '</li>';
      }
      bodyHtml += '</ul></div>';
    }
    if (music.length) {
      bodyHtml += '<div class="event-detail-block"><h4>Music played</h4><ul class="event-music">';
      for (var k = 0; k < music.length; k++) {
        var t = music[k];
        var label = (typeof t === 'string') ? t : (t && (t.title || t.id)) || 'track';
        bodyHtml += '<li>' + escapeHtml(label) + '</li>';
      }
      bodyHtml += '</ul></div>';
    }
    if (srcUrl) {
      bodyHtml += '<div class="event-detail-block"><a class="event-source-link" href="' +
                  escapeHtml(srcUrl) + '" target="_blank" rel="noopener noreferrer">View source →</a></div>';
    }

    // No expandable content — render the original flat row.
    if (!bodyHtml) {
      var srcLink = srcUrl ? ' · <a href="' + escapeHtml(srcUrl) +
                              '" target="_blank" rel="noopener noreferrer">source</a>' : '';
      return '<li>' + summaryHtml + srcLink + '</li>';
    }

    return '<li class="event-item">' +
           '<details><summary>' + summaryHtml + '</summary>' +
           '<div class="event-body">' + bodyHtml + '</div>' +
           '</details></li>';
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

    fetchJsonWithFallback('/_cache/index.json', { fresh: true }).then(function (data) {
      if (statusEl) statusEl.textContent = '';
      var all = data.members || [];
      // Multi-program members fix (2026-05-18): filter on the full
      // `programs` array (lineage-engine #12) so a member in N programs
      // appears in all N cohort listings. Fall back to `primary_program`
      // equality if `programs` is missing (old index.json format), so
      // this still works while jsDelivr edges serve a pre-rebuild copy.
      var cohort = all.filter(function (m) {
        if (Array.isArray(m.programs)) return m.programs.indexOf(filterProgram) !== -1;
        return m.primary_program === filterProgram;
      });

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

  // Resolve a URL-fragment identifier to the canonical display slug used
  // for `_cache/cv/<slug>.json` filenames.
  //
  // - Direct slug fragments (anything not starting with `pk-`) pass
  //   through unchanged — preserves the existing behavior for QR scans
  //   and in-site links that already carry the display slug.
  // - `pk-<base64url>` fragments come from the Capoeira practice page
  //   (capoeira/assets/js/practice-event-submit.js), which derives the
  //   slug from the practitioner's local keypair before any DAO display
  //   identity exists. Resolve those by scanning `_cache/index.json`
  //   for a member record where `pk_hash === fragment`, and use that
  //   record's `slug`.
  // - If the pk-hash isn't in the index, return null so the caller can
  //   render a "being generated" placeholder instead of the standard
  //   hard error — the cache rebuilds every 6h, so a fresh practitioner
  //   genuinely is in a "wait briefly" state, not a 404 state.
  function resolveCredentialSlug(rawFragment) {
    if (!rawFragment || rawFragment.indexOf('pk-') !== 0) {
      return Promise.resolve(rawFragment);
    }
    return fetchJsonWithFallback('/_cache/index.json', { fresh: true }).then(function (data) {
      var members = (data && data.members) || [];
      for (var i = 0; i < members.length; i++) {
        if (members[i] && members[i].pk_hash === rawFragment) {
          return members[i].slug || rawFragment;
        }
      }
      return null;
    }).catch(function () {
      // Index fetch failed entirely — last-ditch try the raw fragment.
      // If the cv file also doesn't exist, the existing cv-fetch catch
      // block will surface the standard error.
      return rawFragment;
    });
  }

  function renderCredential(manifest) {
    var rawFragment = (window.location.hash || '').replace(/^#/, '').trim();
    var errEl = document.getElementById('credential-error');
    var bodyEl = document.getElementById('credential-body');
    var statusEl = document.getElementById('credential-status');

    if (!rawFragment) {
      if (statusEl) statusEl.textContent = '';
      if (errEl) {
        errEl.innerHTML = 'No member id in URL. Browse the <a href="../members.html">cohort listing</a> to find a profile.';
        errEl.style.display = 'block';
      }
      return;
    }

    resolveCredentialSlug(rawFragment).then(function (slug) {
      if (slug === null) {
        // pk-hash not yet in the index. Typical case: brand-new
        // practitioner whose first practice event hasn't been picked
        // up by the build_cv_cache cron yet (runs every 6h).
        if (statusEl) statusEl.textContent = '';
        if (errEl) {
          errEl.innerHTML =
            '<strong>Your training record is being generated.</strong> ' +
            'The credential cache rebuilds every 6 hours — please refresh ' +
            'shortly. In the meantime, browse <a href="../members.html">all ' +
            escapeHtml(manifest.display_name) + ' members</a>.';
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
            html += renderEventListItem(events[i]);
          }
          html += '</ul>';
        }
        html += '</section>';
      }

      // Per-program QR + Download credential PDF.
      // Spec: agentic_ai_context/CREDENTIALING_PROGRAM_PAGES.md §15.5 + §15.7.
      // Artifacts emitted by lineage-engine build_cv_cache.py whenever a CV
      // participates in this program AND a logo is vendored at
      // program_assets/<url-slug>/logo.png.
      // URL slug for the artifact filename comes from the manifest itself
      // (which lives at programs/<url-slug>/manifest.json and carries
      // program_slug = <url-slug>), NOT from the data-side primary_program
      // (which can be a legacy / longer slug like 'capoeira-tribo-mirim').
      var artifactSlug = manifest.program_slug || programFilter;
      var qrFilename = slug + '__' + artifactSlug + '.qr.png';
      var pdfFilename = slug + '__' + artifactSlug + '.pdf';
      var qrPrimary = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-credentials@main/_cache/cv/' + encodeURIComponent(qrFilename);
      var qrFallback = 'https://raw.githubusercontent.com/TrueSightDAO/lineage-credentials/main/_cache/cv/' + encodeURIComponent(qrFilename);
      var pdfPrimary = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-credentials@main/_cache/cv/' + encodeURIComponent(pdfFilename);
      // Canonical fallback for the QR if the program-scoped artifact 404s
      // (e.g., logo not yet vendored, or build hasn't run since this CV
      // joined the program). Spec §15.5 graceful-fallback rule — the
      // canonical QR encodes the canonical URL not the program-scoped
      // one, but at least the page still shows something scannable.
      var qrCanonicalFallback = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-credentials@main/_cache/cv/' + encodeURIComponent(slug) + '.qr.png';

      // Partner-branded certificate PDF (Phase 3b). When the manifest
      // declares `certificate.available: true`, surface a second download
      // button pointing at `_cache/cv/<slug>__<program>__cert.pdf`. The
      // certificate is the printable, partner-branded artifact (overlaid
      // on the partner's PDF template); the credential PDF above is the
      // raw practice-log render. Both embed the same per-program QR.
      // Spec: agentic_ai_context/CREDENTIALING_PROGRAM_PAGES.md §17.7.
      var hasCert = !!(manifest.certificate && manifest.certificate.available);
      var certLabel = (manifest.certificate && manifest.certificate.label) || 'Download certificate';
      var certFilename = slug + '__' + artifactSlug + '__cert.pdf';
      var certPrimary = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-credentials@main/_cache/cv/' + encodeURIComponent(certFilename);

      html += '<section class="credential-qr">';
      html += '<h3>Scan this credential</h3>';
      html += '<img class="credential-qr-img" src="' + qrPrimary + '" alt="QR code linking to this credential" ' +
              'onerror="if (this.dataset.tried === \'fallback\') { if (this.dataset.tried === \'canonical\') { this.style.display=\'none\'; } else { this.dataset.tried=\'canonical\'; this.src=\'' + qrCanonicalFallback + '\'; } } else { this.dataset.tried=\'fallback\'; this.src=\'' + qrFallback + '\'; }" />';
      html += '<p class="credential-qr-hint">Or open the link: <code>https://truesight.me/programs/' + escapeHtml(artifactSlug) + '/credentials/#' + escapeHtml(slug) + '</code></p>';
      html += '<div class="credential-downloads">';
      if (hasCert) {
        html += '<a class="btn-link" href="' + certPrimary + '" target="_blank" rel="noopener noreferrer">⬇ ' + escapeHtml(certLabel) + '</a>';
      }
      html += '<a class="btn-link' + (hasCert ? ' secondary' : '') + '" href="' + pdfPrimary + '" target="_blank" rel="noopener noreferrer">⬇ Download credential PDF</a>';
      html += '</div>';
      html += '</section>';

      html += '<footer class="credential-footer">';
      html += '<a class="btn-link" href="../../../credentials/#' + encodeURIComponent(slug) + '">View full credential profile →</a>';
      html += '<a class="btn-link secondary" href="../members.html">All ' + escapeHtml(manifest.display_name) + ' cohort →</a>';
      html += '</footer>';

      if (bodyEl) bodyEl.innerHTML = html;

      // 🌳 Tree link — if a serialized tree QR exists for this member (the
      // attestation→tree-planting binding: qr_code == pk_hash), surface a link
      // to its public QR page. Program-agnostic: only shows when a tree manifest
      // exists in lineage-assets. See agentic_ai_context/PROGRAM_PARTNER_ONBOARDING.md §B.6.
      var pkHash = (cv && cv.pk_hash) || (rawFragment.indexOf('pk-') === 0 ? rawFragment : '');
      if (pkHash && bodyEl) {
        var treePrimary = 'https://cdn.jsdelivr.net/gh/TrueSightDAO/lineage-assets@main/qrs/' + encodeURIComponent(pkHash) + '.json';
        var treeFallback = 'https://raw.githubusercontent.com/TrueSightDAO/lineage-assets/main/qrs/' + encodeURIComponent(pkHash) + '.json';
        fetch(treePrimary, { cache: 'default' })
          .then(function (r) { return r.ok ? r.json() : fetch(treeFallback).then(function (r2) { return r2.ok ? r2.json() : null; }); })
          .then(function (tree) {
            if (!tree || tree.asset_type !== 'tree') return;
            var qrUrl = 'https://truesight.me/qr/?id=' + encodeURIComponent(pkHash);
            var sec = document.createElement('section');
            sec.className = 'credential-section credential-tree';
            sec.innerHTML = '<h2>🌳 A tree was planted for this credential</h2>' +
              '<p>A cacao tree was issued in honour of this credential.</p>' +
              '<p><a class="btn-link" href="' + qrUrl + '">View the tree &amp; its provenance →</a></p>';
            var header = bodyEl.querySelector('.credential-header');
            if (header && header.nextSibling) bodyEl.insertBefore(sec, header.nextSibling);
            else bodyEl.appendChild(sec);
          })
          .catch(function () { /* no tree / fetch failed — silently skip */ });
      }
      }).catch(function (err) {
        if (statusEl) statusEl.textContent = '';
        if (errEl) {
          errEl.innerHTML = 'Could not load this credential. The id <code>' + escapeHtml(slug) + '</code> may not exist yet. Browse <a href="../members.html">all ' + escapeHtml(manifest.display_name) + ' members</a>.';
          errEl.style.display = 'block';
        }
      });
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
          if (descEl && manifest.description_md) descEl.innerHTML = renderInlineMarkdown(manifest.description_md);
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
          // Hero logo — manifest co_brand.partner_logo_url. Hidden by default
          // in the HTML; revealed only when the image actually loads, so a
          // drifted URL gracefully degrades to no logo rather than a broken
          // image icon.
          var heroLogo = document.getElementById('program-hero-logo');
          var heroLogoUrl = manifest.co_brand && manifest.co_brand.partner_logo_url;
          if (heroLogo && heroLogoUrl) {
            heroLogo.alt = (manifest.partner_organization || manifest.display_name || '') + ' logo';
            heroLogo.onerror = function () { heroLogo.style.display = 'none'; };
            heroLogo.onload = function () { heroLogo.style.display = 'block'; };
            heroLogo.src = heroLogoUrl;
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
