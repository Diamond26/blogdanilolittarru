/* app.js — Danilo Littarru SPA Frontend (Vercel Serverless) */
'use strict';

// ═══════════════════════════════
// STATE
// ═══════════════════════════════
const state = {
  currentType: 'articolo',
  currentPage: 1,
  currentSlug: null,
  replyToId: null,
};

// ═══════════════════════════════
// DOM HELPERS
// ═══════════════════════════════
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  children.forEach(c => {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function getYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const raw = url.trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      return id && id.length === 11 ? id : null;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery && byQuery.length === 11) return byQuery;

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIndex = parts.findIndex(p => ['embed', 'v', 'shorts', 'live'].includes(p));
      if (markerIndex !== -1 && parts[markerIndex + 1] && parts[markerIndex + 1].length === 11) {
        return parts[markerIndex + 1];
      }
    }
  } catch (_) { }

  const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/i);
  return match ? match[1] : null;
}

function getInterviewCover(post) {
  if (post.cover_image) return post.cover_image;
  const videoId = getYouTubeId(post.content);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

// ═══════════════════════════════
// API (senza CSRF — protezione via SameSite cookie + CORS)
// ═══════════════════════════════
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Errore di rete.');
  return data;
}

// ═══════════════════════════════
// SITE VISIT TRACKING
// ═══════════════════════════════
function trackVisit() {
  fetch('/api/visits', { method: 'POST', credentials: 'include' }).catch(() => {});
}

// ═══════════════════════════════
// HEADER SCROLL
// ═══════════════════════════════
function initHeader() {
  const header = $('#site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ═══════════════════════════════
// MOBILE MENU
// ═══════════════════════════════
function initMenu() {
  const btn = $('#menu-toggle');
  const nav = $('#main-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', e => {
    const link = e.target.closest('[data-tab]');
    if (!link) return;
    state.currentType = link.dataset.tab;
    state.currentPage = 1;
    $$('.filter-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.type === state.currentType);
    });
    if (nav.classList.contains('open')) {
      nav.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    loadPosts();
    const target = $('#articoli');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $$('.nav-link', nav).forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });
}

// ═══════════════════════════════
// FILTER TABS
// ═══════════════════════════════
function initFilterTabs() {
  $$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentType = tab.dataset.type;
      state.currentPage = 1;
      loadPosts();
    });
  });
}

// ═══════════════════════════════
// POSTS
// ═══════════════════════════════
async function loadPosts() {
  const grid = $('#posts-grid');
  const loading = $('#posts-loading');
  const empty = $('#empty-state');
  const pagination = $('#pagination');
  if (!grid) return;

  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'true');
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  pagination.innerHTML = '';

  try {
    const { posts, pagination: pg } = await api(
      `/posts?type=${state.currentType}&page=${state.currentPage}&limit=9`
    );
    loading.classList.add('hidden');
    if (!posts || posts.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    posts.forEach(post => grid.appendChild(renderPostCard(post)));
    grid.setAttribute('aria-busy', 'false');
    if (pg && pg.pages > 1) {
      renderPagination(pg.page, pg.pages, pagination);
    }
  } catch (err) {
    loading.classList.add('hidden');
    grid.innerHTML = `<p class="empty-state" style="display:block">Errore nel caricamento. Riprova tra poco.</p>`;
  }
}

