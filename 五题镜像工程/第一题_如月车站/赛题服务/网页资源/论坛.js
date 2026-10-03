const content = document.querySelector('#content');
const accountName = document.querySelector('#nav-user-name');
const menuUserName = document.querySelector('#menu-user-name');
const menuUserRole = document.querySelector('#menu-user-role');
const profileLink = document.querySelector('#profile-link');
const moderationLink = document.querySelector('#moderation-link');
const navSearch = document.querySelector('#nav-search');
const navSearchInput = document.querySelector('#nav-search-input');
const navBell = document.querySelector('#nav-bell');
const bellPop = document.querySelector('#bell-pop');
const navUserBtn = document.querySelector('#nav-user-btn');
const userMenu = document.querySelector('#user-menu');
const toastNode = document.querySelector('#toast');
const pollRing = document.querySelector('#poll-ring');
const footerStash = document.querySelector('#footer-stash');
let currentUser = null;
let lastRender = 0;
let likedFloors = new Set();
let collected = false;
let toastTimer = null;
let autoJumped = false;

/* path 一律由调用点写字面量，不在运行时拼接用户输入 */
async function api(path, options = {}) {
  const response = await fetch(`/api/forum${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '请求失败'), { status: response.status });
  return data;
}

function element(tag, className = '', value = '') {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== '') item.textContent = value;
  return item;
}

function paragraph(className, value) { return element('p', className, value); }

function crumb(parts) {
  const p = element('p', 'breadcrumb');
  const home = element('a', '', '归途论坛');
  home.href = '#home';
  p.append(home);
  for (const part of parts) {
    p.append(element('span', 'crumb-separator', '›'), document.createTextNode(' ' + part));
  }
  return p;
}

function roleText() { return currentUser.role === 'admin' ? '版务' : '普通会员'; }

function toast(message) {
  toastNode.textContent = message;
  toastNode.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastNode.hidden = true; }, 1900);
}

async function loadUser() {
  currentUser = await api('/me');
  accountName.textContent = currentUser.displayName;
  menuUserName.textContent = `${currentUser.displayName} (@${currentUser.handle})`;
  menuUserRole.textContent = roleText();
  moderationLink.hidden = currentUser.role !== 'admin';
}

function setNavigation(view) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (view === 'profile') profileLink.setAttribute('aria-current', 'page');
  else profileLink.removeAttribute('aria-current');
  navSearch.hidden = !view.startsWith('thread/');
}

/* 字符头像：灵异版匿名用户统一灰色「匿」，有名号用户按名字取色 */
function avatarFor(author, cls = '') {
  const anon = author === '匿名用户';
  let hue = 0;
  for (let i = 0; i < author.length; i += 1) hue = (hue * 31 + author.charCodeAt(i)) % 360;
  const box = element('span', `avatar ${cls}`, anon ? '匿' : author.replace(/\s*◆.*$/, '')[0]);
  box.style.background = anon
    ? 'linear-gradient(145deg, #8d99ad, #6f7c92)'
    : `linear-gradient(145deg, hsl(${hue} 42% 58%), hsl(${hue} 46% 44%))`;
  box.title = author;
  return box;
}

function anonAvatar() { return avatarFor('匿名用户'); }

function roleChip(author) {
  if (author.includes('叶纯 ◆KkRQjKFCDs')) return element('span', 'post-title-chip narrator', '实况主');
  if (author.includes('町田亲卫队')) return element('span', 'post-title-chip op', '串主');
  if (author.startsWith('◆xmKsragiEki')) return element('span', 'post-title-chip mod', '版务');
  return null;
}

function authorClass(author) {
  if (author.includes('叶纯 ◆KkRQjKFCDs')) return ' narrator';
  if (author.includes('町田亲卫队')) return ' op';
  return '';
}

/* 把 >>123 之类的引用变成可点击跳转 */
function linkifyReferences(node, root) {
  const pattern = />>(\d{1,4})/g;
  const walk = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.TEXT_NODE) { walk(child); continue; }
      pattern.lastIndex = 0;
      if (!pattern.test(child.textContent)) continue;
      pattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let match;
      while ((match = pattern.exec(child.textContent)) !== null) {
        if (match.index > cursor) fragment.append(child.textContent.slice(cursor, match.index));
        const ref = element('span', 'reply-ref', match[0]);
        ref.dataset.target = `post-${match[1]}`;
        fragment.append(ref);
        cursor = match.index + match[0].length;
      }
      if (cursor < child.textContent.length) fragment.append(child.textContent.slice(cursor));
      child.replaceWith(fragment);
    }
  };
  walk(node);
  node.addEventListener('click', event => {
    const ref = event.target.closest('.reply-ref');
    if (!ref) return;
    const target = root.querySelector(`#${CSS.escape(ref.dataset.target)}`);
    if (!target) return;
    if (target.classList.contains('post-hidden')) {
      const reset = root.querySelector('.chip[data-filter="all"]');
      if (reset) reset.click();
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.classList.add('flash');
    window.setTimeout(() => target.classList.remove('flash'), 1600);
  });
}

