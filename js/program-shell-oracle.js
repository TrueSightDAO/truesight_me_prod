/**
 * program-shell-oracle.js — oracle-consultation payload renderer
 *
 * Extends TrueSightProgramShell to render oracle-specific payload fields
 * (hexagrams, advisory_summary, qmdj_card, mood) inside the expandable
 * <details> block on credential pages.
 *
 * Load this AFTER program-shell.js on truesight-grounding credential pages.
 */
(function () {
  'use strict';

  window.TrueSightOraclePayload = {
    /**
     * Render oracle-specific payload blocks for a practice event.
     * Returns HTML string to append inside the event-body <div>.
     */
    renderPayloadBlocks: function (payload) {
      if (!payload) return '';

      var html = '';
      var hexagrams = payload.hexagrams || [];
      var advisory = payload.advisory_summary || '';
      var qmdj = payload.qmdj_card || '';
      var mood = payload.mood || '';

      // Hexagrams
      if (hexagrams.length) {
        html += '<div class="event-detail-block"><h4>I Ching</h4>';
        for (var i = 0; i < hexagrams.length; i++) {
          var h = hexagrams[i];
          html += '<p style="margin:0.25rem 0"><strong>#' + escapeHtml(String(h.number)) + ' \u2014 ' + escapeHtml(h.name) + '</strong></p>';
          if (h.changing_lines && h.changing_lines.length) {
            html += '<p style="margin:0.15rem 0 0 0.5rem;font-size:0.85rem;color:var(--muted,#666)">Changing lines: ' +
                    h.changing_lines.map(function (ln) { return escapeHtml(String(ln)); }).join(', ') + '</p>';
          }
          if (h.relates_to) {
            html += '<p style="margin:0.15rem 0 0 0.5rem;font-size:0.85rem;color:var(--muted,#666)">Relates to: #' +
                    escapeHtml(String(h.relates_to)) +
                    (h.relates_to_name ? ' \u2014 ' + escapeHtml(h.relates_to_name) : '') + '</p>';
          }
        }
        html += '</div>';
      }

      // QMDJ card
      if (qmdj) {
        html += '<div class="event-detail-block"><h4>QiMen Dunjia</h4>';
        html += '<p style="margin:0.25rem 0">' + escapeHtml(qmdj) + '</p></div>';
      }

      // Advisory
      if (advisory) {
        html += '<div class="event-detail-block"><h4>Advisory</h4>';
        html += '<blockquote style="margin:0.25rem 0;padding:0.5rem;background:var(--surface,#f9f4ee);border-left:3px solid #6a4a1a;border-radius:4px;font-style:italic;font-size:0.9rem">' +
                escapeHtml(advisory) + '</blockquote></div>';
      }

      // Mood
      if (mood) {
        html += '<div class="event-detail-block"><span class="event-theme" style="background:#f5e7c8;color:#6a4a1a;padding:0.05rem 0.45rem;border-radius:999px;font-size:0.78rem;font-weight:600">' +
                escapeHtml(mood) + '</span></div>';
      }

      return html;
    }
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