function renderPostCard(post) {
  const card = el('article', {
    class: 'post-card',
    tabindex: '0',
    role: 'article',
    onclick: () => openPost(post.slug),
    onkeydown: (e) => { if (e.key === 'Enter') openPost(post.slug); },
  });

  const imgWrap = el('div', { class: 'post-card-image', style: 'position: relative;' });
  const cardImage = post.type === 'intervista' ? getInterviewCover(post) : post.cover_image;

  if (cardImage) {
    const img = el('img', { src: cardImage, alt: post.title, loading: 'lazy' });
    imgWrap.appendChild(img);
  } else {
    const ph = el('div', { class: 'post-card-image-placeholder' }, 'DL');
    imgWrap.appendChild(ph);
  }

  if (post.type === 'intervista') {
    const playIcon = el('div', { class: 'play-icon-overlay' });
    playIcon.innerHTML = '<i class="fa-solid fa-circle-play"></i>';
    imgWrap.appendChild(playIcon);
  }

  const body = el('div', { class: 'post-card-body' });
  body.appendChild(el('span', { class: 'post-card-type' }, post.type === 'intervista' ? 'Intervista' : 'Articolo'));
  body.appendChild(el('h3', { class: 'post-card-title' }, post.title));

  if (post.excerpt) {
    body.appendChild(el('p', { class: 'post-card-excerpt' }, post.excerpt));
  }

  const meta = el('div', { class: 'post-card-meta' });
  meta.appendChild(el('span', { class: 'post-card-date' }, formatDate(post.published_at)));

  const stats = el('div', { class: 'post-card-stats' });
  stats.appendChild(el('span', { class: 'post-stat' }, `♡ ${post.like_count || 0}`));
  stats.appendChild(el('span', { class: 'post-stat' }, `◎ ${post.comment_count || 0}`));
  meta.appendChild(stats);
  body.appendChild(meta);

  card.appendChild(imgWrap);
  card.appendChild(body);
  return card;
}

function renderPagination(current, total, container) {
  for (let i = 1; i <= total; i++) {
    const btn = el('button', {
      class: `pagination-btn${i === current ? ' active' : ''}`,
      onclick: () => {
        state.currentPage = i;
        loadPosts();
        document.getElementById('articoli').scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, String(i));
    container.appendChild(btn);
  }
}

// ═══════════════════════════════
// POST DETAIL OVERLAY
// ═══════════════════════════════
async function openPost(slug) {
  const overlay = $('#post-overlay');
  const content = $('#post-detail-content');
  if (!overlay || !content) return;

  state.currentSlug = slug;
  state.replyToId = null;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  content.innerHTML = '<div class="post-detail-loading"><div class="loading-line"></div><div class="loading-line"></div><div class="loading-line short"></div></div>';

  try {
    const { post, comments } = await api(`/posts/${slug}`);
    renderPostDetail(post, comments, content);
  } catch (err) {
    content.innerHTML = `<p style="padding:2rem;color:var(--c-muted)">Errore nel caricamento dell'articolo.</p>`;
  }
}

function closePost() {
  const overlay = $('#post-overlay');
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  state.currentSlug = null;
}

function initPostOverlay() {
  $('#post-overlay-close')?.addEventListener('click', closePost);
  $('#post-overlay-backdrop')?.addEventListener('click', closePost);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#post-overlay').classList.contains('hidden')) closePost();
  });
}

function renderPostDetail(post, comments, container) {
  const frag = document.createDocumentFragment();

  frag.appendChild(el('div', { class: 'post-detail-type' }, post.type === 'intervista' ? 'Intervista' : 'Articolo'));
  const title = el('h1', { id: 'post-overlay-title', class: 'post-detail-title' }, post.title);
  frag.appendChild(title);

  const meta = el('div', { class: 'post-detail-meta' });
  meta.appendChild(el('span', {}, formatDate(post.published_at)));
  meta.appendChild(el('span', {}, `${post.visit_count || 0} letture`));
  frag.appendChild(meta);

  if (post.cover_image && post.type !== 'intervista') {
    frag.appendChild(el('img', {
      class: 'post-detail-cover',
      src: post.cover_image,
      alt: post.title,
    }));
  }

  if (post.type === 'intervista') {
    const interviewUrl = (post.content || '').trim();
    const videoId = getYouTubeId(interviewUrl);

    if (videoId) {
      const videoWrap = el('div', { class: 'video-wrapper', style: 'aspect-ratio:16/9; margin-bottom:1.5rem; border-radius:12px; overflow:hidden; background:#000;' });
      videoWrap.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      frag.appendChild(videoWrap);

      if (post.excerpt) {
        const descDiv = el('div', { class: 'post-detail-content prose' });
        descDiv.innerHTML = `<p style="white-space: pre-wrap;">${post.excerpt}</p>`;
        frag.appendChild(descDiv);
      }
    }
  } else {
    const contentDiv = el('div', { class: 'post-detail-content prose', html: post.content });
    frag.appendChild(contentDiv);
  }

  const likeSection = el('div', { class: 'post-like-section' });
  const likeBtn = el('button', { class: 'like-btn', 'data-postid': post.id, type: 'button' });
  likeBtn.innerHTML = '<span class="like-icon">♡</span> Mi piace';
  const likeCountText = el('span', { class: 'like-count-text' }, pluralize(post.like_count || 0, 'persona', 'persone') + ' ha trovato utile');
  likeSection.appendChild(likeBtn);
  likeSection.appendChild(likeCountText);
  frag.appendChild(likeSection);

  initLikeBtn(likeBtn, post.id, likeCountText);

  const commentsSection = el('div', { class: 'post-comments-section' });
  const approvedComments = comments || [];
  const topLevel = approvedComments.filter(c => !c.parent_id);

  const cTitle = el('h2', { class: 'comments-title' }, `${pluralize(approvedComments.length, 'Commento', 'Commenti')}`);
  commentsSection.appendChild(cTitle);

  topLevel.forEach(comment => {
    commentsSection.appendChild(renderComment(comment, approvedComments, post.id));
  });

  commentsSection.appendChild(renderCommentForm(post.id));
  frag.appendChild(commentsSection);

  container.innerHTML = '';
  container.appendChild(frag);
}