/* ── 首页：公告 / 版块 / 主题列表 ─────────────── */
async function renderHome() {
  const thread = await api('/threads/26');
  const posts = thread.posts;
  const first = posts[0];
  const last = posts.at(-1);
  const narratorCount = posts.filter(p => p.isNarrator).length;
  content.replaceChildren(
    paragraph('breadcrumb', '归途论坛'),
    (() => {
      const bar = element('div', 'notice-bar');
      const b = element('strong', '', '版务公告');
      bar.append(b, document.createTextNode('　灵异版已转为只读存档区，仅保留 2004 年迁移话题，不再接受新的帖子与回复。'));
      return bar;
    })(),
    element('h2', 'section-title', '版块'),
    (() => {
      const grid = element('div', 'board-grid');
      const occult = element('button', 'board-card card');
      occult.type = 'button';
      occult.append(
        element('span', 'board-icon', '灵'),
        (() => {
          const box = element('div');
          box.append(element('h3', '', '灵异版'), paragraph('', `主题 1　·　回复 ${posts.length}`));
          return box;
        })()
      );
      occult.addEventListener('click', () => { location.hash = 'thread/26'; });
      const closed = name => {
        const card = element('button', 'board-card card disabled');
        card.type = 'button';
        card.append(element('span', 'board-icon', name[0]), (() => {
          const box = element('div');
          box.append(element('h3', '', name), paragraph('', '暂未开放'));
          return box;
        })());
        card.addEventListener('click', () => toast('该版块暂未开放。'));
        return card;
      };
      grid.append(occult, closed('站务公告'), closed('闲聊茶馆'));
      return grid;
    })(),
    element('h2', 'section-title', '灵异版 · 当前话题'),
    (() => {
      const list = element('div', 'card');
      const row = element('a', 'thread-row');
      row.href = '#thread/26';
      row.append(
        avatarFor('叶纯 ◆KkRQjKFCDs'),
        (() => {
          const main = element('div', 'thread-row-main');
          const title = element('p', 'thread-row-title');
          title.append(element('span', 'tag tag-pin', '置顶'), element('span', 'tag tag-live', '实况'), document.createTextNode(thread.title));
          main.append(title, paragraph('thread-row-excerpt', first.text));
          return main;
        })(),
        (() => {
          const meta = element('div', 'thread-row-meta');
          meta.append(
            element('strong', '', `回复 ${posts.length}`),
            document.createElement('br'),
            document.createTextNode(`实况 ${narratorCount} 楼`),
            document.createElement('br'),
            document.createTextNode(`收录至 #${last.number}`)
          );
          return meta;
        })()
      );
      list.append(row);
      return list;
    })(),
    (() => {
      const strip = element('div', 'card stats-strip');
      const mk = (label, value) => {
        const s = element('span');
        s.append(element('b', '', value), document.createTextNode(label));
        return s;
      };
      strip.append(mk('会员', '1'), mk('主题', '1'), mk('回复', String(posts.length)));
      return strip;
    })()
  );
}

/* ── 帖子页 ─────────────────────────────── */
function applyThreadFilter(root, mode) {
  for (const post of root.querySelectorAll('.post')) {
    const show = mode === 'all'
      || (mode === 'op' && post.classList.contains('is-op'))
      || (mode === 'narrator' && post.classList.contains('is-narrator'));
    post.classList.toggle('post-hidden', !show);
  }
}

