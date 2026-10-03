/* global monogatari */
'use strict';

// 当前章节仅有中文内容，兼容旧存档里保存的 English 界面语言。
const chapterInterfaceStrings = {
  Start: '开始故事', Load: '读取存档', Save: '保存进度', Settings: '设置', Help: '帮助',
  Hide: '隐藏', Show: '显示', Log: '回看', AutoPlay: '自动', Quit: '返回标题',
  StartButton: '开始故事', LoadButton: '读取存档', SaveButton: '保存进度',
  SettingsButton: '打开设置', HideButton: '隐藏对话框', DialogLogButton: '回看对白',
  AutoPlayButton: '切换自动阅读', QuitButton: '返回标题',
  Close: '关闭', Cancel: '取消', Confirm: '确定返回标题吗？', OK: '确定',
  NoDialogsAvailable: '阅读过的对白会显示在这里。',
  QuickMenu: '快捷菜单', Credits: '制作名单', Gallery: '回忆',
  SelectYourLanguage: '选择界面语言', KeyboardShortcuts: '键盘快捷键',
  Skip: '快进', SkipButton: '切换快进', Video: '视频音量'
};
for (const language of ['English', '简体中文']) {
  monogatari.translation(language, chapterInterfaceStrings);
}

window.MygoReadingControls = {
  mount() {
    if (document.querySelector('.hold-speed-control')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hold-speed-control';
    button.textContent = '按住加速 · Ctrl';
    button.setAttribute('aria-label', '按住加速，松开恢复，也可按住 Ctrl');
    button.setAttribute('aria-pressed', 'false');
    document.querySelector('game-screen').append(button);
    let timer = null;
    let held = false;
    let busy = false;
    const eligible = () => {
      const target = document.activeElement;
      return monogatari.global('playing') && document.querySelector('game-screen')?.classList.contains('active') &&
        !target?.matches('input,textarea,select,[contenteditable="true"]') &&
        !document.querySelector((window.MygoChapterConfig?.panelSelector || '.forum-bridge') + ':not([hidden])') && !document.querySelector('dialog[open]') &&
        !document.querySelector('choice-container');
    };
    const stop = () => {
      held = false;
      clearTimeout(timer);
      timer = null;
      button.setAttribute('aria-pressed', 'false');
    };
    const tick = async () => {
      if (!held) return;
      if (!eligible()) { stop(); return; }
      if (!busy) {
        busy = true;
        try {
          await monogatari.proceed({ userInitiated: false, skip: true, autoPlay: false });
        } catch { /* 选择、调查等待及异步动作仍由引擎阻塞，不直接修改脚本位置。 */ }
        finally { busy = false; }
      }
      if (held) timer = setTimeout(tick, 120);
    };
    const start = () => {
      if (held || !eligible()) return;
      held = true;
      monogatari.autoPlay(false);
      button.setAttribute('aria-pressed', 'true');
      timer = setTimeout(tick, 300);
    };
    window.addEventListener('keydown', event => {
      if (event.key === 'Control' && !event.repeat) start();
    });
    window.addEventListener('keyup', event => { if (event.key === 'Control') stop(); });
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      start();
    });
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    button.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); start(); }
    });
    button.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); stop(); }
    });
    window.MygoReadingControls.stop = stop;
  }
};

window.MygoTitle = {
  mount() {
    const screen = document.querySelector('main-screen');
    if (!screen || screen.querySelector('.title-composition')) return;
    const composition = document.createElement('section');
    composition.className = 'title-composition';
    composition.setAttribute('aria-label', '千早愛音の不思議な一週');
    composition.innerHTML = `
      <div class="title-kicker"><span></span> MyGO!!!!! FAN VISUAL NOVEL</div>
      <h1 class="title-logo"><img src="./assets/ui/标题界面/千早愛音の不思議な一週_logo_v2.png" alt="千早愛音の不思議な一週"></h1>
      <div class="title-episode-art"><img src="${window.MygoChapterConfig?.titleImage || './assets/ui/标题界面/第一话_如月车站_小标题_v2_单行.png'}" alt="${window.MygoChapterConfig?.title || '第一话 · 如月车站'}"></div>
      <div class="title-staff-note">同人视觉小说 · 非官方作品</div>`;
    screen.append(composition);
  }
};
