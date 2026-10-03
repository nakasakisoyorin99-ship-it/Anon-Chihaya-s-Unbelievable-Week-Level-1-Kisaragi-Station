/* global monogatari */
'use strict';
(() => {
  let mounted = false;
  let unlocking = null;
  let preview = null;
  let panel;
  let status;

  function note(message) {
    if (status) status.textContent = message;
  }

  async function unlock() {
    const context = monogatari.audioContext;
    if (!context) { note('音频尚未初始化，请等待加载结束。'); return false; }
    if (context.state === 'closed') { note('音频输出已关闭，请刷新游戏。'); return false; }
    if (context.state === 'running') return true;
    if (!unlocking) {
      unlocking = context.resume().then(() => {
        const ready = context.state === 'running';
        if (!ready) note('浏览器未允许声音，请点击“开启声音并试听”。');
        return ready;
      }).catch(error => {
        note(`声音未启用：${error.message}`);
        return false;
      }).finally(() => { unlocking = null; });
    }
    return unlocking;
  }

  function stopPreview() {
    if (!preview) return;
    preview.pause();
    preview.removeAttribute('src');
    preview.load();
    preview = null;
  }

  function syncVolume(type, value) {
    const volume = { ...monogatari.preference('Volume') };
    volume[type === 'music' ? 'Music' : 'Sound'] = value;
    monogatari.preference('Volume', volume);
    for (const player of monogatari.mediaPlayers(type)) {
      window.MygoNativeAudio?.setVolume(player, value * Number(player.dataset?.volumePercentage ?? 100) / 100);
    }
    if (preview && type === 'music') preview.volume = value;
    const input = panel?.querySelector(`[data-volume="${type}"]`);
    if (input) { input.value = String(Math.round(value * 100)); input.nextElementSibling.textContent = input.value + '%'; }
  }

  async function previewMusic() {
    const volume = monogatari.preference('Volume').Music;
    const keys = Object.keys(monogatari.assets('music'));
    const key = panel.querySelector('.sound-music-select').value;
    if (!keys.includes(key)) { note('当前关卡未配置背景音乐。'); return; }
    stopPreview();
    const paths = monogatari.setting('AssetsPath');
    preview = new Audio(`${paths.root}/${paths.music}/${monogatari.asset('music', key)}`);
    preview.volume = volume;
    try {
      await preview.play();
      note(volume === 0 ? '音乐音量当前为0%，请调整“背景音乐音量”。' : '正在单独试听背景音乐，关闭此窗口停止试听。');
    } catch (error) { note(`背景音乐试听失败：${error.message}`); }
  }

  async function enableAndTest() {
    const volume = { ...monogatari.preference('Volume') };
    // 只在用户明确点“开启声音”时解除已保存的零音量，不每次刷新覆盖其设置。
    if (!(volume.Music > 0)) volume.Music = .8;
    if (!(volume.Sound > 0)) volume.Sound = .8;
    monogatari.preference('Volume', volume);
    syncVolume('music', volume.Music);
    syncVolume('sound', volume.Sound);
    stopPreview();
    window.MygoNativeAudio?.resumeFromGesture();
    // 原生HTMLAudio试听与引擎WebAudio并行解锁，必须在点击处理器中直接play。
    const sample = monogatari.asset('sounds', 'station_signal');
    if (!sample) { note('当前关卡未配置试听音效。'); await unlock(); return; }
    const paths = monogatari.setting('AssetsPath');
    preview = new Audio(`${paths.root}/${paths.sounds}/${sample}`);
    preview.volume = Math.min(1, volume.Sound);
    const playing = preview.play();
    const ready = await unlock();
    try {
      await playing;
      note(ready ? '声音已开启，正在试听三短一长。剧情配乐从对应场景开始。' : '试听已播放，但剧情音频仍未解锁。请再点击一次。');
    } catch (error) {
      note(`试听失败：${error.message}。请确认页面未被静音。`);
    }
  }

  window.MygoSound = {
    unlock,
    mount() {
      if (mounted) return;
      mounted = true;
      panel = document.createElement('dialog');
      panel.className = 'sound-control-panel';
      panel.innerHTML = '<h2>声音</h2><p>标题和开场对白没有背景音乐。空站风声、车厢轰鸣和配乐会随剧情进入。</p><button type="button" class="sound-enable">开启声音并试听</button><p class="sound-status" role="status" aria-live="polite"></p><audio class="sound-native-player" controls preload="none" aria-label="原生播放器试听"></audio><p class="sound-output-note">试听正常播放但没有声音时，请检查浏览器标签页静音、Windows 音量混合器中浏览器／ZCode 的音量，以及耳机输出设备。</p><form method="dialog"><button>关闭</button></form>';
      document.body.append(panel);
      status = panel.querySelector('.sound-status');
      const sample = monogatari.asset('sounds', 'station_signal');
      const paths = monogatari.setting('AssetsPath');
      if (sample) panel.querySelector('audio').src = `${paths.root}/${paths.sounds}/${sample}`;
      const mixer = document.createElement('section');
      mixer.className = 'sound-mixer';
      mixer.innerHTML = '<label>背景音乐音量<input type="range" min="0" max="100" step="1" data-volume="music"><output></output></label><label>音效音量<input type="range" min="0" max="100" step="1" data-volume="sound"><output></output></label><label>单独试听背景音乐<select class="sound-music-select"></select></label><button type="button" class="sound-music-preview">试听背景音乐</button><button type="button" class="sound-preview-stop">停止试听</button>';
      panel.insertBefore(mixer, panel.querySelector('.sound-enable'));
      const choice = mixer.querySelector('select');
      for (const [key, path] of Object.entries(monogatari.assets('music'))) {
        const option = document.createElement('option');
        option.value = key; option.textContent = path.split('/').pop().replace(/\.mp3$/i, '');
        choice.append(option);
      }
      mixer.querySelector('.sound-music-preview').addEventListener('click', previewMusic);
      mixer.querySelector('.sound-preview-stop').addEventListener('click', () => { stopPreview(); note('已停止试听，剧情音轨保持原样。'); });
      for (const input of mixer.querySelectorAll('input')) input.addEventListener('input', () => syncVolume(input.dataset.volume, Number(input.value) / 100));
      panel.querySelector('.sound-enable').addEventListener('click', enableAndTest);
      panel.addEventListener('close', () => { stopPreview(); panel.querySelector('audio').pause(); });
      for (const tag of ['main-screen', 'game-screen']) {
        const button = document.createElement('button');
        button.className = 'sound-control-toggle';
        button.type = 'button';
        button.textContent = '声音 · 开启 / 试听';
        button.addEventListener('click', event => {
          event.stopPropagation();
          const context = monogatari.audioContext;
          const volume = monogatari.preference('Volume');
          note(`音频：${context?.state || '未初始化'}；音乐 ${Math.round(volume.Music * 100)}%，音效 ${Math.round(volume.Sound * 100)}%。`);
          for (const input of panel.querySelectorAll('[data-volume]')) {
            const value = volume[input.dataset.volume === 'music' ? 'Music' : 'Sound'];
            input.value = String(Math.round(value * 100));
            input.nextElementSibling.textContent = input.value + '%';
          }
          panel.showModal();
          unlock();
        });
        document.querySelector(tag)?.append(button);
      }
      // 页面恢复、读档后再次点击时也恢复输出；在手势捕获阶段调用，早于异步剧情执行。
      window.addEventListener('mygo:audio-error', event => { note(event.detail.message); });
      document.addEventListener('pointerdown', () => { unlock(); }, { capture: true });
      document.addEventListener('keydown', event => {
        if (!event.repeat && (['Space', 'Enter'].includes(event.code) || event.key === 'Control')) unlock();
      }, { capture: true });
      document.addEventListener('click', event => {
        if (event.target.closest('[data-action="start"]')) { stopPreview(); unlock(); }
      }, { capture: true });
    }
  };
})();