function renderThread(thread) {
  const posts = thread.posts;
  const first = posts[0].number;
  const last = posts.at(-1).number;
  const narratorCount = posts.filter(p => p.isNarrator).length;
  content.replaceChildren(
    crumb(['灵异版', '如月车站']),
    (() => {
      const head = element('section', 'card thread-head');
      const title = element('h1');
      title.append(element('span', 'tag tag-live', '实况'), document.createTextNode(thread.title));
      head.append(
        title,
        paragraph('meta', `${thread.date}　｜　收录 #${first}—#${last} 共 ${posts.length} 楼　·　叶纯的实况 ${narratorCount} 楼　·　只读存档`)
      );
      const actions = element('div', 'thread-actions');
      const mkChip = (label, mode) => {
        const chip = element('button', 'chip', label);
        chip.type = 'button';
        chip.dataset.filter = mode;
        chip.setAttribute('aria-pressed', mode === 'all' ? 'true' : 'false');
        chip.addEventListener('click', () => {
          actions.querySelectorAll('.chip[data-filter]').forEach(c => c.setAttribute('aria-pressed', 'false'));
          chip.setAttribute('aria-pressed', 'true');
          applyThreadFilter(content, mode);
        });
        return chip;
      };
      actions.append(mkChip('全部', 'all'), mkChip('只看串主', 'op'), mkChip(`只看叶纯（${narratorCount}楼）`, 'narrator'));
      const spacer = element('span', 'thread-tools-spacer');
      const jumpInput = element('input', 'tool-input');
      jumpInput.type = 'number';
      jumpInput.min = first;
      jumpInput.max = last;
      jumpInput.placeholder = String(first);
      jumpInput.setAttribute('aria-label', '楼层号');
      const jumpBtn = element('button', 'tool-btn', '跳到楼层');
      jumpBtn.type = 'button';
      const collectBtn = element('button', 'tool-btn', collected ? '已收藏' : '收藏');
      collectBtn.type = 'button';
      collectBtn.addEventListener('click', () => {
        collected = !collected;
        collectBtn.textContent = collected ? '已收藏' : '收藏';
        toast(collected ? '已收藏（仅本页生效）。' : '已取消收藏。');
      });
      const topBtn = element('button', 'tool-btn', '回到顶部');
      topBtn.type = 'button';
      topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
      actions.append(spacer, jumpInput, jumpBtn, collectBtn, topBtn);
      head.append(actions);
      const jump = () => {
        const value = Math.min(Math.max(Number(jumpInput.value), first), last);
        if (!Number.isInteger(value) || value < first || value > last) return;
        const target = document.getElementById(`post-${value}`);
        if (!target) return;
        if (target.classList.contains('post-hidden')) {
          const reset = content.querySelector('.chip[data-filter="all"]');
          if (reset) reset.click();
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash');
        window.setTimeout(() => target.classList.remove('flash'), 1600);
      };
      jumpBtn.addEventListener('click', jump);
      jumpInput.addEventListener('keydown', event => { if (event.key === 'Enter') jump(); });
      return head;
    })()
  );

  const listCard = element('div', 'card');
  const fragment = document.createDocumentFragment();
  for (const post of posts) {
    const item = element('article', 'post');
    item.id = `post-${post.number}`;
    if (post.isNarrator) item.classList.add('is-narrator');
    if (post.isOp) item.classList.add('is-op');

    const side = element('div', 'post-side');
    side.append(avatarFor(post.author));
    const author = element('span', `post-author${authorClass(post.author)}`, post.author);
    side.append(author);
    const chip = roleChip(post.author);
    if (chip) side.append(document.createElement('br'), chip);

    const main = element('div', 'post-main');
    const meta = element('div', 'post-meta');
    meta.append(element('span', '', post.time), element('span', 'post-floor', `第 ${post.number} 楼`));
    const body = paragraph('post-body', post.text);
    const foot = element('div', 'post-foot');
    const like = element('button', 'act', likedFloors.has(post.number) ? '已赞 1' : '赞');
    like.type = 'button';
    if (likedFloors.has(post.number)) like.classList.add('liked');
    like.addEventListener('click', () => {
      if (likedFloors.has(post.number)) {
        likedFloors.delete(post.number);
        like.classList.remove('liked');
        like.textContent = '赞';
      } else {
        likedFloors.add(post.number);
        like.classList.add('liked');
        like.textContent = '已赞 1';
      }
    });
    const reply = element('button', 'act', '回复');
    reply.type = 'button';
    reply.addEventListener('click', () => toast('只读存档：不能发帖或回复。'));
    const quote = element('button', 'act', '引用');
    quote.type = 'button';
    quote.addEventListener('click', () => toast('只读存档：引用功能不可用。'));
    const report = element('button', 'act', '举报');
    report.type = 'button';
    report.addEventListener('click', () => toast('存档模式下举报不可用。'));
    foot.append(like, reply, quote, report);
    main.append(meta, body, foot);
    item.append(side, main);
    linkifyReferences(body, content);
    fragment.append(item);
  }
  listCard.append(fragment);
  const replyClosed = element('div', 'reply-closed card');
  const replyInput = document.createElement('input');
  replyInput.disabled = true;
  replyInput.placeholder = '回帖功能已关闭（只读存档）';
  replyInput.setAttribute('aria-label', '回帖输入框（已关闭）');
  const replyBtn = element('button', '', '发表回复');
  replyBtn.disabled = true;
  replyBtn.type = 'button';
  replyClosed.append(replyInput, replyBtn);
  content.append(listCard, paragraph('thread-end', `—— 本串收录至 #${last}，到此封存 ——`), replyClosed);
}

/* 楼层内容搜索（仅在当前帖内） */
function runThreadSearch() {
  const query = navSearchInput.value.trim();
  document.querySelector('.search-strip')?.remove();
  content.querySelectorAll('.search-hit').forEach(el => el.classList.remove('search-hit'));
  if (!query) return;
  const hits = [];
  for (const post of content.querySelectorAll('.post')) {
    if (post.querySelector('.post-body').textContent.includes(query)) {
      hits.push(post);
      post.querySelector('.post-body').classList.add('search-hit');
    }
  }
  if (!hits.length) {
    toast(`没有找到包含「${query}」的楼层。`);
    return;
  }
  const strip = element('div', 'search-strip');
  strip.append(document.createTextNode(`找到 ${hits.length} 楼包含「${query}」：`));
  for (const hit of hits.slice(0, 24)) {
    const chip = element('a', '', `#${hit.id.replace('post-', '')}楼`);
    chip.href = `#${hit.id}`;
    chip.addEventListener('click', event => {
      event.preventDefault();
      hit.scrollIntoView({ behavior: 'smooth', block: 'start' });
      hit.classList.add('flash');
      window.setTimeout(() => hit.classList.remove('flash'), 1600);
    });
    strip.append(chip);
  }
  const clear = element('button', 'tool-btn', '清除');
  clear.type = 'button';
  clear.addEventListener('click', () => {
    navSearchInput.value = '';
    strip.remove();
    content.querySelectorAll('.search-hit').forEach(el => el.classList.remove('search-hit'));
  });
  strip.append(clear);
  content.prepend(strip);
  hits[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
}
navSearch.addEventListener('submit', event => { event.preventDefault(); runThreadSearch(); });

/* ── 资料页 ─────────────────────────────── */
function renderProfile() {
  content.replaceChildren(
    crumb(['个人资料']),
    (() => {
      const card = element('section', 'card profile-card');
      const img = document.createElement('img');
      img.className = 'avatar avatar-img avatar-lg';
      img.src = '/forum/assets/头像_爱音.jpg';
      img.alt = '爱音的头像';
      const id = element('div', 'profile-id');
      const nameRow = element('h2');
      nameRow.append(document.createTextNode(currentUser.displayName), (() => {
        const badge = element('span', 'role-badge', roleText());
        if (currentUser.role === 'admin') badge.classList.add('is-admin');
        badge.style.marginLeft = '10px';
        badge.style.verticalAlign = '4px';
        return badge;
      })());
      id.append(nameRow, paragraph('', `账号：@${currentUser.handle}`), paragraph('', '灵异版 · 只读存档区会员'));
      card.append(img, id);
      return card;
    })(),
    (() => {
      const card = element('section', 'card profile-stats');
      const mk = (label, value) => {
        const box = element('span');
        box.append(element('b', '', value), document.createTextNode(label));
        return box;
      };
      card.append(mk('发帖', '0'), mk('回复', '0'), mk('精华', '0'), mk('收藏', collected ? '1' : '0'));
      return card;
    })(),
    (() => {
      const panel = element('section', 'card panel');
      panel.append(element('h3', 'panel-title', '编辑资料'),
        paragraph('panel-intro', '可修改自己的显示名称和简介。论坛存档不接受新的帖子或回复。'));
      const form = element('form', '');
      const displayLabel = element('label', 'field', '显示名称');
      const display = document.createElement('input');
      display.name = 'displayName';
      display.maxLength = 40;
      display.value = currentUser.displayName;
      displayLabel.append(display);
      const bioLabel = element('label', 'field', '个人简介');
      const bio = document.createElement('textarea');
      bio.name = 'bio';
      bio.maxLength = 160;
      bio.value = currentUser.bio;
      bioLabel.append(bio);
      const save = element('button', 'button', '保存资料');
      save.type = 'submit';
      const status = paragraph('status', '');
      status.setAttribute('role', 'status');
      form.append(displayLabel, bioLabel, save, status);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        save.disabled = true;
        try {
          await api('/me', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: display.value, bio: bio.value })
          });
          await loadUser();
          status.textContent = '资料已保存。';
          toast('资料已保存。');
        } catch (error) { status.textContent = `保存失败：${error.message}`; }
        finally { save.disabled = false; }
      });
      panel.append(form);
      return panel;
    })()
  );
}

