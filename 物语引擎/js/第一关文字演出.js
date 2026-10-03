/* global monogatari */
'use strict';

// 全屏段落由引擎对白动作管理，保持点击推进、对白记录和读档语义。
monogatari.setting('CenteredTypeAnimation', false);
class EmotionalDialog extends monogatari.action('Dialog') {
  static id = 'MygoEmotionalDialog';
  static matchString(args) { return /::vn-/.test(args[0] || ''); }
  async apply(options) {
    await super.apply(options);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.querySelector('text-box');
    const text = box?.querySelector('[data-ui="say"]');
    if (!text || this.id === 'centered') return;
    for (const animation of text.getAnimations()) animation.cancel();
    if (this.classes.includes('vn-shout') || this.classes.includes('vn-impact')) {
      const force = this.classes.includes('vn-shout') ? 5 : 3;
      text.animate([
        { transform: 'translate(0,0)' }, { transform: `translate(${-force}px,1px)` },
        { transform: `translate(${force}px,-1px)` }, { transform: `translate(${-force * .6}px,0)` },
        { transform: `translate(${force * .4}px,1px)` }, { transform: 'translate(0,0)' }
      ], { duration: 320, easing: 'ease-out' });
    } else if (this.classes.includes('vn-soft')) {
      text.animate([{ opacity: .25, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 600, easing: 'ease-out' });
    } else if (this.classes.includes('vn-tense')) {
      text.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    }
  }
}
monogatari.registerAction(EmotionalDialog);


class StageCue extends monogatari.action('Function') {
  static id = 'MygoStageCue';
  static matchObject(statement) { return Boolean(statement.StageCue); }
  static async setup() { this.engine.state({ stageMood: 'ordinary' }); }
  static surface() {
    let layer = document.querySelector('.story-atmosphere');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'story-atmosphere';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<div class="story-vignette"></div><div class="story-transient"></div><div class="story-rhythm"><i></i><i></i><i></i><i></i></div><div class="story-signal"><i></i><i></i><i></i><i></i><span></span></div>';
      document.querySelector('game-screen')?.append(layer);
    }
    return layer;
  }
  static paint(mood, effect = 'none') {
    const layer = StageCue.surface();
    layer.dataset.mood = mood;
    layer.querySelectorAll('*').forEach(element => element.getAnimations().forEach(animation => animation.cancel()));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const flash = layer.querySelector('.story-transient');
    const pulse = (frames, duration) => { if (!reduce) flash.animate(frames, { duration, easing: 'ease-out' }); };
    if (effect === 'loop') {
      pulse([{ opacity: 0, background: '#101522' }, { opacity: .85, offset: .35, background: '#101522' }, { opacity: 0, background: '#101522' }], 600);
    } else if (effect === 'arrival' || effect === 'passing') {
      pulse([{ opacity: 0, transform: 'translateX(-100%)', background: 'linear-gradient(90deg,transparent,#d2dce94a,transparent)' }, { opacity: 1, offset: .4 }, { opacity: 0, transform: 'translateX(100%)' }], effect === 'arrival' ? 1500 : 650);
    } else if (effect === 'blackout') {
      pulse([{ opacity: 0, background: '#020611' }, { opacity: .7, offset: .3 }, { opacity: 0 }], 1000);
    } else if (effect === 'notice' || effect === 'shutter') {
      pulse([{ opacity: 0, background: '#edf2ff' }, { opacity: effect === 'shutter' ? .65 : .12, offset: .1 }, { opacity: 0 }], effect === 'shutter' ? 450 : 700);
    } else if (effect === 'rhythm') {
      layer.querySelectorAll('.story-rhythm i').forEach((bar, i) => {
        if (!reduce) bar.animate([{ opacity: 0, transform: 'scaleY(.5)' }, { opacity: .85, offset: .25, transform: 'scaleY(1)' }, { opacity: 0 }], { duration: i === 3 ? 550 : 140, delay: i * 340, easing: 'ease-out' });
      });
    } else if (effect.startsWith('signal-')) {
      const signal = layer.querySelector('.story-signal');
      const levels = effect === 'signal-restored' ? 4 : effect === 'signal-one' ? 1 : 0;
      signal.querySelector('span').textContent = levels === 4 ? '信号恢复' : levels === 1 ? '收到消息' : '无服务';
      signal.querySelectorAll('i').forEach((bar, i) => { bar.style.opacity = i < levels ? '1' : '.2'; });
      if (!reduce) signal.animate([{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .7 }, { opacity: 0 }], { duration: 2000 });
    }
  }
  static async reset() { this.engine.state({ stageMood: 'ordinary' }); StageCue.paint('ordinary'); }
  static async onLoad() { StageCue.paint(this.engine.state('stageMood') || 'ordinary'); }
  constructor(statement) { super({ Function: {} }); this.cue = statement.StageCue; }
  async apply() {
    this.engine.state({ stageMood: this.cue.mood });
    StageCue.paint(this.cue.mood, this.cue.effect);
  }
  async didApply() { return { advance: true }; }
}
monogatari.registerAction(StageCue);
