// ============================================
// NG ZHI YAO — script.js
// ============================================

// ── Page ID ──
function getPageId() {
  return window.location.pathname.split('/').pop().replace('.html','') || 'index';
}

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  // Active nav link
  const cur = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === cur || (cur === '' && a.getAttribute('href') === 'index.html'))
      a.classList.add('active');
  });
});