/* ── 版务暂存 ─────────────────────────────── */
async function renderModeration() {
  const reports = await api('/reports');
  content.replaceChildren(
    crumb(['版务暂存']),
    (() => {
      const card = element('section', 'card');
      card.style.padding = '16px 20px 18px';
      card.append(
        element('h2', 'panel-title', '版务暂存'),
        paragraph('panel-intro', '以下是未公开的投稿补充。普通会员无法查看本页。')
      );
      const list = element('ol', 'report-list');
      for (const report of reports) {
        const item = document.createElement('li');
        const link = element('a', '', report.title);
        link.href = `#report/${report.id}`;
        item.append(link, paragraph('report-meta', `暂存原因：${report.reason}　｜　无署名`));
        list.append(item);
      }
      card.append(list);
      return card;
    })()
  );
}

/* 存档里只有一份报告：hash 编号不匹配 71 时直接按 404 处理，请求地址永远是同一条字面量路径 */
async function renderReport(rawId) {
  if (String(rawId) !== '71') {
    throw Object.assign(new Error('存档中没有这个页面。'), { status: 404 });
  }
  const response = await fetch('/api/forum/reports/71', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  });
  const report = await response.json();
  if (!response.ok) throw Object.assign(new Error(report.error || '请求失败'), { status: response.status });
  content.replaceChildren(
    crumb(['版务暂存', '投稿补充']),
    (() => {
      const card = element('article', 'card');
      card.style.padding = '16px 20px 18px';
      card.append(
        element('h2', 'panel-title', report.title),
        paragraph('report-meta', `版务暂存 · 未公开 · 投稿：${report.author}`)
      );
      for (const section of report.body) card.append(paragraph('post-body', section));
      const route = report.route;
      card.append(paragraph('clue-box', `回程调度：${route.platform} 号站台。进站提示音：${route.signal}。登车前，先核对车头显示的站名。`));
      card.append(paragraph('report-meta', '路线回执（用于游戏内核验，不是比赛 FLAG）'));
      card.append(element('code', 'proof', report.proof));
      card.append(paragraph('report-meta', '——报告到这里为止。'));
      return card;
    })(),
    (() => {
      const tip = paragraph('panel-intro', '在游戏画面的调查终端中填入核验字符串、站台和提示音，提交给爱音。');
      tip.style.marginTop = '12px';
      return tip;
    })()
  );
}