function renderComment(comment, allComments, postId) {
  const wrap = el('div', { class: 'comment' });
  const header = el('div', { class: 'comment-header' });
  header.appendChild(el('span', { class: 'comment-author' }, comment.author_name));
  header.appendChild(el('span', { class: 'comment-date' }, formatDate(comment.created_at)));
  wrap.appendChild(header);
  wrap.appendChild(el('p', { class: 'comment-content' }, comment.content));

  const replyBtn = el('button', {
    class: 'comment-reply-btn', onclick: () => {
      state.replyToId = comment.id;
      const form = $('#comment-form-inner');
      if (form) {
        const label = form.querySelector('.reply-indicator');
        if (label) label.textContent = `Rispondendo a ${comment.author_name}`;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        form.querySelector('input[name="author_name"]')?.focus();
      }
    }
  });
  replyBtn.textContent = 'Rispondi';
  wrap.appendChild(replyBtn);

  const replies = allComments.filter(c => c.parent_id === comment.id);
  replies.forEach(reply => {
    const replyWrap = el('div', { class: 'comment comment-reply' });
    const rh = el('div', { class: 'comment-header' });
    rh.appendChild(el('span', { class: 'comment-author' }, reply.author_name));
    rh.appendChild(el('span', { class: 'comment-date' }, formatDate(reply.created_at)));
    replyWrap.appendChild(rh);
    replyWrap.appendChild(el('p', { class: 'comment-content' }, reply.content));
    wrap.appendChild(replyWrap);
  });

  return wrap;
}

function renderCommentForm(postId) {
  const section = el('div', { class: 'comment-form' });
  section.appendChild(el('h3', { class: 'comment-form-title' }, 'Lascia un commento'));

  const replyIndicator = el('p', {
    class: 'reply-indicator',
    style: 'font-size:0.85rem;color:var(--c-accent);margin-bottom:0.75rem;min-height:1.2em;'
  });

  const form = el('div', { id: 'comment-form-inner' });
  form.appendChild(replyIndicator);

  const fields = [
    { name: 'author_name', label: 'Nome *', type: 'text', required: true },
    { name: 'author_email', label: 'Email * (non sarà pubblicata)', type: 'email', required: true },
  ];
  const rowDiv = el('div', { class: 'form-row' });
  fields.forEach(f => {
    const g = el('div', { class: 'form-group' });
    g.appendChild(el('label', { for: `cf-${f.name}` }, f.label));
    g.appendChild(el('input', { type: f.type, name: f.name, id: `cf-${f.name}`, required: f.required ? 'required' : undefined }));
    rowDiv.appendChild(g);
  });
  form.appendChild(rowDiv);

  const msgGroup = el('div', { class: 'form-group' });
  msgGroup.appendChild(el('label', { for: 'cf-content' }, 'Commento *'));
  msgGroup.appendChild(el('textarea', { name: 'content', id: 'cf-content', rows: '4', required: 'required' }));
  form.appendChild(msgGroup);

  const statusEl = el('div', { class: 'form-status hidden', id: 'comment-form-status' });
  form.appendChild(statusEl);

  const btn = el('button', {
    class: 'btn btn-primary btn-sm',
    type: 'button',
    onclick: () => submitComment(postId, form, statusEl),
  }, 'Invia commento');
  form.appendChild(btn);

  section.appendChild(form);
  return section;
}

