const { readKey, saveKey, clearKey, normalizeKey } = require('../utils/keyStore');

function detectProvider(key) {
  if (!key || typeof key !== 'string') return null;
  if (key.startsWith('sk-') || key.startsWith('sk-proj-')) return 'openai';
  // Assume everything else is Gemini to prevent blocking valid keys from other origins
  return 'google';
}

exports.saveKey = (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  // Remove whitespace and leading/trailing quotes that may have been accidentally copied
  const trimmed = normalizeKey(key);
  const provider = detectProvider(trimmed);
  if (!provider) {
    return res.status(400).json({
      error: 'Invalid key format. Use OpenAI key starting with sk- (or sk-proj-) or Gemini key starting with AIza.'
    });
  }

  try {
    saveKey(trimmed);
    return res.json({ ok: true, provider });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save key' });
  }
};

exports.clearKey = (req, res) => {
  try {
    clearKey();
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to clear key' });
  }
};

// ─── Fetch ALL available models from the correct provider ───
exports.getModels = async (req, res) => {
  const key = readKey();
  if (!key) return res.status(403).json({ error: 'No API key saved' });

  try {
    const provider = detectProvider(key);
    if (!provider) {
      return res.status(400).json({
        error: 'Saved key format is invalid. Please clear key and save a valid OpenAI (sk-) or Gemini (AIza) key.'
      });
    }

    // ── Gemini Key (AIza...) ──
    if (provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const resp = await fetch(url);
      const json = await resp.json();

      if (!resp.ok) {
        return res.status(resp.status).json({
          error: json.error?.message || 'Gemini API error',
          code: json.error?.status || 'gemini_error'
        });
      }

      // Filter to generative (chat-capable) models only & sort nicely
      const models = (json.models || [])
        .filter(m =>
          m.supportedGenerationMethods &&
          m.supportedGenerationMethods.includes('generateContent')
        )
        .map(m => ({
          id: m.name.replace('models/', ''),   // e.g. "gemini-1.5-flash"
          displayName: m.displayName || m.name.replace('models/', ''),
          provider: 'google'
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      return res.json({ models, provider: 'google' });
    }

    // ── OpenAI Key (sk-...) ──
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` }
    });

    if (!resp.ok) {
      const txt = await resp.text();
      try {
        const parsed = JSON.parse(txt);
        return res.status(resp.status).json({
          error: parsed.error?.message || 'OpenAI API error',
          code: parsed.error?.code || 'openai_error'
        });
      } catch (_err) {
        return res.status(resp.status).json({ error: txt || 'OpenAI API error', code: 'openai_error' });
      }
    }

    const json = await resp.json();
    // Keep only GPT-chat-capable models, sorted newest first
    const chatModels = (json.data || [])
      .filter(m => m.id.includes('gpt'))
      .map(m => ({ id: m.id, displayName: m.id, provider: 'openai' }))
      .sort((a, b) => b.id.localeCompare(a.id));

    return res.json({ models: chatModels, provider: 'openai' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.hasKey = (req, res) => {
  const key = readKey();
  const provider = detectProvider(key);
  // Backward compatibility: treat legacy invalid saved values as "no usable key".
  if (!provider) {
    return res.json({ hasKey: false, provider: null, invalidSavedKey: !!key });
  }
  return res.json({ hasKey: true, provider });
};
