const fs = require('fs');
const path = require('path');

const keysPath = path.join(__dirname, '../../secure_keys.json');

function readKey() {
  try {
    if (!fs.existsSync(keysPath)) return null;
    const raw = fs.readFileSync(keysPath, 'utf8');
    const obj = JSON.parse(raw || '{}');
    return obj.apiKey || null;
  } catch (err) {
    return null;
  }
}

function saveKeyToFile(key) {
  const payload = { apiKey: key };
  fs.writeFileSync(keysPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

exports.saveKey = (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Missing key' });
  try {
    saveKeyToFile(key);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save key' });
  }
};

exports.clearKey = (req, res) => {
  try {
    if (fs.existsSync(keysPath)) fs.unlinkSync(keysPath);
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
    // ── Gemini Key (AIza...) ──
    if (key.startsWith('AIza')) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const resp = await fetch(url);
      const json = await resp.json();

      if (!resp.ok) {
        return res.status(resp.status).json({ error: json.error?.message || 'Gemini API error' });
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
      return res.status(resp.status).json({ error: txt });
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
  const provider = key ? (key.startsWith('AIza') ? 'google' : 'openai') : null;
  return res.json({ hasKey: !!key, provider });
};
