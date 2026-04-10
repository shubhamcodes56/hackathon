/**
 * Gemini-like deterministic decision endpoint.
 * Reads only provided live_data and returns JSON cards per the spec.
 */
const buildCard = (emoji, title, subtitle, action, priority, type, gps) => ({
  emoji,
  title,
  subtitle,
  action,
  priority,
  type,
  ...(gps ? { gps } : {})
});

function safeNum(v) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

exports.handleGemini = async (req, res) => {
  try {
    const payload = req.body;
    const { query, user_location, live_data } = payload || {};
    if (!live_data) return res.status(400).json({ error: 'live_data required' });

    const rooms = Array.isArray(live_data.rooms) ? live_data.rooms : [];
    const parking = Array.isArray(live_data.parking) ? live_data.parking : [];

    // Normalize rooms: ensure empty_pct and distance_m
    const normRooms = rooms.map((r) => {
      const empty_pct = safeNum(r.empty_pct) ?? (r.capacity && r.seats_free ? Math.round((r.seats_free / r.capacity) * 100) : null);
      const seats_free = safeNum(r.seats_free) ?? (r.capacity && empty_pct !== null ? Math.round((empty_pct / 100) * r.capacity) : null);
      const distance_m = safeNum(r.distance_m) ?? 9999;
      return { ...r, empty_pct, seats_free, distance_m };
    });

    // Rank rooms per rules
    const primary = normRooms.filter(r => r.empty_pct !== null && r.empty_pct > 60 && r.distance_m < 100);
    const secondary = normRooms.filter(r => r.empty_pct !== null && r.empty_pct >= 30 && r.empty_pct <= 60);
    const urgent = normRooms.filter(r => r.empty_pct !== null && r.empty_pct < 30);

    // pick top primary (closest distance)
    primary.sort((a,b)=> a.distance_m - b.distance_m);
    secondary.sort((a,b)=> a.distance_m - b.distance_m);
    urgent.sort((a,b)=> a.distance_m - b.distance_m);

    const pickRoom = primary[0] || secondary[0] || urgent[0] || null;

    // Parking logic: find nearest parking with fullness_pct < 60 (prefer free-ish)
    const parkNorm = parking.map(p => ({ ...p, fullness_pct: safeNum(p.fullness_pct) ?? 100, distance_m: safeNum(p.distance_m) ?? 9999 }));
    parkNorm.sort((a,b)=> a.distance_m - b.distance_m);
    const preferredParking = parkNorm.find(p=> p.fullness_pct < 60) || parkNorm[0] || null;

    // Build cards per spec
    const cards = [];
    let priority = 1;

    if (pickRoom) {
      const emoji = (pickRoom.empty_pct > 60 && pickRoom.distance_m < 100) ? '🟢' : (pickRoom.empty_pct >=30 ? '🟡' : '🔴');
      const action = (emoji==='🟢') ? 'GO_NOW' : (emoji==='🟡' ? 'CHECK' : 'MOVE_NOW');
      const subtitle = pickRoom.capacity ? `${Math.round(pickRoom.empty_pct)}% empty (${pickRoom.seats_free||'~'}/${pickRoom.capacity} free) | Block ${pickRoom.block||''} | ${pickRoom.distance_m}m` : `${Math.round(pickRoom.empty_pct)}% empty | Block ${pickRoom.block||''} | ${pickRoom.distance_m}m`;
      cards.push(buildCard(emoji, `${pickRoom.room_name} ${emoji==='🟢' ? 'GO NOW' : emoji==='🟡' ? 'CHECK' : 'MOVE'}`, subtitle, action, priority++, 'room', pickRoom.gps_h3));
    }

    // add one secondary example if exists (ensure not duplicate)
    const sec = (primary[0] ? secondary.find(r=> r.room_name !== primary[0].room_name) : secondary[0]) || null;
    if (sec) {
      cards.push(buildCard('🟡', `${sec.room_name} CHECK`, `${Math.round(sec.empty_pct)}% empty | Block ${sec.block||''} | ${sec.distance_m}m`, 'CHECK', priority++, 'room'));
    }

    if (preferredParking) {
      cards.push(buildCard(preferredParking.fullness_pct < 50 ? '🟢' : '🟡', `${preferredParking.spot || preferredParking.spot_number} ${preferredParking.fullness_pct < 50 ? 'FREE' : 'OK'}`, `${preferredParking.zone || ''} ${Math.round(preferredParking.fullness_pct)}% full | ${preferredParking.distance_m}m`, 'PARK', priority++, 'parking', preferredParking.gps_h3));
    }

    // Build live_reply
    const live_reply = (()=>{
      if (pickRoom) {
        const pct = Math.round(pickRoom.empty_pct);
        const parkingText = preferredParking ? (preferredParking.fullness_pct < 60 ? `${preferredParking.spot || preferredParking.spot_number} parking suggested` : `${preferredParking.spot || preferredParking.spot_number} parking`) : '';
        const verb = (pickRoom.empty_pct>60 && pickRoom.distance_m<100) ? 'GO NOW' : (pickRoom.empty_pct>=30 ? 'CHECK kar sakta hai' : 'MOVE NOW - Full ho raha!');
        return `🔥 FRESH: ${pickRoom.room_name} ${pct}% empty ${verb}! ${pickRoom.distance_m}m ${pickRoom.block?('Block '+pickRoom.block):''} ${parkingText ? (' '+parkingText+'!') : ''}`.trim();
      }
      return 'No recommendations available';
    })();

    // campus_live stats
    const avg_empty_near = (()=>{
      const near = normRooms.filter(r=> r.distance_m < 200 && r.empty_pct !== null);
      if (!near.length) return null;
      const s = near.reduce((a,b)=> a + (b.empty_pct||0), 0)/near.length;
      return Math.round(s*10)/10;
    })();

    const good_options = normRooms.filter(r=> r.empty_pct !== null && r.empty_pct > 60 && r.distance_m < 100).length;
    const parking_free_near = parkNorm.filter(p=> p.fullness_pct < 60 && p.distance_m < 100).length;

    const out = {
      live_reply,
      data_freshness: live_data.fetch_time ? `Live ${Math.max(0, Math.round((Date.now() - new Date(live_data.fetch_time).getTime())/1000))}sec ago` : 'Live',
      primary_recommendation: pickRoom && preferredParking ? `${pickRoom.room_name} + ${preferredParking.spot || preferredParking.spot_number}` : (pickRoom? pickRoom.room_name : null),
      cards,
      campus_live: {
        avg_empty_near: avg_empty_near || 0,
        good_options,
        parking_free_near
      }
    };

    return res.json(out);
  } catch (err) {
    console.error('gemini error', err);
    return res.status(500).json({ error: 'internal' });
  }
};