/* ── 周期轮询：账号（约十秒，剧本场景二）与调度窗口状态 ─────────────── */
async function pollAccount() {
  try {
    await loadUser();
    pollRing.hidden = false;
    pollRing.classList.remove('polling');
    void pollRing.offsetWidth;
    pollRing.classList.add('polling');
    window.setTimeout(() => pollRing.classList.remove('polling'), 950);
  } catch { /* 服务不可达时静默 */ }
}
window.setInterval(pollAccount, 10000);

let bannerNode = null;
let challengeKey = null;
async function refreshChallenge(providedState = null) {
  let state = providedState;
  if (!state) try {
    const response = await fetch('/api/game/state', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    state = await response.json();
  } catch { return; }
  const key = [state.started, state.expired, state.solved, currentUser?.role].join('|');
  if (key === challengeKey) return;
  challengeKey = key;
  if (!bannerNode) {
    bannerNode = element('div', 'challenge-banner');
    bannerNode.id = 'challenge-banner';
    bannerNode.hidden = true;
    document.querySelector('.topnav').after(bannerNode);
  }
  footerStash.textContent = state.started ? '暂存（1）' : '暂存（未同步）';
  footerStash.classList.toggle('stale', Boolean(state.expired && !state.solved));
  if (state.started && !state.expired && !state.solved) {
    bannerNode.className = 'challenge-banner active';
    bannerNode.hidden = false;
    bannerNode.replaceChildren(element('b', '', '版务暂存区已同步'));
    if (currentUser && currentUser.role !== 'admin') {
      bannerNode.append(element('span', 'sub', '版务暂存区已同步 1 份报告 #71。（当前身份暂无阅读权限）'));
    }
  } else if (state.expired && !state.solved) {
    bannerNode.className = 'challenge-banner closed';
    bannerNode.hidden = false;
    bannerNode.replaceChildren(element('b', '', '调度窗口已关闭。'));
  } else {
    bannerNode.hidden = true;
  }
  if (state.solved && !autoJumped && location.hash !== '#report/71') {
    autoJumped = true;
    location.hash = 'report/71';
  }
}
if (window.parent === window) {
  let polling = false;
  window.setInterval(async () => {
    if (polling) return;
    polling = true;
    try { await refreshChallenge(); } finally { polling = false; }
  }, 5000);
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.source !== window.parent) return;
  if (event.data?.type === 'mygo:challenge-state') { refreshChallenge(event.data.state); return; }
  if (event.data === 'mygo:challenge-started' || event.data === 'mygo:clue-submitted') refreshChallenge();
});
refreshChallenge();

