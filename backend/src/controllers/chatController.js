/**
 * chatController.js
 * Handles POST /api/v1/llm/chat — multi-turn chat proxy.
 * Uses the shared buildSystemContext from assistantController (with prediction data).
 */

const { readKey } = require('../utils/keyStore');
const assistantController = require('./assistantController');

// ─── Main chat handler (multi-turn conversation) ───
exports.chat = async (req, res) => {
  const { model, messages, userLat, userLng, userFloor } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const key = readKey();
  if (!key) return res.status(403).json({ error: 'No API key saved. Please add your API key in the settings panel to use the chat.' });

  // Build shared system prompt (with predictions + anti-repetition)
  const systemPrompt = assistantController.buildSystemContext
    ? await assistantController.buildSystemContext(
        parseFloat(userLat) || 19.1334,
        parseFloat(userLng) || 72.9133,
        parseInt(userFloor) || 0,
        messages  // pass conversation to get anti-repetition context
      )
    : 'You are CampusFlow AI — the IITB Campus Intelligence assistant. Answer naturally and concisely.';

  try {
    const isGemini = !key.startsWith('sk-') && !key.startsWith('sk-proj-');

    // ── Gemini path ──
    if (isGemini) {
      const geminiModel = model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const contents = [
        { role: 'user',  parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I am CampusFlow AI with full live access to the IITB timetable, classroom data, parking, and predictive intelligence. I will give fresh, varied, data-driven answers with future predictions.' }] },
        ...messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      ];

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.75,
            topP: 0.92,
            topK: 40,
            maxOutputTokens: 1024
          }
        })
      });

      const text = await resp.text();
      try {
        const json = JSON.parse(text);
        if (!resp.ok) {
          return res.status(resp.status).json({
            error: { message: json.error?.message || 'Gemini API Error' }
          });
        }
        const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return res.json({ choices: [{ message: { content: replyText } }] });
      } catch (e) {
        return res.status(resp.status).send(text);
      }
    }

    // ── OpenAI path ──
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 1024,
        temperature: 0.75,
        presence_penalty: 0.6,
        frequency_penalty: 0.4
      })
    });

    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      return res.status(resp.status).json(json);
    } catch (e) {
      return res.status(resp.status).send(text);
    }

  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
};
