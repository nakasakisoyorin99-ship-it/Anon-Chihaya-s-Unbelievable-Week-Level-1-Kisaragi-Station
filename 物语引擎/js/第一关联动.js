/* global monogatari */
'use strict';

// 通用章节运行时：关卡差异全部来自 关卡配置.json（生成器同步为 js/关卡配置.js）。
(() => {
  const CONFIG = window.MygoChapterConfig;
  if (!CONFIG) throw new Error('缺少关卡配置：js/关卡配置.js');

  if (CONFIG.bridgeName && CONFIG.bridgeName !== 'MygoForumBridge') {
    const target = window[CONFIG.bridgeName];
    if (!target) throw new Error('缺少配置的题目桥');
    window.MygoForumBridge = {
      open: () => target.open(), close: () => target.close(),
      refreshState: async () => {
        const value = await target.refreshState();
        window.dispatchEvent(new CustomEvent('mygo:challenge-state', { detail: value }));
        return value;
      },
      startChallenge: async ({ retry = false } = {}) => {
        if (retry && target.getState()?.expired) await target.retryChallenge();
        return target.startChallenge();
      },
      enableChallenge() {}, setMode() {}, watchChallenge() { target.enterP1(); }
    };
    window.addEventListener(CONFIG.bridgeStateEvent, event => {
      window.dispatchEvent(new CustomEvent('mygo:challenge-state', { detail: event.detail }));
    });
  }
  const panelSelector = CONFIG.panelSelector || '.forum-bridge';
  let phase = 'Start';
  let waitToken = 0;
  let reminders = new Set();
  let latest = null;
  let startError = null;
  let retryRequested = false;
  let chapterTitleUntil = 0;
  let challengeArmed = false;
  let terminalHandled = false;
  let starting = false;
  let startEpoch = 0;
  const root = document.createElement('aside');
  root.className = 'chapter-hud';
  root.hidden = true;
  root.innerHTML = '<span class="chapter-name"></span><button type="button" class="chapter-help">操作说明</button>';
  document.body.append(root);
  let objectiveVisible = false;
  const objective = document.createElement('p');
  objective.className = 'chapter-objective';
  objective.hidden = true;
  objective.textContent = CONFIG.objectiveText || '';
  objective.setAttribute('role', 'status');
  document.body.append(objective);
  const signage = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  signage.setAttribute('viewBox', '0 0 1920 1080');
  signage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  signage.classList.add('chapter-signage');
  signage.setAttribute('hidden', '');
  signage.innerHTML = `<image class="station-sign" href="${CONFIG.overlay.signageImage}" x="0" y="0" width="1920" height="1080" preserveAspectRatio="xMidYMid meet" aria-label="${CONFIG.overlay.signageLabel}"></image><text class="train-sign" x="910" y="122" text-anchor="middle" transform="rotate(-8 910 122)">${CONFIG.overlay.headSignText}</text>`;
  document.body.append(signage);
  const title = root.querySelector('.chapter-name');
  const names = CONFIG.sceneNames;
  const investigation = new Set(CONFIG.investigationLabels);
  const timed = new Set(CONFIG.timedLabels);

  const help = document.createElement('dialog');
  help.className = 'chapter-instructions';
  help.innerHTML = `<h2>幕外调查者</h2><div class="instructions-body"></div><form method="dialog"><button>继续故事</button></form>`;
  document.body.append(help);
  root.querySelector('.chapter-help').addEventListener('click', () => {
    const body = help.querySelector('.instructions-body');
    body.replaceChildren();
    const paragraphs = ['点击画面或按空格继续对白；存档、读档、设置与对白记录位于底部菜单。玩家在幕外调查，不替角色发帖。'];
    paragraphs.push('点击论坛地址可在新窗口打开；关闭手机画面后继续剧情。限时阶段在右侧提交你找到的信息。');
    for (const text of paragraphs) {
      const p = document.createElement('p'); p.textContent = text; body.append(p);
    }
    help.showModal();
  });

  function render() {
    const playing = Boolean(monogatari.global('playing')) && Boolean(document.querySelector('game-screen.active')) && !document.querySelector('loading-screen.active');
    root.hidden = !playing || !names[phase];
    objective.hidden = !playing || !objectiveVisible || !CONFIG.objectiveText || Boolean(latest?.located);
    document.body.dataset.chapterPhase = phase;
    window.MygoForumBridge.setMode?.(timed.has(phase) ? 'challenge' : 'phone');
    const scene = monogatari.state('scene') || '';
    const signVisible = playing && [...CONFIG.overlay.signageScenes, ...CONFIG.overlay.headSignScenes].some(name => scene.includes(name));
    if (signVisible) signage.removeAttribute('hidden');
    else signage.setAttribute('hidden', '');
    signage.querySelector('.station-sign').style.display = CONFIG.overlay.signageScenes.some(name => scene.includes(name)) ? '' : 'none';
    signage.querySelector('.train-sign').style.display = CONFIG.overlay.headSignScenes.some(name => scene.includes(name)) ? '' : 'none';
    title.textContent = names[phase] || '';
    title.hidden = Date.now() > chapterTitleUntil;
    root.querySelector('.chapter-help').hidden = !investigation.has(phase);
    document.body.dataset.chapterReading = playing ? 'true' : 'false';
    const toggle = document.querySelector('.forum-bridge-toggle');
    if (toggle) toggle.hidden = !playing || !investigation.has(phase) || !document.querySelector(panelSelector)?.hidden;
  }

  async function state() {
    latest = await window.MygoForumBridge.refreshState();
    startError = null;
    render();
    return latest;
  }

  async function begin() {
    objectiveVisible = false;
    ++startEpoch;
    gatePending = null;
    gateTransition = null;
    latest = null;
    retryRequested = false;
    starting = false;
    challengeArmed = false;
    terminalHandled = false;
    cancelWait();
    reminders = new Set();
    phase = CONFIG.startLabel;
    chapterTitleUntil = Date.now() + 4500;
    window.MygoForumBridge.close();
    render();
    return true;
  }

  function enter(label) {
    if (gateTransition && label !== gateTransition) gateTransition = null;
    if (gatePending && gatePending.label !== label) gatePending = null;
    if (label !== phase && CONFIG.storyLabels.includes(label)) chapterTitleUntil = Date.now() + 4500;
    phase = label;
    if (CONFIG.exitLabels.includes(label)) window.MygoForumBridge.close();
    render();
    return true;
  }

  async function start() {
    const epoch = ++startEpoch;
    starting = true;
    challengeArmed = true;
    terminalHandled = false;
    window.MygoForumBridge.enableChallenge();
    // 仅脚本推进到呼叫柱动作时调用；POST start在后端幂等。
    for (;;) {
      if (epoch !== startEpoch || !monogatari.global('playing')) { starting = false; return false; }
      try {
        const value = await window.MygoForumBridge.startChallenge({ retry: retryRequested });
        if (epoch !== startEpoch || !monogatari.global('playing')) { starting = false; return false; }
        latest = value;
        retryRequested = false;
        startError = null;
        break;
      } catch (error) {
        startError = error;
        try {
          const value = await window.MygoForumBridge.refreshState();
          if (epoch !== startEpoch || !monogatari.global('playing')) { starting = false; return false; }
          if (value.started && (!retryRequested || !value.expired)) {
            latest = value; retryRequested = false; startError = null; break;
          }
        } catch { /* 等待重连，不从论坛操作触发start。 */ }
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    }
    phase = 'ChallengeIntro';
    window.MygoForumBridge.open();
    render();
    starting = false;
    if (latest?.solved || latest?.expired) {
      setTimeout(settleTerminal, 0);
      return false;
    }
    return true;
  }

  function resultFor(value) {
    if (!value) return null;
    if (value.solved) return 'Success';
    if (value.expired) return 'BadEnd';
    for (const label of ['Reminder120', 'Reminder60']) {
      if (value[label] && !reminders.has(label)) { reminders.add(label); return label; }
    }
    return null;
  }

  async function wait() {
    phase = 'ChallengeWait';
    window.MygoForumBridge.enableChallenge();
    window.MygoForumBridge.watchChallenge();
    window.MygoForumBridge.open();
    const token = ++waitToken;
    let value = latest;
    try { value = await state(); } catch { /* 监听器继续接收下一次成功状态。 */ }
    const immediate = resultFor(value);
    if (token !== waitToken) return null;
    if (immediate) { window.MygoForumBridge.close(); return immediate; }
    return new Promise(resolve => { pendingWait = { token, resolve }; });
  }
  let pendingWait = null;
  function cancelWait() {
    waitToken++;
    if (pendingWait) { pendingWait.resolve(null); pendingWait = null; }
  }

  async function retry() {
    ++startEpoch;
    starting = false;
    challengeArmed = false;
    terminalHandled = false;
    cancelWait();
    gatePending = null;
    gateTransition = null;
    retryRequested = true;
    reminders = new Set();
    window.MygoForumBridge.enableChallenge();
    // 配有阶段门的章节先清空过期轮，再重新做前段调查；此处不启动计时。
    if (CONFIG.bridgeName) {
      const target = window[CONFIG.bridgeName];
      target.enterP1();
      const value = await target.refreshState();
      if (value.expired) await target.retryChallenge();
      retryRequested = false;
    }
    latest = null;
    startError = null;
    window.MygoForumBridge.close();
    return true;
  }

  window.addEventListener('mygo:forum-clue-submitted', () => { state().catch(() => {}); });
  window.MygoChapter = { begin, enter, start, wait, retry,
    showObjective() { objectiveVisible = true; window[CONFIG.bridgeName]?.enterP1(); render(); return true; }
  };

  let gatePending = null;
  let gateTransition = null;
  class ChapterGate extends monogatari.action('Conditional') {
    static id = 'MygoChapterGate';
    static async shouldProceed() {
      const label = monogatari.state('label');
      const restored = Object.values(CONFIG.gates || {}).some(gate => gate.label === label);
      if (gatePending || (restored && gateTransition !== label)) throw new Error('等待服务端阶段核验');
    }
    static async reset() { gatePending = null; gateTransition = null; }
    static async onLoad() { ++startEpoch; starting = false; gatePending = null; gateTransition = null; latest = null; }
    constructor(statement) { super({ Conditional: {} }); this.gate = statement.ChapterGate; }
    static matchObject(statement) { return Boolean(statement.ChapterGate); }
    async apply() {
      const definition = CONFIG.gates[this.gate];
      window[CONFIG.bridgeName].enterP1();
      window[CONFIG.bridgeName].open();
      gatePending = { ...definition, label: this.engine.state('label') };
      checkGate();
    }
    async didApply() { return { advance: false }; }
  }
  if (CONFIG.gates) monogatari.registerAction(ChapterGate);
  function checkGate() {
    if (!CONFIG.gates || !monogatari.global('playing') || !latest) return;
    const label = monogatari.state('label');
    const restored = Object.values(CONFIG.gates).find(gate => gate.label === label);
    const gate = gatePending || restored;
    if (!gate || gate.label !== label || gateTransition === label) return;
    // 读回旧检查点时，服务器当前轮的结果优先，不再卡在 canStart=false 的门前。
    const destination = gate.resumeAttempt && latest.started
      ? (latest.solved ? 'Success' : latest.expired ? 'BadEnd' : 'ChallengeWait')
      : latest[gate.field] ? gate.destination : null;
    if (!destination) return;
    gateTransition = label;
    gatePending = null;
    if (gate.resumeAttempt && latest.started) {
      challengeArmed = true;
      terminalHandled = Boolean(latest.solved || latest.expired);
    }
    window.MygoReadingControls?.stop?.();
    window.MygoForumBridge.close();
    monogatari.run('jump ' + destination);
  }
  class Investigation extends monogatari.action('Conditional') {
    static id = 'MygoInvestigation';
    static blocking = false;
    static matchObject(statement) { return Boolean(statement.MygoInvestigation); }
    static async shouldProceed() {
      if (Investigation.blocking || (CONFIG.gates && monogatari.state('label') === 'ChallengeWait')) throw new Error('等待服务端核验调查结果');
      const panel = document.querySelector(panelSelector);
      if ((panel && !panel.hidden) || help.open) throw new Error('调查面板打开时不推进对白');
    }
    static async reset() { cancelWait(); Investigation.blocking = false; }
    static async onLoad() { cancelWait(); Investigation.blocking = false; }
    constructor() { super({ Conditional: {} }); }
    async apply() {
      Investigation.blocking = true;
      wait().then(result => {
        Investigation.blocking = false;
        if (result) this.engine.run(`jump ${result}`);
      }).catch(() => {
        // 网络中断只重连状态查询，不重启计时。
        window.MygoForumBridge.watchChallenge();
      });
    }
    async didApply() { return { advance: false }; }
  }
  monogatari.registerAction(Investigation);

  function settleTerminal() {
    if (starting || terminalHandled || !challengeArmed || !monogatari.global('playing') || !latest?.started || (!latest.solved && !latest.expired)) return false;
    terminalHandled = true;
    const destination = latest.solved ? 'Success' : 'BadEnd';
    cancelWait();
    Investigation.blocking = false;
    window.MygoReadingControls?.stop?.();
    if (help.open) help.close();
    window.MygoForumBridge.close();
    phase = destination;
    render();
    monogatari.run(`jump ${destination}`);
    return true;
  }
  window.addEventListener(CONFIG.bridgeStateEvent || 'mygo:challenge-state', event => {
    latest = event.detail;
    if (latest?.started && !retryRequested && ((phase === CONFIG.armedLabel) || timed.has(phase))) challengeArmed = true;
    checkGate();
    if (settleTerminal()) return;
    if (!monogatari.global('playing') || !timed.has(monogatari.state('label'))) return;
    if (pendingWait) {
      const result = resultFor(latest);
      if (result) {
        const active = pendingWait; pendingWait = null;
        window.MygoForumBridge.close();
        active.resolve(result);
      }
    }
  });

  render();
  let lastRenderKey = '';
  // 读档恢复时以引擎标签为准，不能用浏览器时间恢复或重置服务端倒计时。
  setInterval(() => {
    const label = monogatari.state('label');
    if (names[label] && label !== phase) phase = label;
    if (!retryRequested && ((phase === CONFIG.armedLabel) || timed.has(phase)) && latest?.started) challengeArmed = true;
    if (CONFIG.bridgeName) {
      const bridge = window[CONFIG.bridgeName];
      if (monogatari.global('playing') && investigation.has(phase)) bridge.enterP1();
      else bridge.leaveP1();
    }
    settleTerminal();
    checkGate();
    const key = [phase, monogatari.state('scene'), monogatari.global('playing'), Boolean(document.querySelector('game-screen.active')), Boolean(document.querySelector('loading-screen.active')), document.querySelector(panelSelector)?.hidden, Date.now() > chapterTitleUntil].join('|');
    if (key !== lastRenderKey) { lastRenderKey = key; render(); }
  }, 1000);
})();
