// ============================================
// NG ZHI YAO — script.js
// Save strategy: persist full innerHTML of
// each [data-section] container so dynamically
// added rows survive page reload.
// ============================================

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const EDIT_PASSWORD = "ngzy2025";

let editMode = false;
let db = null;

// ── Page ID ──
function getPageId() {
  return window.location.pathname.split('/').pop().replace('.html','') || 'index';
}

// ── Collect all saveable data ──
// Saves both [data-key] fields AND [data-section] full HTML blocks
function collectData() {
  const data = { _keys: {}, _sections: {} };

  // Individual editable fields
  document.querySelectorAll('[data-key]').forEach(el => {
    data._keys[el.dataset.key] = el.innerHTML;
  });

  // Full section containers — strip contenteditable before saving
  // so restored HTML never has edit-mode attributes baked in
  document.querySelectorAll('[data-section]').forEach(el => {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
    data._sections[el.dataset.section] = clone.innerHTML;
  });

  return data;
}

// ── Restore data into page ──
function applyData(data) {
  if (!data) return;

  // Restore full sections first (they contain the data-key elements)
  if (data._sections) {
    Object.entries(data._sections).forEach(([section, html]) => {
      const el = document.querySelector(`[data-section="${section}"]`);
      if (el) el.innerHTML = html;
    });
  }

  // Then restore individual keys (handles pages without data-section)
  if (data._keys) {
    Object.entries(data._keys).forEach(([key, value]) => {
      const el = document.querySelector(`[data-key="${key}"]`);
      if (el) el.innerHTML = value;
    });
  }
}

// ── localStorage ──
function saveToLocalStorage() {
  const pageId = getPageId();
  try {
    localStorage.setItem(`nzy4_${pageId}`, JSON.stringify(collectData()));
    showToast('Saved ✓');
  } catch(e) {
    showToast('Save failed', true);
  }
}

function loadFromLocalStorage() {
  const pageId = getPageId();
  try {
    const raw = localStorage.getItem(`nzy4_${pageId}`);
    if (raw) applyData(JSON.parse(raw));
  } catch(e) {}
}

// ── Firebase ──
function initFirebase() {
  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey === 'YOUR_API_KEY') {
    loadFromLocalStorage();
    return;
  }
  try {
    if (typeof firebase === 'undefined') { loadFromLocalStorage(); return; }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    loadFromDB();
  } catch(e) {
    console.warn('Firebase error:', e.message);
    loadFromLocalStorage();
  }
}

async function loadFromDB() {
  if (!db) { loadFromLocalStorage(); return; }
  try {
    const snap = await db.ref(`pages/${getPageId()}`).get();
    if (snap.exists()) applyData(snap.val());
    else loadFromLocalStorage();
  } catch(e) { loadFromLocalStorage(); }
}

async function saveToDB() {
  const data = collectData();
  if (!db) { saveToLocalStorage(); return; }
  try {
    await db.ref(`pages/${getPageId()}`).set(data);
    showToast('Saved ✓');
  } catch(e) {
    saveToLocalStorage();
  }
}

// ── Master save ──
function save() {
  db ? saveToDB() : saveToLocalStorage();
}

// ── Edit mode ──
function enableEditMode() {
  editMode = true;
  document.body.classList.add('edit-active');
  document.querySelectorAll('[data-key]').forEach(el => {
    el.setAttribute('contenteditable', 'true');
  });
  const tb = document.getElementById('edit-toolbar');
  if (tb) tb.classList.add('visible');
  const btn = document.getElementById('nav-edit-btn');
  if (btn) { btn.textContent = 'Editing…'; btn.style.color = '#1e3a5f'; btn.style.borderColor = '#1e3a5f'; }
  showToast('Edit mode on — click any text to edit');
}

function disableEditMode() {
  editMode = false;
  document.body.classList.remove('edit-active');
  document.querySelectorAll('[data-key]').forEach(el => {
    el.removeAttribute('contenteditable');
  });
  const tb = document.getElementById('edit-toolbar');
  if (tb) tb.classList.remove('visible');
  const btn = document.getElementById('nav-edit-btn');
  if (btn) { btn.textContent = 'Edit'; btn.style.color = ''; btn.style.borderColor = ''; }
}

// ── Toast ──
function showToast(msg, isError = false) {
  document.getElementById('nzy-toast')?.remove();
  const t = document.createElement('div');
  t.id = 'nzy-toast';
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'5rem', left:'50%', transform:'translateX(-50%)',
    background: isError ? '#991b1b' : '#111827', color:'#fff',
    padding:'0.4rem 1rem', borderRadius:'4px', fontSize:'13px',
    fontWeight:'500', zIndex:'9999', whiteSpace:'nowrap',
    boxShadow:'0 4px 16px rgba(0,0,0,0.2)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Auth modal ──
function openAuthModal() {
  document.getElementById('auth-modal')?.classList.add('open');
  setTimeout(() => document.getElementById('password-input')?.focus(), 100);
}
function closeAuthModal() {
  document.getElementById('auth-modal')?.classList.remove('open');
  const inp = document.getElementById('password-input');
  if (inp) inp.value = '';
  const err = document.getElementById('modal-error');
  if (err) err.style.display = 'none';
}
function submitPassword() {
  const inp = document.getElementById('password-input');
  const err = document.getElementById('modal-error');
  if (inp?.value === EDIT_PASSWORD) {
    closeAuthModal();
    enableEditMode();
  } else {
    if (err) err.style.display = 'block';
    if (inp) { inp.value = ''; inp.focus(); }
  }
}

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  // Active nav link
  const cur = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === cur || (cur === '' && a.getAttribute('href') === 'index.html'))
      a.classList.add('active');
  });

  // Edit button
  document.getElementById('nav-edit-btn')?.addEventListener('click', () => {
    editMode ? disableEditMode() : openAuthModal();
  });

  // Password input keyboard
  document.getElementById('password-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPassword();
    if (e.key === 'Escape') closeAuthModal();
  });

  // Toolbar
  document.getElementById('tb-save')?.addEventListener('click', save);
  document.getElementById('tb-cancel')?.addEventListener('click', () => {
    disableEditMode();
    loadFromLocalStorage();
  });

  // Load saved content
  loadFromLocalStorage();
  initFirebase();
});
