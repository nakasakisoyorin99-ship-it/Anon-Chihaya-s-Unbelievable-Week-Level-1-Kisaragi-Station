// Forum UI stays outside Monogatari's script. Story code can call
// Scene 4 can call enableChallenge() / startChallenge(); listen for mygo:forum-clue-submitted.
(() => {
  const CONFIG = window.MygoChapterConfig;
  if (!CONFIG) throw new Error('缺少关卡配置：js/关卡配置.js');
  const root = document.getElementById('forum-bridge-root');
  if (!root) return;

  const toggle = document.createElement('button');
  toggle.className = 'forum-bridge-toggle';
  toggle.hidden = true;
  toggle.type = 'button';
  toggle.textContent = '论坛调查';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');

  const overlay = document.createElement('section');
  overlay.className = 'forum-bridge';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="forum-bridge-dialog" role="dialog" aria-modal="true" aria-label="${CONFIG.forumTitle}">
      <header class="forum-bridge-header">
        <div><h2>爱音的手机 · 归途论坛</h2><a class="forum-address" target="_blank" rel="noopener">打开论坛</a></div>
        <button class="forum-bridge-close" type="button" aria-label="关闭论坛调查">关闭 ×</button>
      </header>
      <div class="forum-bridge-body">
        <iframe title="${CONFIG.forumTitle}" src="${CONFIG.forumPath}"></iframe>
        <aside class="forum-bridge-side">
          
          <h3>传递线索</h3>
          <p>论坛只能阅读。玩家找到版务暂存的记录后，在这里提交核验信息。</p>
          <div class="state" role="status">正在读取挑战状态……</div>
          <form class="clue-form">
            <label>路线回执<input name="receipt" autocomplete="off" spellcheck="false" required></label>
            <label>返程站台<input name="platform" inputmode="numeric" autocomplete="off" required></label>
            <label>进站提示音<input name="signal" autocomplete="off" placeholder="例如：三短一长" required></label>
            <button class="submit" type="submit">把信息交给爱音</button>
          </form>
          <p class="hint">核验由服务端完成；提交成功后关闭调查面板，继续看两人核对路线。</p>
          <p class="feedback" role="status" aria-live="polite"></p>
        </aside>
      </div>
    </div>`;

  root.append(toggle, overlay);
  const address = overlay.querySelector('.forum-address');
  const forumURL = new URL(CONFIG.forumPath, window.location.href);
  address.href = forumURL.href;
  address.textContent = forumURL.href;
  const closeButton = overlay.querySelector('.forum-bridge-close');
  const stateNode = overlay.querySelector('.state');
  const form = overlay.querySelector('.clue-form');
  const submitButton = overlay.querySelector('.submit');
  const feedback = overlay.querySelector('.feedback');
  let lastFocus = null;
  let state = null;
  let monitoring = null;
  let pendingState = null;
  let lastStateKey = null;
  let challengeAvailable = false;

  async function request(path, options = {}) {
    const response = await fetch(`/api/game/${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error || '请求失败'), { status: response.status });
    return data;
  }

  function stateText(value) {
    if (!value) return '挑战状态暂不可用。请从${CONFIG.serviceName}打开游戏。';
    if (value.solved) return '已把返程信息交给爱音。';
    if (value.expired) return '返程窗口已关闭。可以从检查点重试。';
    if (!value.started) return '论坛已连接';
    return '返程信息核验中';
  }

  function updateState(value) {
    state = value;
    stateNode.textContent = stateText(value);
    submitButton.disabled = Boolean(!value?.started || value?.expired || value?.solved);
  }

  function publish(value) {
    const key = JSON.stringify(value);
    if (key === lastStateKey) return;
    lastStateKey = key;
    updateState(value);
    overlay.querySelector('iframe')?.contentWindow?.postMessage({ type: 'mygo:challenge-state', state: value }, location.origin);
    window.dispatchEvent(new CustomEvent('mygo:challenge-state', { detail: value }));
  }
  function refreshState() {
    if (pendingState) return pendingState;
    pendingState = request('state').then(value => {
      publish(value);
      if (value.started && !value.solved && !value.expired) watchChallenge();
      return value;
    }).catch(error => {
      feedback.textContent = '连接暂不可用，恢复后继续核验。';
      throw error;
    }).finally(() => { pendingState = null; });
    return pendingState;
  }
  function watchChallenge() {
    if (monitoring) return;
    const poll = async () => {
      try { await refreshState(); } catch { /* 不在网络错误时启动新一轮。 */ }
      monitoring = setTimeout(poll, 2500);
    };
    monitoring = setTimeout(poll, 0);
  }

  async function startChallenge({ retry = false } = {}) {
    if (!challengeAvailable) throw new Error('限时调查尚未开放');
    const value = await request(retry ? 'retry' : 'start', { method: 'POST' });
    publish(value);
    watchChallenge();
    feedback.textContent = '';
    overlay.querySelector('iframe')?.contentWindow?.postMessage('mygo:challenge-started', location.origin);
    return value;
  }

  async function submitClue(clue) {
    const result = await request('submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clue)
    });
    if (result.accepted) {
      feedback.dataset.tone = 'success';
      feedback.textContent = '信息已送达爱音。';
      form.reset();
      await refreshState();
      overlay.querySelector('iframe')?.contentWindow?.postMessage('mygo:clue-submitted', location.origin);
      window.dispatchEvent(new CustomEvent('mygo:forum-clue-submitted', {
        detail: { route: result.clue, endingToken: result.endingToken }
      }));
    }
    return result;
  }

  function open() {
    if (!overlay.hidden) return;
    lastFocus = document.activeElement;
    overlay.hidden = false;
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'true');
    closeButton.focus();
    refreshState().catch(() => {});

  }

  function close() {
    overlay.hidden = true;
    toggle.hidden = !document.querySelector('game-screen.active') || !CONFIG.investigationLabels.includes(document.body.dataset.chapterPhase);
    toggle.setAttribute('aria-expanded', 'false');

    (lastFocus?.isConnected ? lastFocus : toggle).focus();
  }

  function enableChallenge() {
    challengeAvailable = true;
    setMode('challenge');
  }

  toggle.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submitButton.disabled = true;
    const fields = new FormData(form);
    try {
      await submitClue({
        receipt: String(fields.get('receipt') || '').trim(),
        platform: String(fields.get('platform') || '').trim(),
        signal: String(fields.get('signal') || '').trim()
      });
    } catch (error) {
      feedback.dataset.tone = 'error';
      feedback.textContent = error.status === 422 ? '记录未通过核验，请重新检查暂存帖。' : `提交失败：${error.message}`;
      await refreshState().catch(() => {});
    } finally {
      submitButton.disabled = Boolean(!state?.started || state?.expired || state?.solved);
    }
  });

  function setMode(mode) {
    if (overlay.dataset.mode === mode) return;
    overlay.dataset.mode = mode;
    overlay.querySelector('.forum-bridge-side').hidden = mode !== 'challenge';
  }
  setMode('phone');
  window.MygoForumBridge = { open, close, enableChallenge, startChallenge, refreshState, submitClue, setMode, watchChallenge };
})();
