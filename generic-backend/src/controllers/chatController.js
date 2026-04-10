const fs   = require('fs');
const path = require('path');
const db   = require('../config/db');

const keysPath = path.join(__dirname, '../../secure_keys.json');

function readKey() {
  try {
    if (!fs.existsSync(keysPath)) return null;
    const raw = fs.readFileSync(keysPath, 'utf8');
    return JSON.parse(raw || '{}').apiKey || null;
  } catch { return null; }
}

// ─── Tables to skip (security-sensitive or useless for LLM context) ───
const SKIP_COLUMNS = new Set(['password_hash', 'api_key_hash']);
const SKIP_TABLES  = new Set([]); // add table names here to exclude them

async function buildSystemContext(userLat = 19.1334, userLng = 72.9133, userFloor = 0) {
  try {
    // 1. Discover all public tables
    const tablesRes = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = tablesRes.rows
      .map(r => r.table_name)
      .filter(t => !SKIP_TABLES.has(t) && t !== 'rooms'); // Skip rooms since we provide it in advancedInfo

    const sections = [];

    for (const table of tableNames) {
      // 2. Get column info for this table
      const colRes = await db.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table]);

      const columns = colRes.rows
        .map(c => c.column_name)
        .filter(c => !SKIP_COLUMNS.has(c));

      if (!columns.length) continue;

      // 3. Fetch all rows (max 200 per table to stay within token limits)
      let rows = [];
      try {
        const safeColumns = columns.map(c => `"${c}"`).join(', ');
        const dataRes = await db.query(
          `SELECT ${safeColumns} FROM "${table}" LIMIT 200`
        );
        rows = dataRes.rows || [];
      } catch (err) {
        sections.push(`\n## Table: ${table}\n[Could not fetch data: ${err.message}]`);
        continue;
      }

      if (!rows.length) {
        sections.push(`\n## Table: ${table}\n(empty table — no records found)`);
        continue;
      }

      // Add occupancy percentage mapped internally for LLM context
      // Add distance mapping inside the string context instead.

      // 4. Format rows as a readable text block
      const rowText = rows.map((row, i) => {
        const fields = columns
          .map(col => {
            let val = row[col];
            if (val === null || val === undefined) val = 'null';
            else if (typeof val === 'object') val = JSON.stringify(val);
            return `${col}: ${val}`;
          })
          .join(' | ');
        return `  ${i + 1}. ${fields}`;
      }).join('\n');

      sections.push(`\n## Table: ${table} (${rows.length} records)\nColumns: ${columns.join(', ')}\n${rowText}`);
    }

    const dbContext = sections.join('\n');

    // ──────────────────────────────────────────
    // SPECIAL CALCULATIONS: Distance and percentage
    // ──────────────────────────────────────────
    let advancedInfo = '\n### LIVE CLASSROOM STATUS & DISTANCES:\n';
    try {
      const liveRes = await db.query(`
        SELECT 
          r.room_type,
          r.room_number,
          b.name as building_name,
          f.floor_number,
          r.capacity,
          r.current_occupancy,
          b.lat,
          b.lng
        FROM rooms r
        JOIN floors f ON r.floor_id = f.id
        JOIN buildings b ON f.building_id = b.id
      `);
      
      advancedInfo += liveRes.rows.map(r => {
        let emptyPct = 100;
        let occupiedPct = 0;
        if (r.capacity > 0) {
          occupiedPct = Math.round(((r.current_occupancy || 0) / r.capacity) * 100);
          emptyPct = 100 - occupiedPct;
        }
        
        let distanceMeters = 'Unknown';
        if (r.lat && r.lng) {
            const dLat = (r.lat - userLat) * 111000;
            const dLng = (r.lng - userLng) * 111000;
            distanceMeters = Math.round(Math.sqrt((dLat*dLat) + (dLng*dLng)));
        }
        
        return `- ${r.building_name} [${r.room_type}] Room ${r.room_number} (Floor ${r.floor_number}): ${emptyPct}% empty (${occupiedPct}% occupied), Distance from user: ${distanceMeters} meters away.`;
      }).join('\n');
    } catch (e) {
      advancedInfo += '(Could not fetch advanced live room data)';
    }

    return `You are the IITB Campus Intelligence AI. You have full, live access to the university's PostgreSQL database.
The database contains everything about buildings, floorplans, classrooms, and parking.

### USER CONTEXT:
- **CURRENT LOCATION:** Lat: ${userLat}, Lng: ${userLng}
- **CURRENT FLOOR:** Floor ${userFloor}

### RELATIONSHIPS:
- 'buildings' table contains all building names and locations.
- 'floors' links to 'buildings' via building_id.
- 'rooms' links to 'floors' via floor_id. These are your classrooms and labs.
- 'parking_slots' links to 'parking_zones' via zone_id.

### CURRENT DATABASE STATE:
${dbContext}
${advancedInfo}

─────────────────────────────────────────────────────────────────────
INSTRUCTIONS:
1. **BE A CHATBOT:** Speak naturally and concisely. Do NOT give long lists. Use 2-3 short sentences.
2. **NO TECHNICAL JARGON:** NEVER mention "Current Occupancy", "Capacity", or "Status". Use natural language like "only 5 people are there" or "it's 90% empty".
3. **MANDATORY NUMBERS:** You MUST always state the **distance in meters** and the **occupancy percentage**.
4. **LOCATION AWARENESS:** You HAVE the user's coordinates and floor. NEVER say you don't have them. Use them to calculate "close" vs "far".
5. **EXAMPLE RESPONSE:** "The Computer Lab in KReSIT is your best bet! It's just 30 meters from you on Floor ${userFloor} and is currently 85% empty (only 15% filled)."
6. **STRICT RULE:** No IDs, No UUIDs, No table-like formatting.
─────────────────────────────────────────────────────────────────────`;
  } catch (err) {
    return `You are a helpful dashboard assistant. Full database context is temporarily unavailable (${err.message}). Answer based on your general knowledge and inform the user to check the server.`;
  }
}

// ─── Main chat handler ───
exports.chat = async (req, res) => {
  const { model, messages, userLat, userLng, userFloor } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const key = readKey();
  if (!key) return res.status(403).json({ error: 'No API key saved' });

  const systemPrompt = await buildSystemContext(userLat, userLng, userFloor);

  try {
    // ──────────────────────────────────────────
    //  GEMINI (AIza... keys)
    // ──────────────────────────────────────────
    if (key.startsWith('AIza')) {
      const geminiModel = model || 'gemini-1.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const contents = [
        { role: 'user',  parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I have full access to all database tables and will answer accurately based on the live data.' }] },
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

    // ──────────────────────────────────────────
    //  OPENAI (sk-... keys)
    // ──────────────────────────────────────────
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
