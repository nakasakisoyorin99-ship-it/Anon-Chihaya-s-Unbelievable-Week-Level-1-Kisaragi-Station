/* global monogatari */
'use strict';
(() => {
  const waiting = new Set();
  let unlocked = false;
  function signalError(error) {
    window.dispatchEvent(new CustomEvent('mygo:audio-error', { detail: { message: error.message || '音频加载失败' } }));
  }
  function stopFade(player) {
    clearTimeout(player._fadeTimer);
    player._fadeTimer = null;
  }
  function fade(player, duration, target) {
    stopFade(player);
    const initial = player.volume;
    const start = performance.now();
    const tick = () => {
      const fraction = Math.min(1, (performance.now() - start) / (duration * 1000));
      player.volume = initial + (target - initial) * fraction;
      if (fraction < 1) player._fadeTimer = setTimeout(tick, 40);
    };
    if (!(duration > 0)) { player.volume = target; return; }
    tick();
  }
  async function play(player) {
    try {
      await player.play();
      waiting.delete(player);
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        waiting.add(player);
        signalError(new Error('浏览器阻止了自动播放，请点击“声音”开启。'));
      } else { waiting.delete(player); signalError(error); }
    }
  }
  function dispose(type, key) {
    const player = monogatari.mediaPlayer(type, key);
    if (!player) return;
    waiting.delete(player);
    stopFade(player);
    monogatari.removeMediaPlayer(type, key);
  }
  function resumeFromGesture() {
    unlocked = true;
    for (const player of [...waiting]) play(player);
    if (waiting.size === 0) {
      for (const type of ['music', 'sound']) {
        for (const item of monogatari.state(type) || []) {
          const key = item.statement.split(' ')[2];
          const player = monogatari.mediaPlayer(type, key);
          if (player?.dataset.nativeAudio && player.paused && !player.ended && !item.paused) play(player);
        }
      }
    }
  }
  document.addEventListener('pointerdown', resumeFromGesture, { capture: true });
  document.addEventListener('keydown', event => { if (!event.repeat) resumeFromGesture(); }, { capture: true });

  class NativePlay extends monogatari.action('Play') {
    static id = 'MygoNativePlay';
    static matchString([action, type]) { return action === 'play' && ['music', 'sound'].includes(type); }
    // 原生Play仍负责全局媒体初始化、设置与读档；避免子类重复绑定相同生命周期。
    static async setup() {}
    static async bind() {}
    static async init() {}
    static async onLoad() {
      // 旧存档若没有音乐状态，按章节配置恢复；已含音轨的存档交给原生Play恢复，不重复播放。
      if ((this.engine.state('music') || []).length) return;
      let statement = window.MygoChapterConfig?.legacyMusicByLabel?.[this.engine.state('label')];
      const script = this.engine.script(this.engine.state('label')) || [];
      for (const item of script.slice(0, this.engine.state('step') + 1)) {
        if (typeof item !== 'string') continue;
        if (item.startsWith('play music ')) statement = item;
        else if (item.startsWith('stop music ')) statement = null;
      }
      if (!statement) return;
      const action = this.engine.prepareAction(statement, { cycle: 'Application' });
      await action.willApply();
      await action.apply();
      await action.didApply({ updateHistory: false });
    }
    static async reset() {
      waiting.clear();
      for (const type of ['music', 'sound']) {
        for (const player of monogatari.mediaPlayers(type)) stopFade(player);
      }
    }
    async apply({ paused = false } = {}) {
      const keys = this.mediaKey ? [this.mediaKey] : Object.keys(this.engine.mediaPlayers(this.type, true));
      for (const key of keys) {
        let player = this.engine.mediaPlayer(this.type, key);
        const percent = this.props.includes('volume') ? Number(this.props[this.props.indexOf('volume') + 1]) : Number(player?.dataset.volumePercentage || 100);
        const preferences = this.engine.preference('Volume');
        const volume = Math.max(0, Math.min(1, preferences[this.type === 'music' ? 'Music' : 'Sound'] * percent / 100));
        if (!player || !player.dataset.nativeAudio) {
          if (player) dispose(this.type, key);
          const paths = this.engine.setting('AssetsPath');
          player = new Audio(`${paths.root}/${paths[this.directory]}/${this.media}`);
          player.preload = 'auto';
          player.dataset.nativeAudio = 'true';
          this.engine.mediaPlayer(this.type, key, player);
          player.addEventListener('error', () => signalError(new Error('无法加载音频：' + this.media)));
          player.onended = () => {
            waiting.delete(player);
            const state = (this.engine.state(this.type) || []).filter(item => item.statement.split(' ')[2] !== key);
            this.engine.state({ [this.type]: state });
            dispose(this.type, key);
          };
        }
        this.player = player;
        if (this.type === 'sound' && !paused) player.currentTime = 0;
        stopFade(player);
        player.loop = this.props.includes('loop');
        player.muted = false;
        player.dataset.volumePercentage = String(percent);
        const duration = this.props.includes('fade') ? parseFloat(this.props[this.props.indexOf('fade') + 1]) : 0;
        player.volume = duration > 0 ? 0 : volume;
        if (paused) continue;
        if (unlocked) await play(player);
        else waiting.add(player);
        if (duration > 0) fade(player, duration, volume);
      }
    }
    async didApply(options = {}) {
      // 同一轨道只保存最后一条状态，避免调音或循环重入让读档重复开音轨。
      if (options.updateState !== false && this.mediaKey) {
        this.engine.state({ [this.type]: (this.engine.state(this.type) || []).filter(item => item.statement.split(' ')[2] !== this.mediaKey) });
      }
      return super.didApply(options);
    }
    async revert() { if (this.mediaKey) dispose(this.type, this.mediaKey); else await super.revert(); }
  }
  class NativeStop extends monogatari.action('Stop') {
    static id = 'MygoNativeStop';
    static matchString([action, type]) { return action === 'stop' && ['music', 'sound'].includes(type); }
    static async setup() {}
    static async bind() {}
    static async init() {}
    static async onLoad() {}
    static async reset() {}
    async apply() {
      // 停止时同步清理，不让淡出定时器在下一次播放后把音量写回零。
      const keys = this.media ? [this.media] : Object.keys(this.engine.mediaPlayers(this.type, true));
      for (const key of keys) dispose(this.type, key);
    }
  }
  monogatari.registerAction(NativePlay);
  monogatari.registerAction(NativeStop);
  function setVolume(player, volume) {
    stopFade(player);
    if (player.output?.gain) player.output.gain.cancelScheduledValues(monogatari.audioContext.currentTime);
    player.volume = Math.max(0, Math.min(1, volume));
  }
  window.MygoNativeAudio = { resumeFromGesture, setVolume };
})();
