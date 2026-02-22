/* admin.js — Pannello Admin Danilo Littarru (BROWSER) */
'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.method && opts.method !== 'GET') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers,
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore di rete.');
  return data;
}

async function apiFormData(path, formData, method = 'POST') {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    body: formData,
    headers: { 'X-CSRF-Token': getCsrfToken() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore di rete.');
  return data;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function showStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `form-status ${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 5000);
}

let quillEditor = null;
let editingPostId = null;
let commentsFilter = 'pending';
let allCommentsData = [];

function initLogin() {
  const form = $('#login-form'), status = $('#login-status'), btn = $('#login-btn');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true; btn.textContent = 'Accesso in corso…';
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#login-email').value, password: $('#login-password').value }) });
      showAdminApp();
    } catch (err) { showStatus(status, err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Accedi'; }
  });
}

async function checkAuth() {
  try { const user = await api('/auth/me'); showAdminApp(user); }
  catch (_) { showLoginScreen(); }
}
function showLoginScreen() { $('#login-screen').classList.remove('hidden'); $('#admin-app').classList.add('hidden'); }
function showAdminApp(user) {
  $('#login-screen').classList.add('hidden'); $('#admin-app').classList.remove('hidden');
  if (user) $('#admin-user-label').textContent = user.email;
  loadDashboard();
}
function initLogout() {
  $('#logout-btn')?.addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) { }
    showLoginScreen();
  });
}

function switchView(viewName) {
  $$('.admin-view').forEach(v => v.classList.remove('active'));
  $$('.sidebar-link').forEach(l => l.classList.remove('active'));
  const viewEl = $(`#view-${viewName}`);
  if (viewEl) viewEl.classList.add('active');
  const navBtn = $(`.sidebar-link[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');
  const titles = { dashboard: 'Dashboard', posts: 'Articoli', 'new-post': 'Nuovo articolo', comments: 'Commenti', contacts: 'Messaggi', logs: 'Log attività' };
  const title = $('#admin-view-title');
  if (title) title.textContent = titles[viewName] || 'Admin';
  if (viewName === 'dashboard') loadDashboard();
  else if (viewName === 'posts') loadAllPosts();
  else if (viewName === 'new-post') initNewPost();
  else if (viewName === 'comments') loadComments();
  else if (viewName === 'contacts') loadContacts();
  else if (viewName === 'logs') loadLogs();
}
function initNavigation() {
  $$('.sidebar-link[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
}

async function loadDashboard() {
  try {
    const data = await api('/admin/stats');
    renderStatsCards(data); renderTopPosts(data.top_posts || []); renderRecentLogs(data.recent_logs || []);
  } catch (err) { console.error('Dashboard load error:', err); }
}
function renderStatsCards(data) {
  const grid = $('#stats-grid'); if (!grid) return;
  const stats = [
    { label: 'Visite totali', value: (data.site_visits_total || 0).toLocaleString('it-IT'), sub: 'al sito' },
    { label: 'Articoli', value: data.posts_published || 0, sub: `${data.posts_draft || 0} in bozza` },
    { label: 'Like', value: data.total_likes || 0, sub: 'su tutti gli articoli' },
    { label: 'In attesa', value: data.comments_pending || 0, sub: 'commenti da approvare' },
  ];
  grid.innerHTML = stats.map(s => `<div class="stat-card"><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div><div class="stat-sub">${s.sub}</div></div>`).join('');
}
function renderTopPosts(posts) {
  const tbody = $('#top-posts-table tbody'); if (!tbody) return;
  if (!posts.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--c-muted);padding:1.5rem">Nessun articolo</td></tr>'; return; }
  tbody.innerHTML = posts.map(p => `<tr><td class="post-title-cell">${escapeHtml(p.title)}</td><td>${p.visits}</td><td>${p.likes}</td><td>${p.comments}</td></tr>`).join('');
  if (!$('#top-posts-table thead')) {
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Titolo</th><th>Visite</th><th>Like</th><th>Commenti</th></tr>';
    $('#top-posts-table').prepend(thead);
  }
}
function renderRecentLogs(logs) {
  const container = $('#recent-logs-list'); if (!container) return;
  if (!logs.length) { container.innerHTML = '<p style="padding:1rem;color:var(--c-muted);font-size:0.85rem">Nessun log.</p>'; return; }
  container.innerHTML = logs.slice(0, 10).map(l => `<div class="log-item"><span class="log-action">${l.action}</span><span class="log-detail">${l.user_email || '—'}</span><span class="log-date">${formatDateTime(l.created_at)}</span></div>`).join('');
}

async function loadAllPosts() {
  const tbody = $('#all-posts-tbody'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--c-muted)">Caricamento…</td></tr>';
  try {
    const { posts } = await api('/admin/posts');
    if (!posts.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--c-muted)">Nessun articolo</td></tr>'; return; }
    tbody.innerHTML = posts.map(p => `
      <tr>
        <td class="post-title-cell">${escapeHtml(p.title)}</td>
        <td><span class="badge">${p.type}</span></td>
        <td><span class="badge ${p.status === 'published' ? 'badge-published' : 'badge-draft'}">${p.status === 'published' ? 'Pubblicato' : 'Bozza'}</span></td>
        <td>${(p.visits || 0).toLocaleString('it-IT')}</td>
        <td>${p.likes || 0}</td>
        <td>${p.comments || 0}${p.pending_comments ? ` <span class="badge badge-pending">${p.pending_comments}</span>` : ''}</td>
        <td><div class="action-btns">
          <button class="btn btn-sm btn-ghost" onclick="editPost(${p.id})">Modifica</button>
          <button class="btn btn-sm btn-danger" onclick="deletePost(${p.id},'${escapeAttr(p.title)}')">Elimina</button>
        </div></td>
      </tr>`).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="7" style="color:var(--c-error);padding:1rem">${err.message}</td></tr>`; }
}

function initNewPost() {
  editingPostId = null;
  $('#post-editor-title').textContent = 'Nuovo articolo';
  $('#post-editor-form').reset();
  $('#edit-post-id').value = '';
  $('#cover-preview').innerHTML = '';
  if (quillEditor) { quillEditor.setContents([]); } else { initQuill(); }
  initCoverPreview();
  $('#post-editor-status').classList.add('hidden');
}

async function editPost(postId) {
  switchView('new-post'); editingPostId = postId;
  $('#post-editor-title').textContent = 'Modifica articolo';
  $('#edit-post-id').value = postId;
  try {
    const posts = (await api('/admin/posts')).posts;
    const post = posts.find(p => p.id === postId); if (!post) return;
    const { post: fullPost } = await api(`/posts/${post.slug}`);
    $('#pe-title').value = fullPost.title || '';
    $('#pe-type').value = fullPost.type || 'articolo';
    $('#pe-status').value = fullPost.status || 'draft';
    $('#pe-excerpt').value = fullPost.excerpt || '';
    if (fullPost.cover_image) $('#cover-preview').innerHTML = `<img src="${fullPost.cover_image}" alt="Copertina" />`;
    if (!quillEditor) initQuill();
    quillEditor.clipboard.dangerouslyPasteHTML(fullPost.content || '');
  } catch (err) { showStatus($('#post-editor-status'), err.message, 'error'); }
}

function initQuill() {
  if (quillEditor) return;
  quillEditor = new Quill('#quill-editor', {
    theme: 'snow',
    modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['blockquote', 'code-block'], ['link', 'image'], ['clean']] }
  });
}

