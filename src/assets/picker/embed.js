(() => {
  const button = document.getElementById('choose');
  const status = document.getElementById('status');
  const configuredOrigin = new URLSearchParams(location.search).get('origin');
  let hostOrigin;
  try {
    const host = new URL(configuredOrigin);
    if (configuredOrigin !== host.origin ||
        !(host.protocol === 'https:' || (host.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname))) ||
        window.parent === window) throw new Error();
    hostOrigin = host.origin;
  } catch {
    status.textContent = '请在宿主网页中配置并打开选择器。';
    return;
  }

  let popup;
  let nonce;
  let closeCheck;
  let connected = false;
  const send = (type, fields = {}) => window.parent.postMessage({ type, version: 1, ...fields }, hostOrigin);
  const finish = (message) => {
    clearInterval(closeCheck);
    popup = undefined;
    nonce = undefined;
    button.disabled = false;
    status.textContent = message;
  };

  window.addEventListener('message', event => {
    if (event.data?.version !== 1) return;
    if (event.source === window.parent && event.origin === hostOrigin && event.data.type === 'pocklo.picker.init') {
      if (connected) return;
      connected = true;
      button.disabled = false;
      status.textContent = '选择文件、链接或文件夹';
      return;
    }
    if (!popup || event.source !== popup || event.origin !== location.origin || event.data.nonce !== nonce) return;
    if (event.data.type === 'pocklo.picker.connect') {
      popup.postMessage({ type: 'pocklo.picker.connected', version: 1, nonce, hostOrigin }, location.origin);
    } else if (event.data.type === 'pocklo.picker.selected') {
      let share;
      try { share = new URL(event.data.url); } catch { return; }
      if (share.origin !== location.origin || !/^\/share\/[a-f\d-]{36}$/i.test(share.pathname) || share.search || share.hash) return;
      send('pocklo.picker.selected', { url: share.href });
      finish('分享链接已交给当前网页');
    } else if (event.data.type === 'pocklo.picker.cancelled') {
      send('pocklo.picker.cancelled');
      finish('已取消选择');
    }
  });

  button.addEventListener('click', () => {
    nonce = crypto.randomUUID();
    const url = new URL('../../picker/select', location.href);
    url.searchParams.set('request', nonce);
    popup = window.open(url.href, 'pocklo-picker-' + nonce, 'popup,width=580,height=700');
    if (!popup) {
      status.textContent = '请允许当前网页打开小兜窗口，再重试。';
      send('pocklo.picker.error', { code: 'popup_blocked' });
      return;
    }
    button.disabled = true;
    status.textContent = '请在小兜窗口内完成选择';
    closeCheck = window.setInterval(() => {
      if (!popup?.closed) return;
      // A result already sent before closing can still be queued.
      window.setTimeout(() => {
        if (!popup?.closed) return;
        send('pocklo.picker.cancelled');
        finish('小兜窗口已关闭');
      }, 300);
    }, 800);
  });

  send('pocklo.picker.ready');
})();
