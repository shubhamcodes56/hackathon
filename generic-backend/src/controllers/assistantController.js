const db = require('../config/db');

// Aggregates live campus data and asks the saved-key LLM to answer the user's question.
exports.query = async (req, res, next) => {
  try {
    const { question, model } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question required' });

    // Fetch live data (works with Supabase or pg compatibility)
    const clsResp = await db.from('classrooms').select('id,name,zone,capacity,current_occupancy,fullness_pct').order('fullness_pct', { ascending: true }).limit(200);
    const parkResp = await db.from('parking_spots').select('id,zone,status').limit(500);
    const distResp = await db.from('distances').select('from_zone,to_zone,distance_meters').limit(500);

    const classrooms = (clsResp && clsResp.data) || [];
    const parking = (parkResp && parkResp.data) || [];
    const distances = (distResp && distResp.data) || [];

    // Build concise context summary
    const totalRooms = classrooms.length;
    const emptyRooms = classrooms.filter(r => (r.capacity || 1) - (r.current_occupancy || 0) >= Math.max(1, Math.floor((r.capacity || 1) * 0.3)) );
    const topEmptyRooms = emptyRooms.slice(0, 10).map(r => ({
      id: r.id,
      name: r.name || r.id,
      zone: r.zone,
      occupancy: r.current_occupancy || 0,
      capacity: r.capacity || 0,
      fullpct: Math.round(r.fullness_pct || 0)
    }));
    const topEmpty = topEmptyRooms.map(r => `${r.name} (zone ${r.zone}) occupancy ${r.occupancy}/${r.capacity} full% ${r.fullpct}%`);

    const availableParking = parking.filter(p => p.status === 'available' || p.status === 'free' || p.status === 'open');
    const topParking = availableParking.slice(0, 10).map(p => ({ id: p.id, zone: p.zone }));

    const summaryLines = [];
    summaryLines.push(`Total classrooms: ${totalRooms}`);
    summaryLines.push(`Empty/low-occupancy classrooms (sample):`);
    if (topEmpty.length) summaryLines.push(topEmpty.join('; ')); else summaryLines.push('None found');
    summaryLines.push(`Available parking (sample): ${topParking.slice(0,5).map(p=>p.id).join(', ') || 'None'}`);

    // Compose prompt for LLM — structured: system + user with embedded data
    const system = `You are Campus Assistant. Use only the structured data provided to answer precisely and numerically when possible. Respond in a short, conversational tone suitable for a chat UI. Mention source fields like classroom name, zone, occupancy, fullness_pct, parking id, and distance when relevant.`;
    const userMsg = `QUESTION: ${question}\n\nDATA SUMMARY:\n${summaryLines.join('\n')}\n\nFull classroom list (first 50):\n${classrooms.slice(0,50).map(c=>`${c.name||c.id}|zone:${c.zone}|occ:${c.current_occupancy||0}|cap:${c.capacity||0}|fullpct:${Math.round((c.fullness_pct||0))}%`).join('\n')}\n\nParking sample (first 50):\n${parking.slice(0,50).map(p=>`${p.id}|zone:${p.zone}|status:${p.status}`).join('\n')}\n\nDistances (sample):\n${distances.slice(0,50).map(d=>`${d.from_zone}->${d.to_zone}:${d.distance_meters}m`).join('\n')}`;

    // Check whether server has a saved API key. If not, return a deterministic summary.
    const host = process.env.HOSTNAME || 'localhost';
    const port = process.env.PORT || 5000;
    const hasKeyUrl = `http://${host}:${port}/api/v1/llm/has-key`;
    try {
      const hk = await fetch(hasKeyUrl);
      const hkJson = await hk.json();
      if (!hkJson.hasKey) {
        // Deterministic fallback: return short conversational answer from live data
        const first = topEmptyRooms[0];
        const others = topEmptyRooms.slice(1,4);
        const parkingSample = topParking.slice(0,5).map(p=>p.id);
        if (first) {
          const othersText = others.length ? ` Nearby emptiest rooms: ${others.map(o => `${o.name} (${o.occupancy}/${o.capacity})`).join(', ')}.` : '';
          const parkingText = parkingSample.length ? ` Available parking examples: ${parkingSample.slice(0,3).join(', ')}.` : '';
          const assistant_text = `Right now the emptiest classroom is ${first.name} in ${first.zone} with ${first.occupancy} occupants (capacity ${first.capacity}).${othersText}${parkingText}`;
          return res.json({ assistant_text, data: { classrooms: classrooms.slice(0,10), parking: parkingSample } });
        } else {
          const assistant_text = `No low-occupancy classrooms found right now. Available parking examples: ${parkingSample.join(', ') || 'None'}.`;
          return res.json({ assistant_text, data: { classrooms: [], parking: parkingSample } });
        }
      }
    } catch (e) {
      // if has-key check fails, fall back to deterministic response
      const first = topEmptyRooms[0];
      const parkingSample = topParking.slice(0,5).map(p=>p.id);
      if (first) {
        const assistant_text = `Right now the emptiest classroom is ${first.name} in ${first.zone} with ${first.occupancy} occupants (capacity ${first.capacity}).`;
        return res.json({ assistant_text, data: { classrooms: classrooms.slice(0,10), parking: parkingSample } });
      }
      const assistant_text = `No low-occupancy classrooms found right now. Available parking examples: ${parkingSample.join(', ') || 'None'}.`;
      return res.json({ assistant_text, data: { classrooms: [], parking: parkingSample } });
    }

    // Forward to saved-key chat proxy on this server
    const modelToUse = model || undefined;
    const payload = { model: modelToUse, messages: [ { role: 'system', content: system }, { role: 'user', content: userMsg } ] };

    // Call internal proxy endpoint
    const url = `http://${host}:${port}/api/v1/llm/chat`;

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const text = await resp.text();
    try { const json = JSON.parse(text); return res.status(resp.status).json(json); } catch (e) { return res.status(resp.status).send(text); }

  } catch (err) {
    next(err);
  }
};
