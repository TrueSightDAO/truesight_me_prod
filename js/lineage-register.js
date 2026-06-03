/**
 * lineage-register.js — self-serve "register your program with Lineage".
 *
 * Mirrors the capoeira practice flow (capoeira/assets/js/practice-event-submit.js):
 * the visitor never creates a key pair by hand. On submit we:
 *
 *   1. ensureKeypair()  — generate an anonymous RSA keypair in localStorage if absent
 *                         (reuses the same `publicKey`/`privateKey` keys the dapp uses,
 *                          so a returning visitor keeps one identity).
 *   2. fire [EMAIL REGISTERED EVENT]      — signed; registers the visitor's email +
 *                         public key with Edgar (triggers a verification email whose
 *                         return link comes back to THIS page, see below).
 *   3. fire [PROGRAM REGISTRATION REQUEST]— signed; the reviewable request a governor
 *                         approves before anything is provisioned.
 *
 * Both events are signed with the SAME identity (RSASSA-PKCS1-v1_5 / SHA-256) and
 * POSTed as multipart `text` to Edgar /dao/submit_contribution (CORS is open).
 *
 * Cross-origin note: the verification email's return link is derived server-side from
 * the "This submission was generated using <URL>" line in the payload
 * (dao_protocol email_registration.py::_generation_source_url). We set that to THIS
 * page, so the `?vk=&em=` link lands back here where the private key actually lives —
 * no dapp.truesight.me localStorage trap. handleVerificationReturn() closes the loop.
 *
 * Wire formats verified against:
 *   dapp/create_signature.html, dapp/scripts/edgar_payload_helper.js,
 *   dao_client/truesight_dao_client/modules/report_program_registration.py
 */
