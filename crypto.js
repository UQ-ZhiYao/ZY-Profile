// ============================================
// ZY-Profile — content encryption (shared by member site and admin console)
//
// data/site.enc.json  — member content, AES-256-GCM encrypted with a random key.
//                       That key is "wrapped" once per member using a key derived
//                       from the member's password (PBKDF2-SHA256). Only someone
//                       with a valid username + password can unwrap it.
// data/admin.enc.json — the admin's full working copy (all pages incl. hidden drafts,
//                       member list), encrypted with the admin password.
// Everything runs in the browser with the built-in Web Crypto API.
// ============================================
(function () {
  "use strict";
  const enc = new TextEncoder(), dec = new TextDecoder();
  const subtle = (window.crypto && window.crypto.subtle) || null;
  const MEMBER_ITER = 310000, ADMIN_ITER = 600000;

  function b64(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  }
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function derive(password, salt, iterations) {
    const base = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256));
  }
  async function seal(rawKey, bytes) {
    const iv = rand(12);
    const k = await subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
    return { iv: b64(iv), ct: b64(await subtle.encrypt({ name: "AES-GCM", iv }, k, bytes)) };
  }
  async function open(rawKey, box) {
    const k = await subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, k, unb64(box.ct)));
  }
  const badLogin = () => Object.assign(new Error("Username or password is incorrect."), { code: "bad-login" });

  // Usernames are never stored in the public file — only a one-way hash.
  async function userId(username) {
    const h = await subtle.digest("SHA-256", enc.encode("zy-profile:" + String(username).trim().toLowerCase()));
    return b64(h).slice(0, 22);
  }

  // ── members ──
  async function makeCredential(username, password) {
    const salt = rand(16);
    const kek = await derive(password, salt, MEMBER_ITER);
    return { id: await userId(username), salt: b64(salt), iter: MEMBER_ITER, kek: b64(kek) };
  }

  async function sealSite(content, creds) {
    const key = rand(32);
    const body = await seal(key, enc.encode(JSON.stringify(content)));
    const slots = [];
    for (const c of creds) {
      const w = await seal(unb64(c.kek), key);
      slots.push({ id: c.id, salt: c.salt, iter: c.iter, iv: w.iv, wk: w.ct });
    }
    // shuffle so slot order doesn't reveal who was added when
    for (let i = slots.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    return { v: 1, alg: "AES-256-GCM + PBKDF2-SHA256", updated: new Date().toISOString(), slots, body };
  }

  async function openSiteWithKek(file, id, kekB64) {
    const slot = (file.slots || []).find((s) => s.id === id);
    if (!slot) throw badLogin();
    let key;
    try { key = await open(unb64(kekB64), { iv: slot.iv, ct: slot.wk }); } catch { throw badLogin(); }
    return JSON.parse(dec.decode(await open(key, file.body)));
  }

  async function openSite(file, username, password) {
    const id = await userId(username);
    const slot = (file.slots || []).find((s) => s.id === id);
    // derive anyway when the user is unknown, so timing doesn't reveal valid usernames
    const kek = b64(await derive(password, slot ? unb64(slot.salt) : rand(16), slot ? slot.iter : MEMBER_ITER));
    if (!slot) throw badLogin();
    return { content: await openSiteWithKek(file, id, kek), id, kek };
  }

  // ── admin vault ──
  async function vaultKey(password, saltB64, iter) { return b64(await derive(password, unb64(saltB64), iter)); }
  async function sealVault(obj, keyB64, saltB64, iter) {
    return { v: 1, salt: saltB64, iter, updated: new Date().toISOString(), body: await seal(unb64(keyB64), enc.encode(JSON.stringify(obj))) };
  }
  async function newVault(obj, password) {
    const salt = b64(rand(16));
    const key = await vaultKey(password, salt, ADMIN_ITER);
    return { key, salt, iter: ADMIN_ITER, file: await sealVault(obj, key, salt, ADMIN_ITER) };
  }
  async function openVault(file, password) {
    const key = await vaultKey(password, file.salt, file.iter);
    try { return { key, salt: file.salt, iter: file.iter, obj: JSON.parse(dec.decode(await open(unb64(key), file.body))) }; }
    catch { throw Object.assign(new Error("Admin password is incorrect."), { code: "bad-login" }); }
  }
  async function openVaultWithKey(file, keyB64) { return JSON.parse(dec.decode(await open(unb64(keyB64), file.body))); }

  function randomPassword(len = 12) {
    const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    return [...crypto.getRandomValues(new Uint32Array(len))].map((n) => abc[n % abc.length]).join("");
  }

  window.ZYCrypto = {
    supported: !!subtle, userId, makeCredential, sealSite, openSite, openSiteWithKek,
    newVault, openVault, openVaultWithKey, sealVault, randomPassword, b64, unb64,
  };
})();
