/**
 * Key2lix AI Chat Widget — تشات بوت الدعم واختيار المنتجات
 */
(function () {
  function init() {
    var cfg = window.Key2lixConfig;
    if (!cfg || !cfg.aiEnabled) return;
    if (document.getElementById('key2lix-ai-chat')) return;

  var open = false;
  var messages = [];

  var widget = document.createElement('div');
  widget.id = 'key2lix-ai-chat';
  widget.innerHTML = `
    <button type="button" id="key2lix-chat-toggle" class="key2lix-chat-toggle" aria-label="فتح مساعد الدعم">
      <i class="fas fa-comments"></i>
    </button>
    <div id="key2lix-chat-backdrop" class="key2lix-chat-backdrop" aria-hidden="true" style="display:none;"></div>
    <div id="key2lix-chat-panel" class="key2lix-chat-panel" hidden>
      <div class="key2lix-chat-header" data-close="1">
        <span><i class="fas fa-robot"></i> مساعد Key2lix</span>
        <button type="button" class="key2lix-chat-close" aria-label="إغلاق" data-close="1"><span aria-hidden="true">×</span></button>
      </div>
      <div class="key2lix-chat-messages"></div>
      <div class="key2lix-chat-input-wrap">
        <input type="text" id="key2lix-chat-input" class="key2lix-chat-input" placeholder="اكتب سؤالك..." maxlength="500">
        <button type="button" id="key2lix-chat-send" class="key2lix-chat-send" aria-label="إرسال"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    #key2lix-ai-chat { position: fixed; bottom: calc(16px + env(safe-area-inset-bottom)); left: max(16px, env(safe-area-inset-left)); z-index: 99999; font-family: inherit; }
    @media (max-width: 768px) {
      #key2lix-ai-chat { bottom: calc(12px + env(safe-area-inset-bottom)); left: max(12px, env(safe-area-inset-left)); }
    }
    .key2lix-chat-backdrop { position: fixed; inset: 0; background: transparent; z-index: 99998; cursor: pointer; }
    .key2lix-chat-toggle {
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      border: none; color: #fff; cursor: pointer; box-shadow: 0 4px 20px rgba(124,58,237,0.5);
      display: flex; align-items: center; justify-content: center; font-size: 1.4rem;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .key2lix-chat-toggle:hover { transform: scale(1.05); box-shadow: 0 6px 28px rgba(124,58,237,0.6); }
    .key2lix-chat-panel {
      position: absolute; bottom: 70px; left: 0; z-index: 99999;
      width: 360px; max-width: calc(100vw - 48px); max-height: 480px;
      background: #1e1e2e; border-radius: 16px; border: 1px solid rgba(124,58,237,0.3);
      box-shadow: 0 12px 48px rgba(0,0,0,0.5); display: flex; flex-direction: column;
    }
    .key2lix-chat-panel[hidden] { display: none !important; }
    .key2lix-chat-header {
      padding: 14px 16px; background: linear-gradient(90deg, rgba(124,58,237,0.3) 0%, transparent 100%);
      border-radius: 16px 16px 0 0; display: flex; justify-content: space-between; align-items: center;
      color: #e2e8f0; font-weight: 600; font-size: 0.95rem; flex-shrink: 0;
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
    }
    .key2lix-chat-close { background: none; border: none; color: #94a3b8; cursor: pointer; padding: 8px 12px; font-size: 1rem; position: relative; z-index: 10; flex-shrink: 0; min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; }
    .key2lix-chat-close:hover { color: #fff; }
    .key2lix-chat-close span { pointer-events: none; font-size: 1.5rem; line-height: 1; }
    .key2lix-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; min-height: 200px; max-height: 320px;
    }
    .key2lix-msg { margin-bottom: 12px; padding: 10px 14px; border-radius: 12px; max-width: 90%; font-size: 0.9rem; line-height: 1.5; }
    .key2lix-msg.user { background: rgba(124,58,237,0.4); color: #fff; margin-left: auto; }
    .key2lix-msg.bot { background: rgba(30,30,46,0.9); border: 1px solid rgba(124,58,237,0.2); color: #e2e8f0; }
    .key2lix-chat-input-wrap { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(124,58,237,0.2); }
    .key2lix-chat-input {
      flex: 1; padding: 12px 16px; border: 1px solid rgba(124,58,237,0.3); border-radius: 12px;
      background: rgba(0,0,0,0.3); color: #fff; font-size: 0.9rem;
    }
    .key2lix-chat-input::placeholder { color: #64748b; }
    .key2lix-chat-send {
      padding: 12px 16px; background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
      border: none; border-radius: 12px; color: #fff; cursor: pointer;
    }
    body.theme-light .key2lix-chat-panel { background: #fff; border-color: rgba(124,58,237,0.4); }
    body.theme-light .key2lix-msg.bot { background: #f8fafc; border-color: rgba(124,58,237,0.2); color: #334155; }
    body.theme-light .key2lix-chat-input { background: #f1f5f9; color: #0f172a; border-color: rgba(124,58,237,0.3); }
  `;

  document.head.appendChild(style);
  document.body.appendChild(widget);

  window.Key2lixChatClose = closePanel;

  var toggleBtn = document.getElementById('key2lix-chat-toggle');
  var panel = document.getElementById('key2lix-chat-panel');
  var backdrop = document.getElementById('key2lix-chat-backdrop');
  var headerEl = panel.querySelector('.key2lix-chat-header');
  var closeBtnEl = panel.querySelector('.key2lix-chat-close');
  var messagesEl = panel.querySelector('.key2lix-chat-messages');
  var inputEl = document.getElementById('key2lix-chat-input');
  var sendBtn = document.getElementById('key2lix-chat-send');

  function addMsg(role, text) {
    messages.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
    const div = document.createElement('div');
    div.className = 'key2lix-msg ' + (role === 'user' ? 'user' : 'bot');
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addWelcome() {
    if (messages.length === 0) {
      addMsg('bot', 'مرحباً! أنا مساعد Key2lix. كيف يمكنني مساعدتك؟ اسأل عن المنتجات أو الطلبات أو الدعم.');
    }
  }

  async function send() {
    const text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    addMsg('user', text);
    sendBtn.disabled = true;
    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
        credentials: 'same-origin'
      });
      const data = await resp.json();
      if (data.text) addMsg('bot', data.text);
      else addMsg('bot', 'عذراً، حدث خطأ. حاول لاحقاً أو تواصل مع الدعم.');
    } catch (e) {
      addMsg('bot', 'تعذر الاتصال. تحقق من الشبكة وحاول مرة أخرى.');
    }
    sendBtn.disabled = false;
  }

  function toggle() {
    open = !open;
    if (open) {
      panel.removeAttribute('hidden');
      panel.style.display = 'flex';
      backdrop.style.display = 'block';
      addWelcome();
      inputEl.focus();
    } else {
      panel.setAttribute('hidden', '');
      panel.style.display = 'none';
      backdrop.style.display = 'none';
    }
  }

  function closePanel() {
    open = false;
    panel.setAttribute('hidden', '');
    panel.style.display = 'none';
    backdrop.style.display = 'none';
  }

  toggleBtn.addEventListener('click', toggle);
  backdrop.addEventListener('click', closePanel);
  document.addEventListener('click', function (e) {
    if (e.target.closest && (e.target.closest('.key2lix-chat-header') || e.target.closest('.key2lix-chat-close'))) {
      closePanel();
    }
  }, true);
  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send();
  });
  }

  if (window.Key2lixConfig && window.Key2lixConfig.aiEnabled) {
    init();
  } else {
    fetch('/api/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        window.Key2lixConfig = window.Key2lixConfig || c;
        if (c && c.aiEnabled) init();
      })
      .catch(function () {});
  }
})();