(function () {
  'use strict';

  const EDGAR_SUBMIT_URL = 'https://edgar.truesight.me/dao/submit_contribution';
  const VERIFY_URL = 'https://dapp.truesight.me/verify_request.html';
  const TRUESIGHT_BASE = 'https://truesight.me';

  // Same localStorage keys as the dapp + capoeira flow → one identity per browser.
  const LS_PUBLIC_KEY = 'publicKey';
  const LS_PRIVATE_KEY = 'privateKey';

  // ---- low-level helpers (mirror the dapp / capoeira implementations) ----

  function base64ToArrayBuffer(b64) {
    const bin = window.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function arrayBufferToBase64(buf) {
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }

  function base64ToBase64Url(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // slug = "pk-" + base64url( SHA-256(decoded public-key bytes) ).slice(0,12)
  async function publicKeyToSlug(publicKeyBase64) {
    const keyBytes = base64ToArrayBuffer(publicKeyBase64);
    const hashBuf = await window.crypto.subtle.digest('SHA-256', keyBytes);
    return 'pk-' + base64ToBase64Url(arrayBufferToBase64(hashBuf)).slice(0, 12);
  }

  // ---- keypair management ----

  async function generateKeypair() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify']
    );
    const publicKey = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const privateKey = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const publicKeyBase64 = arrayBufferToBase64(publicKey);
    const privateKeyBase64 = arrayBufferToBase64(privateKey);
    localStorage.setItem(LS_PUBLIC_KEY, publicKeyBase64);
    localStorage.setItem(LS_PRIVATE_KEY, privateKeyBase64);
    return publicKeyBase64;
  }

  async function ensureKeypair() {
    const pub = localStorage.getItem(LS_PUBLIC_KEY);
    const priv = localStorage.getItem(LS_PRIVATE_KEY);
    if (pub && priv) return pub;
    return await generateKeypair();
  }

  function getStoredPublicKey() { return localStorage.getItem(LS_PUBLIC_KEY) || null; }
  function getStoredPrivateKey() { return localStorage.getItem(LS_PRIVATE_KEY) || null; }

  // ---- signing + submit ----

  async function signText(requestText) {
    const privateKeyB64 = localStorage.getItem(LS_PRIVATE_KEY);
    if (!privateKeyB64) throw new Error('No private key in localStorage');
    const key = await window.crypto.subtle.importKey(
      'pkcs8', base64ToArrayBuffer(privateKeyB64),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await window.crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(requestText));
    return arrayBufferToBase64(sig);
  }

  // Build the canonical "[EVENT]\n- Label: Value\n...\n--------" body (dapp format).
  function buildPayload(eventName, fields) {
    const lines = fields.map(([label, rawValue]) => {
      let value = (rawValue === undefined || rawValue === null || rawValue === '') ? 'N/A' : String(rawValue);
      if (value.includes('\n')) value = value.replace(/\r?\n/g, '\n  ');
      return '- ' + label + ': ' + value;
    });
    return '[' + eventName.trim() + ']\n' + lines.join('\n') + '\n--------';
  }

  // Sign + POST one event. `sourceUrl` becomes the "generated using" line, which the
  // backend uses as the email-verification return URL — keep it pointing at this page.
  async function submitEvent(eventName, fields, sourceUrl) {
    const publicKey = await ensureKeypair();
    const payload = buildPayload(eventName, fields);
    const requestHash = await signText(payload);
    const shareText = payload
      + '\n\nMy Digital Signature: ' + publicKey
      + '\n\nRequest Transaction ID: ' + requestHash
      + '\n\nThis submission was generated using ' + sourceUrl
      + '\n\nVerify submission here: ' + VERIFY_URL;

    const formData = new FormData();
    formData.append('text', shareText);
    const resp = await fetch(EDGAR_SUBMIT_URL, { method: 'POST', body: formData });
    const raw = await resp.text().catch(() => '');
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = {}; }
    if (!resp.ok && resp.status !== 409) {
      const base = (data && data.error) || raw || ('HTTP ' + resp.status);
      throw new Error(String(base).slice(0, 300));
    }
    return { ok: true, shareText, data, status: resp.status };
  }

  // ---- public API ----

  /**
   * Submit a program-registration request. Fires the email-registration event first
   * (creates/links the identity + sends the verify email), then the program request.
   *
   * @param {object} form  — { email, displayName, slug, description, contactName,
   *                           logoUrl, website, org, capabilities[], rosterUrl,
   *                           proposedPrice }
   * @returns {Promise<{ok, slug, publicKey, privateKey, cvUrl, payloads, emailResult}>}
   */
  async function registerProgram(form) {
    const sourceUrl = window.location.href.split('#')[0].split('?')[0];
    const publicKey = await ensureKeypair();
    const PENDING = '(pending governor assignment)';

    // 1) Email / identity registration (signed) — triggers the verify email back here.
    const emailEvt = await submitEvent('EMAIL REGISTERED EVENT', [
      ['Email', form.email],
    ], sourceUrl);

    // 2) Program registration request (signed) — the governor's reviewable record.
    //    Canonical labels + order must match report_program_registration.py.
    const contact = [form.contactName, form.email].filter(Boolean).join(' · ');
    const description = (contact ? ('Submitted by ' + contact + '.\n') : '') + (form.description || '');
    const capabilities = (form.capabilities || []).join(', ');

    const programEvt = await submitEvent('PROGRAM REGISTRATION REQUEST', [
      ['Program Slug', form.slug || PENDING],
      ['Display Name', form.displayName],
      ['Description', description],
      ['Logo URL', form.logoUrl || ''],
      ['Website', form.website || ''],
      ['Partner Organization', form.org || form.displayName],
      ['Capabilities', capabilities],
      ['Roster Sheet URL', form.rosterUrl || ''],
      ['Admin Subdomain', PENDING],
      ['Currency', PENDING],
      ['Ledger Codename', PENDING],
      ['Price', form.proposedPrice || PENDING],
      ['Origin Identity', publicKey],
      ['Submission Source', sourceUrl],
    ], sourceUrl);

    const slug = await publicKeyToSlug(publicKey);
    return {
      ok: true,
      slug,
      publicKey,
      privateKey: getStoredPrivateKey(),
      cvUrl: TRUESIGHT_BASE + '/credentials/#' + slug,
      emailResult: emailEvt.data,
      payloads: { email: emailEvt.shareText, program: programEvt.shareText },
    };
  }

  /**
   * If the page was opened from an email-verification link (?vk=&em=), sign + submit
   * the [EMAIL VERIFICATION EVENT] with the same-origin local key. Returns null if the
   * params are absent, otherwise { ok, activated, data, error }.
   */
  async function handleVerificationReturn() {
    const params = new URLSearchParams(window.location.search);
    const vk = params.get('vk');
    const em = params.get('em');
    if (!vk || !em) return null;
    if (!getStoredPrivateKey()) {
      return { ok: false, error: 'No identity found in this browser. Open the verification link in the same browser you registered from.' };
    }
    const sourceUrl = window.location.href.split('#')[0].split('?')[0];
    try {
      const res = await submitEvent('EMAIL VERIFICATION EVENT', [
        ['Email', em],
        ['Verification Key', vk],
      ], sourceUrl);
      const activated = !!(res.data && (res.data.activated || (res.data.email_registration && res.data.email_registration.activated)));
      return { ok: true, activated, data: res.data };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  window.LineageRegister = {
    ensureKeypair,
    getStoredPublicKey,
    getStoredPrivateKey,
    publicKeyToSlug,
    registerProgram,
    handleVerificationReturn,
  };
})();