function initCoverPreview() {
  const input = $('#pe-cover'), preview = $('#cover-preview');
  if (!input || !preview) return;
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) { preview.innerHTML = ''; return; }
    preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Anteprima" />`;
  });
}

function initPostEditorForm() {
  const form = $('#post-editor-form'); if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#post-editor-submit'), status = $('#post-editor-status');
    btn.disabled = true; btn.textContent = 'Salvataggio…';
    const formData = new FormData();
    formData.append('title', $('#pe-title').value);
    formData.append('type', $('#pe-type').value);
    formData.append('status', $('#pe-status').value);
    formData.append('excerpt', $('#pe-excerpt').value);
    formData.append('content', quillEditor ? quillEditor.root.innerHTML : '');
    const coverFile = $('#pe-cover').files[0];
    if (coverFile) formData.append('cover_image', coverFile);
    try {
      if (editingPostId) await apiFormData(`/posts/${editingPostId}`, formData, 'PUT');
      else await apiFormData('/posts', formData, 'POST');
      showStatus(status, `Articolo ${editingPostId ? 'aggiornato' : 'creato'} con successo.`, 'success');
      setTimeout(() => switchView('posts'), 1500);
    } catch (err) { showStatus(status, err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Salva articolo'; }
  });
}

async function deletePost(postId, title) {
  if (!confirm(`Elimina l'articolo "${title}"? Irreversibile.`)) return;
  try { await api(`/posts/${postId}`, { method: 'DELETE' }); loadAllPosts(); }
  catch (err) { alert('Errore: ' + err.message); }
}

async function loadComments() {
  const container = $('#comments-list'); if (!container) return;
  container.innerHTML = '<p style="padding:1.25rem;color:var(--c-muted)">Caricamento…</p>';
  try {
    const { comments } = await api('/admin/comments');
    allCommentsData = comments || []; renderComments();
  } catch (err) { container.innerHTML = `<p style="padding:1rem;color:var(--c-error)">${err.message}</p>`; }
}

