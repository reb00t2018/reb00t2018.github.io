/* ============================================================
   reb00t's blog — engine
   ============================================================ */

;(function () {
  'use strict';

  // ---- DOM refs: views ----
  const homeView     = document.getElementById('home-view');
  const postsView    = document.getElementById('posts-view');
  const postView     = document.getElementById('post-view');
  const aboutView    = document.getElementById('about-view');

  // ---- DOM refs: main content ----
  const recentPosts  = document.getElementById('recent-posts');
  const postList     = document.getElementById('post-list');
  const listLoading  = document.getElementById('list-loading');
  const postsCount   = document.getElementById('posts-count');
  const tagFilter    = document.getElementById('tag-filter');
  const postTitle    = document.getElementById('post-title');
  const postDate     = document.getElementById('post-date');
  const postTags     = document.getElementById('post-tags');
  const postReading  = document.getElementById('post-reading');
  const postContent  = document.getElementById('post-content');
  const postLoading  = document.getElementById('post-loading');
  const backBtn      = document.getElementById('back-btn');

  // ---- DOM refs: hero stats ----
  const statPosts    = document.getElementById('stat-posts');
  const statTags     = document.getElementById('stat-tags');
  const statYears    = document.getElementById('stat-years');

  // ---- DOM refs: sidebar widgets ----
  const archiveTree  = document.getElementById('archive-tree');
  const sidebarTags  = document.getElementById('sidebar-tags');
  const sidebarRecent= document.getElementById('sidebar-recent');

  // ---- DOM refs: theme & nav ----
  const themeToggle  = document.getElementById('theme-toggle');
  const hljsLight    = document.getElementById('hljs-light');
  const hljsDark     = document.getElementById('hljs-dark');
  const navTabs      = document.querySelectorAll('.nav-tab');

  // ---- State ----
  const POSTS_JSON = 'posts/index.json';
  let posts = [];
  let allTags = [];
  let activeTag = 'all';

  // ============================================================
  //  THEME (dark by default)
  // ============================================================
  const DARK = 'dark';
  const LIGHT = 'light';
  const STORAGE_KEY = 'blog-theme';

  function getTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    return DARK; // default dark
  }

  function setTheme(theme) {
    if (theme === DARK) {
      document.documentElement.setAttribute('data-theme', DARK);
      hljsLight.disabled = true;
      hljsDark.disabled = false;
      themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      hljsLight.disabled = false;
      hljsDark.disabled = true;
      themeToggle.textContent = '🌙';
    }
    localStorage.setItem(STORAGE_KEY, theme);
  }

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') === DARK ? DARK : LIGHT;
    setTheme(current === DARK ? LIGHT : DARK);
  });
  setTheme(getTheme());

  // ============================================================
  //  MARKED & HIGHLIGHT CONFIG
  // ============================================================
  marked.setOptions({
    gfm: true,
    breaks: false,
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try { return hljs.highlight(code, { language: lang }).value; }
        catch (_) { /* fall through */ }
      }
      return code;
    },
  });

  // ============================================================
  //  UTILITIES
  // ============================================================
  function parseFrontmatter(raw) {
    const RE = /^---\s*\n([\s\S]*?)\n---\s*\n?/;
    const m = raw.match(RE);
    if (!m) return { meta: {}, body: raw };
    const meta = {};
    const lines = m[1].split('\n');
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
      }
      meta[key] = val;
    }
    return { meta, body: raw.slice(m[0].length) };
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      const date = new Date(d);
      if (isNaN(date)) return d;
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return d; }
  }

  function formatMonth(d) {
    try {
      const date = new Date(d);
      if (isNaN(date)) return '';
      return date.toLocaleDateString('en-US', { month: 'short' });
    } catch (_) { return ''; }
  }

  function readingTime(text) {
    const words = text.trim().split(/\s+/).length;
    const mins = Math.max(1, Math.round(words / 300));
    return mins + ' 分钟阅读';
  }

  function escapeHtml(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  function escapeSlug(slug) {
    return encodeURIComponent(slug);
  }

  function hideAllViews() {
    [homeView, postsView, postView, aboutView].forEach(v => { if (v) v.style.display = 'none'; });
  }

  // ============================================================
  //  POST CARD HTML
  // ============================================================
  function postCardHtml(p) {
    return `
      <a class="post-card" href="#/post/${escapeSlug(p.slug)}">
        <div class="post-card-title">${escapeHtml(p.title)}</div>
        <div class="post-card-meta">
          <span>${formatDate(p.date)}</span>
          ${(p.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${p.excerpt ? `<div class="post-card-excerpt">${escapeHtml(p.excerpt)}</div>` : ''}
      </a>`;
  }

  // ============================================================
  //  FILTER POSTS BY TAG
  // ============================================================
  function filterPosts() {
    const filtered = activeTag === 'all'
      ? posts
      : posts.filter(p => (p.tags || []).includes(activeTag));

    postList.innerHTML = filtered.length
      ? filtered.map(postCardHtml).join('')
      : `<div class="empty-state"><p>暂无「${escapeHtml(activeTag)}」标签的文章</p></div>`;

    postsCount.textContent = `(${filtered.length})`;
  }

  function buildTagFilter() {
    if (allTags.length === 0) {
      tagFilter.style.display = 'none';
      return;
    }
    tagFilter.style.display = 'flex';
    tagFilter.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'tag-filter-btn' + (activeTag === 'all' ? ' active' : '');
    allBtn.dataset.tag = 'all';
    allBtn.textContent = '全部';
    allBtn.addEventListener('click', () => { activeTag = 'all'; filterPosts(); buildTagFilter(); });
    tagFilter.appendChild(allBtn);

    allTags.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'tag-filter-btn' + (activeTag === t ? ' active' : '');
      btn.dataset.tag = t;
      btn.textContent = t;
      btn.addEventListener('click', () => { activeTag = t; filterPosts(); buildTagFilter(); });
      tagFilter.appendChild(btn);
    });
  }

  // ============================================================
  //  SIDEBAR: Archive tree
  // ============================================================
  function renderArchive() {
    if (!archiveTree) return;

    // Group posts by year and month
    const byYear = {};
    posts.forEach(p => {
      if (!p.date) return;
      const d = new Date(p.date);
      if (isNaN(d)) return;
      const year = d.getFullYear();
      const month = d.getMonth(); // 0-11
      if (!byYear[year]) byYear[year] = {};
      if (!byYear[year][month]) byYear[year][month] = [];
      byYear[year][month].push(p);
    });

    const years = Object.keys(byYear).sort((a, b) => b - a);
    if (years.length === 0) {
      archiveTree.innerHTML = '<span style="color:var(--text-muted);font-size:0.74rem;">暂无文章</span>';
      return;
    }

    // Determine which years to show expanded (current year + most recent)
    const currentYear = new Date().getFullYear();
    const openYears = new Set([currentYear, years[0]]);

    archiveTree.innerHTML = years.map(year => {
      const months = byYear[year];
      const totalInYear = Object.values(months).reduce((sum, arr) => sum + arr.length, 0);
      const isOpen = openYears.has(parseInt(year));
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

      const monthsHtml = Object.keys(months).sort((a, b) => b - a).map(m => {
        const mPosts = months[m];
        // Link to posts filtered by year-month (approximate via date)
        return mPosts.map(p => `
          <a href="#/post/${escapeSlug(p.slug)}" class="archive-month-link">
            ${monthNames[parseInt(m)]} — ${escapeHtml(p.title)}
          </a>
        `).join('');
      }).join('');

      return `
        <div class="archive-year">
          <button class="archive-year-toggle" data-year="${year}">
            <span class="arrow${isOpen ? ' open' : ''}">▶</span>
            <span>${year}</span>
            <span class="count">${totalInYear}</span>
          </button>
          <div class="archive-months${isOpen ? ' open' : ''}">${monthsHtml}</div>
        </div>`;
    }).join('');

    // Toggle click handlers
    archiveTree.querySelectorAll('.archive-year-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const arrow = btn.querySelector('.arrow');
        const monthsDiv = btn.parentElement.querySelector('.archive-months');
        arrow.classList.toggle('open');
        monthsDiv.classList.toggle('open');
      });
    });
  }

  // ============================================================
  //  SIDEBAR: Tag cloud
  // ============================================================
  function renderSidebarTags() {
    if (!sidebarTags) return;

    // Count tag usage
    const tagCounts = {};
    posts.forEach(p => (p.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    }));

    const entries = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      sidebarTags.innerHTML = '<span style="color:var(--text-muted);font-size:0.7rem;">暂无标签</span>';
      return;
    }

    const maxCount = entries[0][1];
    sidebarTags.innerHTML = entries.map(([tag, count]) => {
      // Scale font size: 0.65rem to 0.85rem
      const ratio = count / maxCount;
      const size = 0.65 + ratio * 0.22;
      return `<a href="#/posts" class="sidebar-tag" data-tag="${escapeHtml(tag)}" style="font-size:${size.toFixed(2)}rem;">${escapeHtml(tag)}<span class="tag-count">${count}</span></a>`;
    }).join('');

    // Click handler: navigate to posts view with tag filter active
    sidebarTags.querySelectorAll('.sidebar-tag').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        activeTag = el.dataset.tag;
        window.location.hash = '#/posts';
        // filterPosts + buildTagFilter will be called by showPosts()
      });
    });
  }

  // ============================================================
  //  SIDEBAR: Recent posts
  // ============================================================
  function renderRecentWidget() {
    if (!sidebarRecent) return;

    const recent = posts.slice(0, 5);
    if (recent.length === 0) {
      sidebarRecent.innerHTML = '<li style="color:var(--text-muted);font-size:0.74rem;">暂无文章</li>';
      return;
    }

    sidebarRecent.innerHTML = recent.map(p => `
      <li>
        <a href="#/post/${escapeSlug(p.slug)}">
          ${escapeHtml(p.title)}
          <span class="recent-date">${formatDate(p.date)}</span>
        </a>
      </li>
    `).join('');
  }

  // ============================================================
  //  LOAD POST INDEX
  // ============================================================
  async function loadPostIndex() {
    try {
      const res = await fetch(POSTS_JSON);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      posts = await res.json();
    } catch (err) {
      console.error('Failed to load post index:', err);
      posts = [];
    }

    posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // Collect tags
    const tagSet = new Set();
    posts.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
    allTags = [...tagSet].sort();

    // Hero stats
    statPosts.textContent = posts.length;
    statTags.textContent = allTags.length;
    if (posts.length > 0) {
      const firstDate = new Date(posts[posts.length - 1].date);
      const lastDate = new Date(posts[0].date);
      statYears.textContent = Math.max(1, Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365)));
    }

    // Sidebar widgets
    renderArchive();
    renderSidebarTags();
    renderRecentWidget();
  }

  // ============================================================
  //  VIEW: HOME
  // ============================================================
  function showHome() {
    hideAllViews();
    homeView.style.display = 'block';
    document.title = "reb00t's blog";
    recentPosts.innerHTML = posts.slice(0, 3).length
      ? posts.slice(0, 3).map(postCardHtml).join('')
      : `<div class="empty-state"><p>暂无文章，快去写一篇！</p></div>`;
  }

  // ============================================================
  //  VIEW: POSTS LIST
  // ============================================================
  function showPosts() {
    hideAllViews();
    postsView.style.display = 'block';
    document.title = '文章 — reb00t';
    listLoading.style.display = 'none';
    filterPosts();
    buildTagFilter();
  }

  // ============================================================
  //  VIEW: SINGLE POST
  // ============================================================
  async function showPost(slug) {
    hideAllViews();
    postView.style.display = 'block';
    postLoading.style.display = 'block';
    postContent.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'instant' });

    const meta = posts.find(p => p.slug === slug) || {};

    try {
      const res = await fetch(`posts/${encodeURIComponent(slug)}.md`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.text();
      const { meta: fm, body } = parseFrontmatter(raw);

      const title = fm.title || meta.title || slug;
      const date  = fm.date  || meta.date  || '';
      const tags  = fm.tags  || meta.tags  || [];

      postTitle.textContent = title;
      postDate.textContent = formatDate(date);
      postDate.setAttribute('datetime', date);
      postReading.textContent = readingTime(body);
      postTags.innerHTML = tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
      document.title = title + ' — reb00t';

      // Fix relative image paths
      const fixedBody = body.replace(
        /(!\[[^\]]*\]\()([^)]+)\)/g,
        (full, prefix, src) => {
          if (/^(https?:|\/\/|data:|#)/.test(src)) return full;
          let fixed = src.replace(/^\.\//, '/');
          if (!fixed.startsWith('/')) fixed = '/' + fixed;
          return prefix + fixed + ')';
        }
      );

      postContent.innerHTML = marked.parse(fixedBody);
      postLoading.style.display = 'none';

      postContent.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
      });
      postContent.querySelectorAll('a[href^="http"]').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    } catch (err) {
      console.error('Failed to load post:', err);
      postLoading.style.display = 'none';
      postContent.innerHTML = `
        <div class="empty-state">
          <p>文章加载失败</p>
          <p>${escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  // ============================================================
  //  VIEW: ABOUT
  // ============================================================
  function showAbout() {
    hideAllViews();
    aboutView.style.display = 'block';
    document.title = '关于 — reb00t';
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ============================================================
  //  NAV TAB ACTIVE STATE
  // ============================================================
  function updateNavTabs(tab) {
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  }

  // ============================================================
  //  ROUTING
  // ============================================================
  function handleRoute() {
    const hash = window.location.hash;

    // #/post/slug
    let m = hash.match(/^#\/post\/(.+)$/);
    if (m) {
      updateNavTabs('posts');
      showPost(decodeURIComponent(m[1]));
      return;
    }

    if (hash === '#/posts') {
      updateNavTabs('posts');
      showPosts();
      return;
    }

    if (hash === '#/about') {
      updateNavTabs('about');
      showAbout();
      return;
    }

    // Default: home
    updateNavTabs('home');
    showHome();
  }

  // ============================================================
  //  INIT
  // ============================================================
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('DOMContentLoaded', async () => {
    await loadPostIndex();
    handleRoute();
  });

  backBtn.addEventListener('click', () => {
    window.location.hash = '#/posts';
  });

})();