/* ── 路由 ─────────────────────────────── */
async function render() {
  const renderId = ++lastRender;
  const view = (location.hash.slice(1) || 'home').split('?')[0];
  setNavigation(view.startsWith('thread/') ? 'thread' : view.startsWith('report/') ? 'moderation' : view);
  content.replaceChildren(paragraph('loading', '读入中……'));
  try {
    await loadUser();
    if (renderId !== lastRender) return;
    if (view === 'home') return await renderHome();
    if (view === 'profile') return renderProfile();
    if (view === 'moderation') return await renderModeration();
    if (view.startsWith('report/')) return await renderReport(view.slice(7));
    if (view === 'thread/26') return renderThread(await api('/threads/26'));
    throw Object.assign(new Error('存档中没有这个页面。'), { status: 404 });
  } catch (error) {
    if (renderId !== lastRender) return;
    content.replaceChildren(
      element('h2', 'panel-title', '无法打开此页'),
      paragraph('error', error.status === 403 ? '无权访问。' : error.status === 423 ? '暂存（未同步）——调度窗口未开启。' : error.message)
    );
  }
}

/* ── 导航交互 ─────────────────────────────── */
navUserBtn.addEventListener('click', event => {
  event.stopPropagation();
  userMenu.hidden = !userMenu.hidden;
  bellPop.hidden = true;
});
navBell.addEventListener('click', event => {
  event.stopPropagation();
  bellPop.hidden = !bellPop.hidden;
  userMenu.hidden = true;
});
document.addEventListener('click', event => {
  if (!event.target.closest('.nav-user')) userMenu.hidden = true;
  if (!event.target.closest('.nav-bell-wrap')) bellPop.hidden = true;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { userMenu.hidden = true; bellPop.hidden = true; }
});

window.addEventListener('hashchange', render);
render();