async function submitComment(postId, form, statusEl) {
  const name = form.querySelector('input[name="author_name"]').value.trim();
  const email = form.querySelector('input[name="author_email"]').value.trim();
  const content = form.querySelector('textarea[name="content"]').value.trim();

  if (!name || !email || !content) {
    showFormStatus(statusEl, 'Compila tutti i campi obbligatori.', 'error');
    return;
  }

  try {
    await api('/comments', {
      method: 'POST',
      body: JSON.stringify({
        post_id: postId,
        parent_id: state.replyToId || null,
        author_name: name,
        author_email: email,
        content,
      }),
    });
    showFormStatus(statusEl, 'Commento inviato. Sarà visibile dopo l\'approvazione. Grazie!', 'success');
    form.querySelector('input[name="author_name"]').value = '';
    form.querySelector('input[name="author_email"]').value = '';
    form.querySelector('textarea[name="content"]').value = '';
    state.replyToId = null;
    const indicator = form.querySelector('.reply-indicator');
    if (indicator) indicator.textContent = '';
  } catch (err) {
    showFormStatus(statusEl, err.message || 'Errore nell\'invio del commento.', 'error');
  }
}

// ═══════════════════════════════
// LIKES
// ═══════════════════════════════
async function initLikeBtn(btn, postId, countEl) {
  try {
    const { liked, count } = await api(`/likes/${postId}/status`);
    updateLikeBtn(btn, liked, count, countEl);
  } catch (_) { }

  btn.addEventListener('click', async () => {
    try {
      const { liked, count } = await api(`/likes/${postId}`, { method: 'POST' });
      updateLikeBtn(btn, liked, count, countEl);
    } catch (_) { }
  });
}

function updateLikeBtn(btn, liked, count, countEl) {
  btn.classList.toggle('liked', liked);
  btn.innerHTML = `<span class="like-icon">${liked ? '♥' : '♡'}</span> ${liked ? 'Ti piace' : 'Mi piace'}`;
  if (countEl) countEl.textContent = `${pluralize(count, 'persona', 'persone')} ${count === 1 ? 'ha trovato' : 'hanno trovato'} utile`;
}

// ═══════════════════════════════
// CONTACT FORM
// ═══════════════════════════════
function initContactForm() {
  const form = $('#contact-form');
  const statusEl = $('#form-status');
  const submitBtn = $('#contact-submit');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#contact-name')?.value.trim();
    const phone = $('#contact-tel')?.value.trim();
    const subject = $('#contact-subject')?.value;
    const message = $('#contact-message')?.value.trim();
    const privacy = form.querySelector('input[name="privacy"]')?.checked;

    if (!name || !phone || !message) {
      showFormStatus(statusEl, 'Compila tutti i campi obbligatori.', 'error');
      return;
    }
    if (!privacy) {
      showFormStatus(statusEl, 'Accetta la privacy policy per continuare.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Invio in corso…';

    try {
      await api('/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, phone, subject, message })
      });
      showFormStatus(statusEl, '✓ Messaggio inviato con successo. Grazie!', 'success');
      form.reset();
    } catch (err) {
      showFormStatus(statusEl, err.message || 'Errore durante l\'invio.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Invia messaggio';
    }
  });
}

function showFormStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className = `form-status ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => { if (type === 'success') el.classList.add('hidden'); }, 6000);
}

// ═══════════════════════════════
// FOOTER YEAR
// ═══════════════════════════════
function initFooterYear() {
  const el = $('#footer-year');
  if (el) el.textContent = new Date().getFullYear();
}

// ═══════════════════════════════
// INIT
// ═══════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initHeader();
  initMenu();
  initFilterTabs();
  initPostOverlay();
  initContactForm();
  initFooterYear();
  loadPosts();
  trackVisit();
});
