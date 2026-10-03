/* global monogatari */
'use strict';
(() => {
  const config = window.MygoChapterConfig;
  if (!config?.bridgeName) return;
  // 记录仅来自父桥重新核验的服务端成功快照；不把 FLAG 固化进剧情脚本。
  window.MygoChapterReceipt = {
    show(state) {
      let card = document.getElementById('chapter-receipt');
      if (!card) {
        card = document.createElement('section'); card.id = 'chapter-receipt'; card.hidden = true;
        card.setAttribute('aria-label', '送到爱音平板的登记行');
        const heading = document.createElement('h2'); heading.textContent = '登记行已送达'; card.append(heading);
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '收起登记，继续应答';
        close.addEventListener('click', () => { card.hidden = true; }); card.append(close);
        document.querySelector('game-screen').append(card);
      }
      card.querySelectorAll('dl').forEach(node => node.remove());
      const dl = document.createElement('dl');
      for (const [label, value] of [['线路', state.record.number], ['登记年份', state.record.retired_on], ['处置登记', state.record.disposition], ['无署名补充', state.record.supplement], ['核验字符串', state.notice]]) {
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = value; dl.append(dt, dd);
      }
      card.append(dl); card.hidden = false;
    }
  };
  class ReceiptLock extends monogatari.action('Conditional') {
    static id = 'ChapterReceiptLock';
    static matchObject() { return false; }
    static async shouldProceed() {
      if (document.querySelector('#chapter-receipt:not([hidden])')) throw new Error('先收起登记再继续应答');
    }
    static async reset() { const card = document.getElementById('chapter-receipt'); if (card) card.hidden = true; }
    static async onLoad() {
      await this.reset();
      if (monogatari.state('label') === 'Success') {
        try {
          const state = await window.MygoLineBridge.refreshState();
          if (state.solved) window.MygoChapterReceipt.show(state);
        } catch { /* 断线不阻止存档加载；题目桥重连后仍可重新查看登记。 */ }
      }
    }
  }
  monogatari.registerAction(ReceiptLock);
})();
