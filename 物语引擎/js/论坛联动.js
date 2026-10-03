// Forum UI stays outside Monogatari's script. Story code can call
// Scene 4 can call enableChallenge() / startChallenge(); listen for mygo:forum-clue-submitted.
(() => {
  const root = document.getElementById('forum-bridge-root');
  if (!root) return;

  const toggle = document.createElement('button');
  toggle.className = 'forum-bridge-toggle';
  toggle.type = 'button';
  toggle.textContent = '论坛调查';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');

  const overlay = document.createElement('section');
  overlay.className = 'forum-bridge';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="forum-bridge-dialog" role="dialog" aria-modal="true" aria-label="论坛调查">
      <header class="forum-bridge-header">
        <div><h2>论坛调查</h2><small>查阅记录后，把确认的返程信息交给爱音</small></div>
        <button class="forum-bridge-close" type="button" aria-label="关闭论坛调查">关闭 ×</button>
      </header>
      <div class="forum-bridge-body">
        <iframe title="如月车站论坛" src="/forum/#thread/26"></iframe>
        <aside class="forum-bridge-side">
          <h3>传递线索</h3>
          <p>论坛只能阅读。玩家找到版务暂存的记录后，在这里提交核验信息。</p>
          <div class="state" role="status">正在读取挑战状态……</div>
          <button class="start" type="button" hidden>开启限时调查</button>
          <form class="clue-form">
            <label>核验字符串<input name="flag" autocomplete="off" spellcheck="false" required></label>
            <label>返程站台<input name="platform" inputmode="numeric" autocomplete="off" required></label>
            <label>进站提示音<input name="signal" autocomplete="off" placeholder="例如：三短一长" required></label>
            <button class="submit" type="submit">把信息交给爱音</button>
          </form>
          <p class="hint">核验由服务端完成；提交成功后关闭调查面板，继续看两人核对路线。</p>
          <details><summary>提示一</summary><p>保存资料的那条请求，会把你填的东西都带上。看看除了昵称和简介，它还接受了什么。</p></details>
          <details><summary>提示二</summary><p>服务器对多出来的字段照单全收。试试把身份写成 admin。</p></details>
          <details><summary>提示三</summary><p>报告里要交给游戏的是三样：站台、提示音、还有那串 FLAG。</p></details>
          <p class="feedback" role="status" aria-live="polite"></p>
        </aside>
      </div>
    </div>`;

  root.append(toggle, overlay);
  const closeButton = overlay.querySelector('.forum-bridge-close');
  const stateNode = overlay.querySelector('.state');
  const startButton = overlay.querySelector('.start');
  const form = overlay.querySelector('.clue-form');
  const submitButton = overlay.querySelector('.submit');
  const feedback = overlay.querySelector('.feedback');
  let lastFocus = null;
  let state = null;
  let polling = null;
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
    if (!value) return '挑战状态暂不可用。请从第一关论坛服务打开游戏。';
    if (value.solved) return '已把返程信息交给爱音。';
    if (value.expired) return '返程窗口已关闭。可以从检查点重试。';
    if (!value.started) return '正在阅读论坛；限时调查尚未开始。';
    const seconds = Math.ceil(value.remainingMs / 1000);
    return `剩余时间：${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateState(value) {
    state = value;
    stateNode.textContent = stateText(value);
    startButton.hidden = true;
    overlay.querySelectorAll('details').forEach(node => { node.hidden = !challengeAvailable; });
    startButton.textContent = value?.expired ? '从检查点重试' : '开启限时调查';
    submitButton.disabled = Boolean(!value?.started || value?.expired || value?.solved);
  }

  async function refreshState() {
    try {
      updateState(await request('state'));
      return state;
    } catch (error) {
      updateState(null);
      feedback.dataset.tone = 'error';
      feedback.textContent = '游戏服务暂不可用。请运行第一关的论坛服务。';
      throw error;
    }
  }

  async function startChallenge() {
    if (!challengeAvailable) throw new Error('限时调查尚未开放');
    const value = await request(state?.expired ? 'retry' : 'start', { method: 'POST' });
    updateState(value);
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
        detail: { route: result.clue, notice: result.notice }
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
    polling = window.setInterval(() => refreshState().catch(() => {}), 3000);
  }

  function close() {
    overlay.hidden = true;
    toggle.hidden = false;
    toggle.setAttribute('aria-expanded', 'false');
    if (polling) window.clearInterval(polling);
    polling = null;
    (lastFocus?.isConnected ? lastFocus : toggle).focus();
  }

  function enableChallenge() {
    challengeAvailable = true;
    startButton.hidden = true;
  }

  toggle.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  startButton.addEventListener('click', async () => {
    startButton.disabled = true;
    try { await startChallenge(); }
    catch (error) {
      feedback.dataset.tone = 'error';
      feedback.textContent = `无法开始：${error.message}`;
    } finally { startButton.disabled = false; }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submitButton.disabled = true;
    const fields = new FormData(form);
    try {
      await submitClue({
        flag: String(fields.get('flag') || '').trim(),
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

  window.MygoForumBridge = { open, close, enableChallenge, startChallenge, refreshState, submitClue };
})();
