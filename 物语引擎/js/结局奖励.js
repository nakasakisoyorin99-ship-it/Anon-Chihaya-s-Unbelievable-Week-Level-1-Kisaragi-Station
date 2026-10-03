/* global monogatari */
'use strict';
(() => {
  async function api(path, body) {
    const response = await fetch('/api/game/' + path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    });
    const value = await response.json();
    if (!response.ok) throw Object.assign(new Error(value.error || '请求失败'), { status: response.status });
    return value;
  }
  async function retrying(operation) {
    for (;;) {
      try { return await operation(); }
      catch (error) {
        if (error.status === 403 || error.status === 409) {
          const errorPanel = document.createElement('dialog');
          errorPanel.className = 'ending-reward';
          errorPanel.innerHTML = '<h2>结局核验未通过</h2><p>请从当前会话的成功剧情继续，不能跳过结局节点。服务重启导致会话丢失时，需要重新完成本关。</p><form method="dialog"><button>重新核验</button></form>';
          document.body.append(errorPanel);
          errorPanel.showModal();
          await new Promise(resolve => errorPanel.addEventListener('close', resolve, { once: true }));
          errorPanel.remove();
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  window.MygoEnding = {
    async checkpoint(step) {
      await retrying(async () => {
        const progress = await api('ending');
        // 已验证节点的读档重播不回退服务端进度；跳过节点则拒绝。
        if (progress.step >= step) return;
        if (progress.step !== step - 1) throw new Error('ending_out_of_order');
        await api('ending', { step, token: progress.token });
      });
      return true;
    },
    async reward() {
      const reward = await retrying(async () => {
        const progress = await api('ending');
        return api('reward', { token: progress.token });
      });
      let panel = document.querySelector('.ending-reward');
      if (!panel) {
        panel = document.createElement('dialog');
        panel.className = 'ending-reward';
        panel.innerHTML = '<h2>第一话 · 已完成</h2><p>返程故事已结束。以下 FLAG 可提交到比赛平台。</p><input aria-label="比赛 FLAG" readonly><form method="dialog"><button>返回标题</button></form>';
        document.body.append(panel);
      }
      panel.querySelector('input').value = reward.flag;
      panel.showModal();
      await new Promise(resolve => panel.addEventListener('close', resolve, { once: true }));
      panel.querySelector('input').value = '';
      return true;
    }
  };
})();