function renderComments() {
  const container = $('#comments-list'); if (!container) return;
  const toShow = commentsFilter === 'pending' ? allCommentsData.filter(c => !c.is_approved) : allCommentsData;
  if (!toShow.length) { container.innerHTML = '<p style="padding:1.25rem;color:var(--c-muted);font-style:italic">Nessun commento.</p>'; return; }
  container.innerHTML = toShow.map(c => `
    <div class="comment-admin-item">
      <div class="comment-admin-header">
        <div class="comment-admin-meta">
          <span class="comment-admin-author">${escapeHtml(c.author_name)}</span>
          <span class="comment-admin-post">su: ${escapeHtml(c.post_title)}</span>
          ${!c.is_approved ? '<span class="badge badge-pending">In attesa</span>' : '<span class="badge badge-published">Approvato</span>'}
        </div>
        <span class="comment-admin-date">${formatDateTime(c.created_at)}</span>
      </div>
      <p class="comment-admin-content">${escapeHtml(c.content)}</p>
      <div class="comment-admin-actions" style="margin-top:0.5rem">
        ${!c.is_approved ? `<button class="btn btn-sm btn-ghost" onclick="approveComment(${c.id})">Approva</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteComment(${c.id})">Elimina</button>
      </div>
    </div>`).join('');
}

async function approveComment(id) {
  try { await api(`/comments/${id}/approve`, { method: 'PATCH' }); const c = allCommentsData.find(x => x.id === id); if (c) c.is_approved = 1; renderComments(); }
  catch (err) { alert(err.message); }
}
async function deleteComment(id) {
  if (!confirm('Eliminare questo commento?')) return;
  try { await api(`/comments/${id}`, { method: 'DELETE' }); allCommentsData = allCommentsData.filter(c => c.id !== id); renderComments(); }
  catch (err) { alert(err.message); }
}
function initCommentFilters() {
  document.addEventListener('click', e => {
    const ftab = e.target.closest('.ftab'); if (!ftab) return;
    $$('.ftab').forEach(t => t.classList.remove('active')); ftab.classList.add('active');
    commentsFilter = ftab.dataset.filter; renderComments();
  });
}

async function loadContacts() {
  const container = $('#contacts-list'); if (!container) return;
  container.innerHTML = '<p style="padding:1.25rem;color:var(--c-muted)">Caricamento…</p>';
  try {
    const { contacts } = await api('/contacts');
    if (!contacts || !contacts.length) { container.innerHTML = '<p style="padding:1.25rem;color:var(--c-muted);font-style:italic">Nessun messaggio ricevuto.</p>'; return; }
    container.innerHTML = contacts.map(c => `
      <div class="comment-admin-item contact-admin-item ${!c.is_read ? 'unread' : ''}">
        <div class="comment-admin-header">
          <div class="comment-admin-meta">
            <span class="comment-admin-author">${escapeHtml(c.name)}</span>
            <span class="comment-admin-post">Tel: ${escapeHtml(c.phone)}</span>
            ${c.subject ? `<span class="badge">${escapeHtml(c.subject)}</span>` : ''}
            ${!c.is_read ? '<span class="badge badge-pending">Nuovo</span>' : ''}
          </div>
          <span class="comment-admin-date">${formatDateTime(c.created_at)}</span>
        </div>
        <p class="comment-admin-content" style="white-space:pre-wrap">${escapeHtml(c.message)}</p>
        <div class="comment-admin-actions" style="margin-top:0.5rem">
          ${!c.is_read ? `<button class="btn btn-sm btn-ghost" onclick="markContactRead(${c.id})">Letto</button>` : ''}
          <button class="btn btn-sm btn-danger" onclick="deleteContact(${c.id})">Elimina</button>
        </div>
      </div>`).join('');
  } catch (err) { container.innerHTML = `<p style="padding:1rem;color:var(--c-error)">${err.message}</p>`; }
}

async function markContactRead(id) {
  try { await api(`/contacts/${id}/read`, { method: 'PATCH' }); loadContacts(); }
  catch (err) { alert(err.message); }
}

async function deleteContact(id) {
  if (!confirm('Eliminare questo messaggio?')) return;
  try { await api(`/contacts/${id}`, { method: 'DELETE' }); loadContacts(); }
  catch (err) { alert(err.message); }
}

async function loadLogs() {
  const tbody = $('#logs-tbody'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--c-muted)">Caricamento…</td></tr>';
  try {
    const data = await api('/admin/logs');
    const logs = data.logs || [];
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${formatDateTime(l.created_at)}</td>
        <td><code style="font-size:.75rem;color:var(--c-accent)">${l.action}</code></td>
        <td>${l.entity_type || '—'} ${l.entity_id ? `#${l.entity_id}` : ''}</td>
        <td style="font-family:monospace;font-size:.75rem;color:var(--c-muted)">${l.ip_address || '—'}</td>
        <td style="font-size:.75rem;color:var(--c-muted)">${l.details ? JSON.stringify(l.details).substring(0, 60) : '—'}</td>
      </tr>`).join('');
  } catch (err) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--c-error);padding:1rem">${err.message}</td></tr>`; }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(str) { return escapeHtml(str); }

window.editPost = editPost;
window.deletePost = deletePost;
window.approveComment = approveComment;
window.deleteComment = deleteComment;
window.markContactRead = markContactRead;
window.deleteContact = deleteContact;
window.switchView = switchView;

document.addEventListener('DOMContentLoaded', () => {
  initLogin(); initLogout(); initNavigation();
  initPostEditorForm(); initCommentFilters();
  checkAuth();
});
