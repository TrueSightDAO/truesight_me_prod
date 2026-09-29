/**
 * Ledger Explorer utilities — isomorphic (browser + Node).
 * Used by ledger_explorer.html and tested in tests/ledger-explorer-utils.test.js
 *
 * A read-only view over TrueSightDAO/verify_public_signatures — the DAO's public,
 * auditable RSA-attestation ledger (one immutable JSON file per signed event).
 * Design contract (plans/TRUESIGHT_LEDGER_EXPLORER_PLAN.md §4):
 *
 *   1. Static, serverless, client-side-fetch. NO Google Apps Script, no backend,
 *      no auth — the page fetches public GitHub JSON only.
 *   2. Search-by-txid is ONE fetch: ledger_index.json (PR1) maps
 *      sha256(request_transaction_id) -> the event. We never fan out across the
 *      ~34 per-event-type folders.
 *   3. Everything below is pure (no DOM, no network) so it is unit-testable in
 *      Node; the page owns fetching + rendering.
 */
(function (global) {
  'use strict';

  // `this` at a CommonJS module top level is module.exports (NOT the real
  // global), so resolve the true global explicitly for TextEncoder/WebCrypto.
  var G =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof window !== 'undefined'
        ? window
        : global;

  var LEDGER_RAW_BASE =
    'https://raw.githubusercontent.com/TrueSightDAO/verify_public_signatures/main/';
  var LEDGER_INDEX_URL = LEDGER_RAW_BASE + 'ledger_index.json';

  // PR4 cross-links (plans/TRUESIGHT_LEDGER_EXPLORER_PLAN.md §5). My Trees
  // (sunmint_beta/cfr-anapu) is the "show me my trees" complement; the explorer
  // is the "show me the receipt". VERIFIED join key: a trees/index.geojson
  // feature's `tree_id` (e.g. Edgar_20260821175134_006) equals the ledger
  // TREE PLANTING event's `telegram_message_id` -- NOT its `linked_tree_id`
  // (a legacy planting label like FOUNDERHAUS_BOUGAINVILLEA_20260821_1, which
  // does not resolve in the public tree feed). So we link on whichever id the
  // event actually carries. 2026-09-29 (Gary): for a tree-typed event we now
  // prefer the event's `request_transaction_id` (the txid / RSA signature) --
  // it equals the feed feature's `request_txid`, so ?tx=<id> resolves, and it
  // is the canonical id a verifier already holds off the ledger. The
  // telegram_message_id / linked_tree_id fallbacks are unchanged.
  var MY_TREES_URL = 'https://cfr.truesight.me/my-trees/';
  var LEDGER_EXPLORER_URL = 'https://truesight.me/ledger/explorer/';

  // PR8 cross-link: the SunMint PROGRAM page for tree-planting events. Its
  // impact map deep-links a specific tree via ?tree=<tree_id> (or ?qr=<qr_code>),
  // which flies to and opens that tree's marker. The join key is VERIFIED:
  // sunmint/trees/index.geojson feature `tree_id` == the ledger TREE PLANTING
  // event's `telegram_message_id` (e.g. Edgar_20260821175134_006) -- the same
  // key PR4 already relies on. We prefer that over linked_tree_id (a legacy
  // planting label that resolves in the registry only as a qr_code).
  var SUNMINT_PROGRAM_URL = 'https://truesight.me/sunmint.html';

  // sha256(request_transaction_id) -> 64 lowercase hex (the canonical mirror
  // filename). See sync_sunmint_signatures.py::_txid_key.
  var TXID_HASH_RE = /^[0-9a-f]{64}$/i;
  // Edgar-named message ids look like Edgar_20260924125541_071.
  var EDGAR_MID_RE = /^Edgar_\d{14}_\d{3}$/;
  var NUMERIC_MID_RE = /^\d+$/;

  function normalizeQuery(q) {
    return String(q == null ? '' : q).trim();
  }

  function isTxidHash(q) {
    return TXID_HASH_RE.test(normalizeQuery(q));
  }

  function isEdgarMessageId(q) {
    return EDGAR_MID_RE.test(normalizeQuery(q));
  }

  function isNumericMessageId(q) {
    return NUMERIC_MID_RE.test(normalizeQuery(q));
  }

  /** Flatten an index's events into an array, honouring events_ordered when present. */
  function indexRows(index) {
    if (!index || typeof index !== 'object') return [];
    var events = index.events;
    if (!events || typeof events !== 'object') return [];
    if (Array.isArray(index.events_ordered)) {
      var out = [];
      for (var i = 0; i < index.events_ordered.length; i++) {
        var r = events[index.events_ordered[i]];
        if (r) out.push(r);
      }
      return out;
    }
    return Object.keys(events).map(function (k) {
      return events[k];
    });
  }

  /** Direct txid_hash -> row lookup (case-insensitive on the hex). */
  function lookupByHash(index, hash) {
    if (!index || !index.events) return null;
    var h = normalizeQuery(hash).toLowerCase();
    if (index.events[h]) return index.events[h];
    // Defensive: keys may carry original case if the generator ever changes.
    var keys = Object.keys(index.events);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === h) return index.events[keys[i]];
    }
    return null;
  }

  /** All rows whose telegram_message_id equals the query (usually 0 or 1). */
  function lookupByMessageId(index, mid) {
    var m = normalizeQuery(mid);
    if (!m) return [];
    return indexRows(index).filter(function (r) {
      return r && String(r.telegram_message_id) === m;
    });
  }

  /**
   * Resolve a user query against the global index.
   *   - 64-hex            -> direct txid_hash lookup
   *   - numeric / Edgar   -> message-id lookup
   *   - anything else      -> treated as a RAW txid: sha256 it, then look up
   *                            (requires opts.hashFn, e.g. WebCrypto in the page)
   * Returns { mode, rows } where mode ∈ {empty, txid_hash, message_id, raw_txid}.
   */
  async function resolveQuery(index, query, opts) {
    opts = opts || {};
    var q = normalizeQuery(query);
    if (!q) return { mode: 'empty', rows: [] };

    if (isTxidHash(q)) {
      var row = lookupByHash(index, q);
      return { mode: 'txid_hash', rows: row ? [row] : [] };
    }

    var byMid = lookupByMessageId(index, q);
    if (byMid.length) return { mode: 'message_id', rows: byMid };

    if (isNumericMessageId(q) || isEdgarMessageId(q)) {
      return { mode: 'message_id', rows: [] };
    }

    if (typeof opts.hashFn !== 'function') {
      return { mode: 'raw_txid', rows: [], error: 'no-hash-fn' };
    }
    var h = await opts.hashFn(q);
    var r = lookupByHash(index, String(h));
    return { mode: 'raw_txid', rows: r ? [r] : [] };
  }

  function toHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) {
      s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    }
    return s;
  }

  function defaultDigest(bytes) {
    var subtle = G.crypto && G.crypto.subtle;
    if (!subtle) throw new Error('WebCrypto SHA-256 is unavailable in this context');
    return subtle.digest('SHA-256', bytes);
  }

  /**
   * sha256(text) -> lowercase hex. `digestImpl` is an injectable
   * (Uint8Array) -> (ArrayBuffer|Uint8Array|Buffer) async function so the same
   * code is testable in Node; the browser default uses WebCrypto.
   */
  async function sha256Hex(text, digestImpl) {
    var enc = new G.TextEncoder();
    var bytes = enc.encode(String(text));
    var digest = digestImpl || defaultDigest;
    var out = await digest(bytes);
    return toHex(new Uint8Array(out));
  }

  /** Pad a base64 string to a multiple of 4 (WebCrypto/atob are strict-ish). */
  function padBase64(b64) {
    var s = String(b64 == null ? '' : b64).replace(/\s+/g, '');
    var r = s.length % 4;
    if (r === 2) s += '==';
    else if (r === 3) s += '=';
    else if (r === 1) r = 1; // malformed; leave as-is for the caller to fail
    return s;
  }

  /** Wrap a bare SPKI base64 body into a PEM public-key block. */
  function pemFromSpkiB64(b64) {
    return (
      '-----BEGIN PUBLIC KEY-----\n' +
      String(b64 == null ? '' : b64).replace(/\s+/g, '') +
      '\n-----END PUBLIC KEY-----\n'
    );
  }

  function escapeHtml(unsafe) {
    return String(unsafe == null ? '' : unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /** Shorten a long hash/url for display, keeping both ends. */
  function shortenHash(h, keep) {
    var s = String(h == null ? '' : h);
    var n = keep || 10;
    if (s.length <= n * 2 + 3) return s;
    return s.slice(0, n) + '…' + s.slice(s.length - n);
  }

  /** The immutable event filename for a row (the canonical mirror, by default). */
  /**
   * The canonical, DURABLE citation URL for an event: the sha256(request_transaction_id)
   * mirror file -- the address the ledger README promises is stable and citable
   * (plans/TRUESIGHT_LEDGER_EXPLORER_PLAN.md Gap 3). Falls back to the message-id
   * URL only when a row somehow lacks the mirror URL. 2026-09-29 (Gary): the explorer
   * cites THIS, never the transport(message)-id URL.
   */
  function canonicalLedgerUrl(row) {
    if (!row) return '';
    return row.canonical_url || row.message_id_url || '';
  }

  function eventFileName(row, preferMessageId) {
    if (!row) return '';
    var url = preferMessageId ? row.message_id_url || row.canonical_url : row.canonical_url || row.message_id_url;
    if (!url) return '';
    return String(url).split('/').pop();
  }

  /**
   * The offline re-verification recipe, verbatim from the ledger README
   * (verify_public_signatures/README.md §"Verify any signature"), parameterised
   * with the event's own URL so a verifier can paste it directly.
   */
  function buildOpensslVerifySnippet(eventUrl) {
    var url = String(eventUrl == null ? '' : eventUrl);
    return (
      '# 1. Fetch the event file\n' +
      'curl -sL ' + url + ' -o event.json\n' +
      '\n' +
      '# 2. Reconstruct the PEM public key + write payload/signature\n' +
      "python3 - <<'EOF'\n" +
      'import json, base64\n' +
      'd = json.load(open("event.json"))\n' +
      'open("pub.pem", "w").write("-----BEGIN PUBLIC KEY-----\\n" + d["public_key"] + "\\n-----END PUBLIC KEY-----\\n")\n' +
      'open("payload.txt", "w").write(d["signed_payload"])\n' +
      'open("sig.bin", "wb").write(base64.b64decode(d["signature"] + "=="))\n' +
      'EOF\n' +
      '\n' +
      '# 3. Verify\n' +
      'openssl dgst -sha256 -verify pub.pem -signature sig.bin payload.txt\n' +
      '# => Verified OK'
    );
  }

  /**
   * The recent-activity feed: the index is ALREADY sorted recent-first
   * (events_ordered is submitted_at desc, built by the generator), so this is
   * a slice, not a sort. `limit` <= 0 or absent means "all".
   */
  function recentActivity(index, limit) {
    var rows = indexRows(index);
    if (limit && limit > 0) return rows.slice(0, limit);
    return rows;
  }

  /** Human label for an event_type_folder: "tree_planting" -> "Tree Planting". */
  function typeLabel(folder) {
    var s = String(folder == null ? '' : folder).replace(/[_-]+/g, ' ').trim();
    if (!s) return '(untyped)';
    return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /**
   * Roll-up of events by event_type_folder: [{key, label, count}] sorted by
   * count desc, then label asc. Purely derived from the rows.
   */
  function typeRollup(index) {
    return rollup(indexRows(index), function (r) {
      return r && r.event_type_folder ? String(r.event_type_folder) : '';
    }, typeLabel);
  }

  /** Roll-up by contributor_name: [{key, label, count}] count desc, label asc. */
  function contributorRollup(index) {
    return rollup(indexRows(index), function (r) {
      var n = r && r.contributor_name ? String(r.contributor_name).trim() : '';
      return n;
    }, function (k) { return k || '(unknown contributor)'; });
  }

  function rollup(rows, keyFn, labelFn) {
    var counts = {};
    for (var i = 0; i < rows.length; i++) {
      var k = keyFn(rows[i]);
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.keys(counts)
      .map(function (k) { return { key: k, label: labelFn(k), count: counts[k] }; })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label);
      });
  }

  /**
   * Filter rows by an optional {event_type, contributor_name} facet. Facets are
   * exact matches on the folder key / contributor name. Missing/empty = no-op.
   */
  function filterRows(index, facets) {
    var rows = indexRows(index);
    var f = facets || {};
    var byType = f.event_type ? String(f.event_type) : '';
    var byWho = f.contributor_name ? String(f.contributor_name).trim() : '';
    if (!byType && !byWho) return rows;
    return rows.filter(function (r) {
      if (!r) return false;
      if (byType && String(r.event_type_folder || '') !== byType) return false;
      if (byWho && String(r.contributor_name || '').trim() !== byWho) return false;
      return true;
    });
  }

  // --- PR4: cross-links to My Trees -------------------------------------

  function isTreeEvent(label) {
    var s = String(label == null ? '' : label).toLowerCase();
    return s.indexOf('tree') >= 0 || s.indexOf('planting') >= 0 || s.indexOf('asset_receipt') >= 0;
  }

  /**
   * The My Trees deep-link target for a ledger event, or null.
   *
   * 2026-09-29 (Gary): for a tree-typed event, prefer the event's
   * `request_transaction_id` (the txid / RSA signature) over the Edgar-internal
   * `telegram_message_id`. Verified live: a TREE PLANTING event's
   * `request_transaction_id` equals the public tree feed feature's
   * `request_txid` (and the event's own `signature`), and My Trees' keyless
   * public view matches on exactly that value via ?tx=<id>. The message-id /
   * linked_tree_id fallbacks below are unchanged.
   *
   * Returns { key, id } with key in {'tx','tree'} (id never empty), or null:
   *   tree-typed event:  request_transaction_id -> linked_tree_id -> telegram_message_id
   *   any other event:   linked_tree_id only (unchanged)
   */
  function treeRefForEvent(ev) {
    if (!ev || typeof ev !== 'object') return null;
    var treeEvent = isTreeEvent(ev.event_type) || isTreeEvent(ev.event_type_folder);
    if (treeEvent) {
      var tx = String(ev.request_transaction_id == null ? '' : ev.request_transaction_id).trim();
      if (tx) return { key: 'tx', id: tx };
    }
    var lt = String(ev.linked_tree_id == null ? '' : ev.linked_tree_id).trim();
    if (lt) return { key: 'tree', id: lt };
    if (treeEvent) {
      var mid = String(ev.telegram_message_id == null ? '' : ev.telegram_message_id).trim();
      if (mid) return { key: 'tree', id: mid };
    }
    return null;
  }

  /**
   * Deep-link into My Trees for a ref from treeRefForEvent ('' when none).
   * Accepts the { key, id } ref, or a bare string for backward compatibility
   * (a bare string is treated as a legacy ?tree= id).
   */
  function buildMyTreesLink(ref) {
    var key = 'tree', id;
    if (ref && typeof ref === 'object') {
      key = ref.key === 'tx' ? 'tx' : 'tree';
      id = String(ref.id == null ? '' : ref.id).trim();
    } else {
      id = String(ref == null ? '' : ref).trim();
    }
    if (!id) return '';
    return MY_TREES_URL + '?' + key + '=' + encodeURIComponent(id);
  }

  /** Deep-link into the Ledger Explorer for a txid or message id ('' when none). */
  function buildLedgerExplorerLink(id) {
    var s = String(id == null ? '' : id).trim();
    if (!s) return '';
    return LEDGER_EXPLORER_URL + '?q=' + encodeURIComponent(s);
  }

  // --- PR8: cross-link to the SunMint program (tree-planting events only) ---

  /** True only for an actual planting event -- not link/reject variants. */
  function isTreePlantingEvent(label) {
    var s = String(label == null ? '' : label).toLowerCase();
    return s.indexOf('tree planting event') >= 0 || s === 'tree_planting';
  }

  /**
   * The SunMint impact-map query for a tree-planting event, or null.
   * Prefers the VERIFIED join key (telegram_message_id -> ?tree=), falling back
   * to linked_tree_id -> ?qr=. Returns { key, id } with key in {'tree','qr'}.
   */
  function sunmintTreeQuery(ev) {
    if (!ev || typeof ev !== 'object') return null;
    if (!isTreePlantingEvent(ev.event_type) && !isTreePlantingEvent(ev.event_type_folder)) {
      return null;
    }
    var tid = String(ev.telegram_message_id == null ? '' : ev.telegram_message_id).trim();
    if (tid) return { key: 'tree', id: tid };
    var qr = String(ev.linked_tree_id == null ? '' : ev.linked_tree_id).trim();
    if (qr) return { key: 'qr', id: qr };
    return null;
  }

  /**
   * Deep-link to the specific tree on the SunMint program page ('' when this is
   * not a resolved tree-planting event, so the caller can skip the block).
   */
  function buildSunmintTreeLink(ev) {
    var ref = sunmintTreeQuery(ev);
    if (!ref) return '';
    return SUNMINT_PROGRAM_URL + '?' + ref.key + '=' + encodeURIComponent(ref.id);
  }

  var utils = {
    LEDGER_RAW_BASE: LEDGER_RAW_BASE,
    LEDGER_INDEX_URL: LEDGER_INDEX_URL,
    MY_TREES_URL: MY_TREES_URL,
    LEDGER_EXPLORER_URL: LEDGER_EXPLORER_URL,
    isTreeEvent: isTreeEvent,
    treeRefForEvent: treeRefForEvent,
    buildMyTreesLink: buildMyTreesLink,
    buildLedgerExplorerLink: buildLedgerExplorerLink,
    SUNMINT_PROGRAM_URL: SUNMINT_PROGRAM_URL,
    isTreePlantingEvent: isTreePlantingEvent,
    sunmintTreeQuery: sunmintTreeQuery,
    buildSunmintTreeLink: buildSunmintTreeLink,
    normalizeQuery: normalizeQuery,
    isTxidHash: isTxidHash,
    isEdgarMessageId: isEdgarMessageId,
    isNumericMessageId: isNumericMessageId,
    indexRows: indexRows,
    recentActivity: recentActivity,
    typeRollup: typeRollup,
    contributorRollup: contributorRollup,
    filterRows: filterRows,
    typeLabel: typeLabel,
    lookupByHash: lookupByHash,
    lookupByMessageId: lookupByMessageId,
    resolveQuery: resolveQuery,
    toHex: toHex,
    sha256Hex: sha256Hex,
    padBase64: padBase64,
    pemFromSpkiB64: pemFromSpkiB64,
    escapeHtml: escapeHtml,
    shortenHash: shortenHash,
    eventFileName: eventFileName,
    canonicalLedgerUrl: canonicalLedgerUrl,
    buildOpensslVerifySnippet: buildOpensslVerifySnippet
  };

  global.LedgerExplorerUtils = utils;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = utils;
  }
})(typeof window !== 'undefined' ? window : this);
