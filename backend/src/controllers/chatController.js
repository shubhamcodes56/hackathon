/**
 * chatController.js
 * Handles POST /api/v1/llm/chat — the dedicated chat page conversation proxy.
 * Imports the system context builder from assistantController for consistency.
 */

const { readKey } = require('../utils/keyStore');

// Import the shared buildSystemContext from assistantController
const assistantController = require('./assistantController');

// ─── Main chat handler (multi-turn conversation) ───
exports.chat = async (req, res) => {
  const { model, messages, userLat, userLng, userFloor } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const key = readKey();
  if (!key) return res.status(403).json({ error: 'No API key saved' });

  // Build system prompt from the shared function
  let systemPrompt;
  if (assistantController.buildSystemContext) {
    systemPrompt = await assistantController.buildSystemContext(userLat, userLng, userFloor);
  } else {
    // Fallback: import db and build a minimal context
    const db = require('../config/db');
    systemPrompt = `You are CampusFlow AI — the IITB Campus Intelligence assistant. Answer questions about classrooms, timetable, parking, and campus navigation naturally and concisely.`;
  }

  try {
    // ── Gemini path ──
    const isGemini = !key.startsWith('sk-') && !key.startsWith('sk-proj-');
    if (isGemini) {
      const geminiModel = model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const contents = [
        { role: 'user',  parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I am CampusFlow AI with full access to the IITB timetable, live classroom occupancy, parking data, and distance calculations.' }] },
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
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
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
        max_tokens: 2048,
        temperature: 0.4
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
