(function () {
  /* ─── DOM refs ─── */
  const messagesEl    = document.getElementById('messages');
  const chatForm      = document.getElementById('chatForm');
  const questionInput = document.getElementById('questionInput');
  const sendBtn       = document.getElementById('sendBtn');
  const apiKeyInput   = document.getElementById('apiKey');
  const saveKeyBtn    = document.getElementById('saveKeyBtn');
  const clearKeyBtn   = document.getElementById('clearKeyBtn');
  const modelSelect   = document.getElementById('modelSelect');
  const keyStatus     = document.getElementById('keyStatus');

  const settingsPanel = document.getElementById('settingsPanel');
  const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');

  if (toggleSettingsBtn && settingsPanel) {
    toggleSettingsBtn.addEventListener('click', () => {
      const isCollapsed = settingsPanel.classList.toggle('collapsed');
      toggleSettingsBtn.innerHTML = isCollapsed ? '<i class="fas fa-chevron-right"></i>' : '<i class="fas fa-chevron-left"></i>';
    });
  }

  /* ─── Resolve the backend base URL ─── */
  function apiBases() {
    const list = [];
    // Always prefer same-origin API.
    list.push('');
    list.push('http://127.0.0.1:30000');
    list.push('http://localhost:30000');
    list.push('http://127.0.0.1:5000');
    list.push('http://localhost:5000');
    if (
      window.location.hostname &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      list.push(`http://${window.location.hostname}:30000`);
      list.push(`http://${window.location.hostname}:5000`);
    }
    return [...new Set(list)];
  }

  async function fetchWithFallback(path, options) {
    let lastError = null;
    for (const base of apiBases()) {
      try {
        const resp = await fetch(base + path, options);
        return resp;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Backend unreachable on port 5000');
  }

  /* ─── Chat bubble renderer ─── */
  function bubble(text, who) {
    const div = document.createElement('div');
    div.className = 'bubble ' + who;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ─── Typing indicator ─── */
  let typingEl = null;
  function showTyping() {
    if (typingEl) return;
    typingEl = document.createElement('div');
    typingEl.className = 'bubble bot typing-indicator';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(typingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  /* ─── Set UI state for key status ─── */
  function setKeyStatus(hasKey, provider) {
    if (hasKey) {
      keyStatus.textContent = `✅ Key saved (${provider || 'provider'}). Ready to chat.`;
      keyStatus.classList.remove('status-error');
      keyStatus.classList.add('status-ok');
      // Show a masked key hint
      apiKeyInput.placeholder = '••••••••••••••••••• (key saved)';
    } else {
      keyStatus.textContent = 'No API key saved. Enter key below to enable AI answers.';
      keyStatus.classList.remove('status-ok');
      apiKeyInput.placeholder = 'Paste OpenAI or Gemini key';
    }
  }

  /* ─── Load key status & models on page load ─── */
  async function refreshKeyAndModels() {
    try {
      const hkResp = await fetchWithFallback('/api/v1/llm/has-key');
      const hk = await hkResp.json();

      if (!hk.hasKey) {
        setKeyStatus(false);
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option>Save key first</option>';
        return;
      }

      setKeyStatus(true, hk.provider);

      // Load models
      const modelResp = await fetchWithFallback('/api/v1/llm/models');
      const modelData = await modelResp.json();

      if (!modelResp.ok || !modelData.models || !modelData.models.length) {
        modelSelect.disabled = true;
        modelSelect.innerHTML = '<option>Model fetch failed</option>';
        const detail = modelData && (modelData.error || 'Unknown error');
        keyStatus.textContent = `✅ Key saved (${hk.provider}). Model list error: ${detail}`;
        return;
      }

      modelSelect.innerHTML = '';
      modelData.models.forEach((m) => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.displayName || m.id;
        modelSelect.appendChild(opt);
      });
      modelSelect.disabled = false;
      setKeyStatus(true, modelData.provider || hk.provider);
    } catch (err) {
      keyStatus.textContent = '⚠️ Cannot reach backend (check server on port 5000).';
    }
  }

  /* ─── Save key ─── */
  async function saveKey() {
    const raw = (apiKeyInput.value || '').trim();
    if (!raw) {
      keyStatus.textContent = 'Please enter a key first.';
      return;
    }

    saveKeyBtn.disabled = true;
    keyStatus.textContent = 'Saving key...';

    try {
      const resp = await fetchWithFallback('/api/v1/llm/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: raw })
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        keyStatus.textContent = '❌ ' + (data.error || 'Failed to save key.');
        keyStatus.classList.add('status-error');
        keyStatus.classList.remove('status-ok');
        return;
      }

      apiKeyInput.value = '';
      await refreshKeyAndModels();
    } catch (err) {
      keyStatus.textContent = '❌ Cannot reach backend. Make sure the server is running on port 5000.';
    } finally {
      saveKeyBtn.disabled = false;
    }
  }

  /* ─── Clear key ─── */
  async function clearKey() {
    try {
      const resp = await fetchWithFallback('/api/v1/llm/clear-key', { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        keyStatus.textContent = '❌ Clear failed: ' + (data.error || 'Unknown error');
        return;
      }
      modelSelect.disabled = true;
      modelSelect.innerHTML = '<option>Save key first</option>';
      setKeyStatus(false);
      apiKeyInput.value = '';
      apiKeyInput.placeholder = 'Paste OpenAI or Gemini key';
    } catch (err) {
      keyStatus.textContent = '❌ Cannot reach backend.';
    }
  }

  /* ─── Session ID for conversation memory ─── */
  const _sessionId = (() => {
    let sid = sessionStorage.getItem('campusflow_chat_sid');
    if (!sid) {
      sid = 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('campusflow_chat_sid', sid);
    }
    return sid;
  })();

  /* ─── Ask the campus assistant ─── */
  async function askAssistant(question) {
    const model = modelSelect.disabled ? null : modelSelect.value;
    let userLat = 19.1334;
    let userLng = 72.9133;

    if ('geolocation' in navigator) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
      } catch (_) {}
    }

    const payload = {
      question,
      model: model || undefined,
      userLat,
      userLng,
      userFloor: 0,
      sessionId: _sessionId   // ← enables multi-turn memory + anti-repetition
    };

    const resp = await fetchWithFallback('/api/v1/assistant/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await resp.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }

    if (!resp.ok) {
      const msg = (data && (data.error || data.message)) || `Server error (${resp.status})`;
      throw new Error(msg);
    }

    // Extract text from whichever field was returned
    if (data && data.assistant_text) return data.assistant_text;
    if (data && data.text)           return data.text;
    if (data && data.answer)         return data.answer;
    if (data && data.choices && data.choices[0]) return data.choices[0].message?.content || 'No response.';
    return 'No response received from the assistant.';
  }

  /* ─── Form submit ─── */
  async function onSubmit(e) {
    e.preventDefault();
    const q = (questionInput.value || '').trim();
    if (!q) return;

    bubble(q, 'user');
    questionInput.value = '';
    questionInput.disabled = true;
    sendBtn.disabled = true;
    showTyping();

    try {
      const answer = await askAssistant(q);
      hideTyping();
      bubble(answer, 'bot');
    } catch (err) {
      hideTyping();
      bubble('⚠️ Error: ' + err.message, 'bot');
    } finally {
      questionInput.disabled = false;
      sendBtn.disabled = false;
      questionInput.focus();
    }
  }

  /* ─── Wire events ─── */
  saveKeyBtn.addEventListener('click', saveKey);
  clearKeyBtn.addEventListener('click', clearKey);
  chatForm.addEventListener('submit', onSubmit);

  /* ─── Pre-fill from URL ─── */
  const q = new URLSearchParams(window.location.search).get('q');
  if (q) questionInput.value = q;

  /* ─── Init ─── */
  bubble('👋 Welcome to CampusFlow Chat! Ask me anything about classrooms, parking, routes, and campus schedules.', 'bot');
  refreshKeyAndModels();
})();
