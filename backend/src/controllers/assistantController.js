/**
 * assistantController.js
 * CampusFlow AI — Intelligent Campus Assistant v2, fully rewritten with:
 *  - Real distances via campus_paths JOIN buildings
 *  - Room-to-building proximity using haversine from user's GPS
 *  - Date + day awareness (not just day name)
 *  - Strong anti-repetition with room-name extraction
 *  - Parking-to-building walk times
 *  - Future predictions from live timetable data
 *  - Deterministic fallback with same intelligence
 */

const db = require('../config/db');
const { readKey } = require('../utils/keyStore');
const { getAmenitySimulationSnapshot } = require('../utils/liveAmenitySimulation');

// ─── In-memory conversation history store ─────────────────────────────────
const conversationHistory = new Map();
const MAX_HISTORY_TURNS = 12;
const SESSION_TTL_MS   = 60 * 60 * 1000;

function getHistory(sessionId) {
  return conversationHistory.get(sessionId) || [];
}

function pushHistory(sessionId, role, content) {
  const history = conversationHistory.get(sessionId) || [];
  history.push({ role, content, timestamp: Date.now() });
  while (history.length > MAX_HISTORY_TURNS * 2) history.shift();
  conversationHistory.set(sessionId, history);
}

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, hist] of conversationHistory.entries()) {
    if (!hist.length || hist[hist.length - 1].timestamp < cutoff) {
      conversationHistory.delete(id);
    }
  }
}, 10 * 60 * 1000);

// ─── Safe DB query helper ──────────────────────────────────────────────────
async function safeRows(sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return r.rows || [];
  } catch (e) {
    console.warn('[DB Query Failed]', sql.substring(0, 80), e.message);
    return [];
  }
}

// ─── Haversine distance (meters) ──────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── IST time helpers ─────────────────────────────────────────────────────
function getISTContext() {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const currentDay   = days[ist.getDay()];
  const tomorrowDay  = days[(ist.getDay() + 1) % 7];
  const hh = String(ist.getHours()).padStart(2, '0');
  const mm = String(ist.getMinutes()).padStart(2, '0');
  const ss = String(ist.getSeconds()).padStart(2, '0');
  const istTimeStr = `${hh}:${mm}:${ss}`;
  const totalMinNow = ist.getHours() * 60 + ist.getMinutes();
  const dateStr = `${currentDay}, ${months[ist.getMonth()]} ${ist.getDate()}, ${ist.getFullYear()}`;
  return { currentDay, tomorrowDay, istTimeStr, totalMinNow, ist, dateStr };
}

function minutesUntil(timeStr, totalMinNow) {
  const parts = String(timeStr).split(':');
  return (parseInt(parts[0]) * 60 + parseInt(parts[1])) - totalMinNow;
}

function normalizeDayName(day) {
  if (!day) return '';
  const value = String(day).trim().toLowerCase();
  const lookup = {
    sunday: 'Sunday',
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday'
  };
  return lookup[value] || '';
}

function dayFromQuestion(question, currentDay, tomorrowDay) {
  const q = String(question || '').toLowerCase();
  if (q.includes('today')) return currentDay;
  if (q.includes('tomorrow')) return tomorrowDay;
  const named = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .find((day) => q.includes(day));
  return named ? normalizeDayName(named) : currentDay;
}

function pickVariant(key, count, total) {
  if (!total) return 0;
  const value = String(key || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (value + count) % total;
}

// ─── Extract room names from previous bot messages (anti-repetition) ──────
function extractMentionedRooms(history) {
  const roomPattern = /\b(LC\d{2,3}|LHC-?\d{2,3}|SIC-?\d{2,3}|SOM-?\d{2,3}|MMCR\d?|A\d{2,3}|B\d{2,3}|C\d{2,3}|D\d{2,3}|E\d{2,3}|F\d{2,3}|IC\d{2,3}|EE-?\d{2,3}|G-?\d{2}|Auditorium|Seminar|Reading)\b/gi;
  const mentioned = new Set();
  for (const h of history) {
    if (h.role === 'assistant') {
      const matches = h.content.match(roomPattern);
      if (matches) matches.forEach(m => mentioned.add(m.toUpperCase()));
    }
  }
  return [...mentioned];
}

// ─── Build the comprehensive system prompt from live DB ────────────────────
async function buildSystemContext(userLat = 19.1334, userLng = 72.9133, userFloor = 0, history = []) {
  try {
    const { currentDay, tomorrowDay, istTimeStr, totalMinNow, dateStr } = getISTContext();

    // ═══ 1. TIMETABLE — TODAY ════════════════════════════════════════════
    const todayClasses = await safeRows(
      `SELECT course_code, course_name, instructor, room_name, room_block,
              start_time, end_time, capacity, enrolled, semester, status
       FROM timetable
       WHERE day_of_week = $1
       ORDER BY start_time ASC`,
      [currentDay]
    );

    const ongoingClasses = await safeRows(
      `SELECT course_code, course_name, instructor, room_name, room_block,
              start_time, end_time, capacity, enrolled
       FROM timetable
       WHERE day_of_week = $1 AND start_time <= $2 AND end_time >= $2
       ORDER BY start_time ASC`,
      [currentDay, istTimeStr]
    );

    const upcomingClasses = await safeRows(
      `SELECT course_code, course_name, instructor, room_name, room_block,
              start_time, end_time, capacity, enrolled
       FROM timetable
       WHERE day_of_week = $1 AND start_time > $2
       ORDER BY start_time ASC
       LIMIT 15`,
      [currentDay, istTimeStr]
    );

    const completedClasses = await safeRows(
      `SELECT course_code, course_name, room_name, start_time, end_time
       FROM timetable
       WHERE day_of_week = $1 AND end_time < $2
       ORDER BY start_time ASC`,
      [currentDay, istTimeStr]
    );

    // ═══ 2. TIMETABLE — TOMORROW ═════════════════════════════════════════
    const tomorrowClasses = await safeRows(
      `SELECT course_code, course_name, instructor, room_name, room_block,
              start_time, end_time, capacity, enrolled
       FROM timetable
       WHERE day_of_week = $1
       ORDER BY start_time ASC`,
      [tomorrowDay]
    );

    // ═══ 3. WEEKLY OVERVIEW (FIXED GROUP BY) ═════════════════════════════
    const weekOverview = await safeRows(
      `SELECT day_of_week, COUNT(*) as class_count,
              MIN(start_time) as first_class, MAX(end_time) as last_class,
              SUM(enrolled) as total_students
       FROM timetable
       GROUP BY day_of_week
       ORDER BY CASE day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
         WHEN 'Sunday' THEN 7 END`
    );

    // ═══ 4. ROOMS THAT WILL FILL (next 90 min) ══════════════════════════
    const soonToFillRooms = await safeRows(
      `SELECT t.room_name, t.room_block, t.start_time, t.end_time,
              t.enrolled, t.capacity, t.course_code, t.course_name,
              COALESCE(r.current_occupancy, 0) as current_occ
       FROM timetable t
       LEFT JOIN rooms r ON LOWER(r.room_number) = LOWER(t.room_name)
       WHERE t.day_of_week = $1 AND t.start_time > $2
       ORDER BY t.start_time ASC
       LIMIT 10`,
      [currentDay, istTimeStr]
    );

    // Rooms about to free up
    const soonToFreeRooms = await safeRows(
      `SELECT t.room_name, t.room_block, t.end_time, t.course_code,
              t.enrolled, t.capacity
       FROM timetable t
       WHERE t.day_of_week = $1 AND t.start_time <= $2 AND t.end_time >= $2
       ORDER BY t.end_time ASC
       LIMIT 6`,
      [currentDay, istTimeStr]
    );

    // ═══ 5. LIVE CLASSROOMS + BUILDING LOCATION (the key fix!) ══════════
    // JOIN rooms → floors → buildings to get real lat/lng per room
    const classrooms = await safeRows(
      `SELECT r.id, r.room_type, r.room_number AS room_name, r.capacity,
              COALESCE(r.current_occupancy, 0) AS current_occupancy,
              f.floor_number AS floor,
              b.name AS building_name, b.block_name, b.lat AS building_lat, b.lng AS building_lng
       FROM rooms r
       JOIN floors f ON r.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       WHERE r.capacity > 0 AND r.is_available IS NOT FALSE
       ORDER BY COALESCE(r.current_occupancy::float / NULLIF(r.capacity, 0), 0) ASC
       LIMIT 200`
    );

    // Calculate distance from user to each room's building
    const roomsWithDist = classrooms.map(r => {
      const distM = (r.building_lat && r.building_lng)
        ? Math.round(haversineM(userLat, userLng, parseFloat(r.building_lat), parseFloat(r.building_lng)))
        : 9999;
      const walkMin = Math.max(1, Math.round(distM / 75)); // ~75m/min walking
      const occPct = r.capacity > 0 ? Math.round((r.current_occupancy / r.capacity) * 100) : 0;
      const freeSeats = r.capacity - r.current_occupancy;
      return { ...r, distM, walkMin, occPct, freeSeats };
    });

    // Separate into categories
    const emptyRooms    = roomsWithDist.filter(r => r.occPct < 30);
    const moderateRooms = roomsWithDist.filter(r => r.occPct >= 30 && r.occPct < 70);
    const crowdedRooms  = roomsWithDist.filter(r => r.occPct >= 70);
    const totalOcc = roomsWithDist.reduce((s, r) => s + r.current_occupancy, 0);
    const totalCap = roomsWithDist.reduce((s, r) => s + r.capacity, 0);
    const avgFullness = totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0;

    // Sort empties by a composite score: distance + occupancy (nearby + empty = best)
    emptyRooms.sort((a, b) => {
      const scoreA = a.distM + (a.occPct * 10);
      const scoreB = b.distM + (b.occPct * 10);
      return scoreA - scoreB;
    });

    // ═══ 6. PARKING + NEAREST BUILDING DISTANCES ════════════════════════
    const parkingByZone = await safeRows(
      `SELECT pz.zone_name AS zone, pz.location_desc,
              pz.total_slots AS total,
              COUNT(ps.id) FILTER (WHERE ps.is_occupied = false) AS free,
              COUNT(ps.id) FILTER (WHERE ps.is_occupied = true) AS occupied
       FROM parking_zones pz
       LEFT JOIN parking_slots ps ON ps.zone_id = pz.id
       GROUP BY pz.zone_name, pz.location_desc, pz.total_slots
       ORDER BY free DESC`
    );
    const totalFreeP = parkingByZone.reduce((s, p) => s + Number(p.free || 0), 0);
    const totalP     = parkingByZone.reduce((s, p) => s + Number(p.total || 0), 0);

    // ═══ 7. REAL CAMPUS DISTANCES (from campus_paths + buildings) ════════
    const campusDistances = await safeRows(
      `SELECT b1.name AS from_building, b2.name AS to_building,
              cp.distance_m, cp.walk_min, cp.note
       FROM campus_paths cp
       JOIN buildings b1 ON cp.from_building_id = b1.id
       JOIN buildings b2 ON cp.to_building_id = b2.id
       ORDER BY b1.name, cp.distance_m ASC`
    );

    // ═══ INTENT DETECTION ══════════════════════════════════════════════
    let wantsRoom = false;
    let wantsClass = false;
    let wantsParking = false;
    let wantsDistance = false;
    if (history && history.length > 0) {
      const lastMsg = (history[history.length - 1].content || '').toLowerCase();
      wantsRoom     = /\b(empty|quiet|free|available|khali|calm|seat|study|room|classroom)\b/.test(lastMsg);
      wantsClass    = /\bclass\b|\bcourse\b|\blecture\b|\blab\b|\bschedule\b|\btimetable\b|\bnext class\b|\bmy class\b/.test(lastMsg) && !wantsRoom;
      wantsParking  = /\b(park|parking|car|spot|vehicle|bike|two.?wheel)\b/.test(lastMsg);
      wantsDistance  = /\b(distance|far|near|close|walk|how long|reach|get to|way to)\b/.test(lastMsg);
    }

    // ═══ BUILD TIMETABLE SECTION ═════════════════════════════════════════
    let timetableCtx = `\n### TIMETABLE (${dateStr}, IST: ${istTimeStr}):\n`;

    if (!wantsRoom || wantsClass) {
      if (ongoingClasses.length) {
        timetableCtx += `\n**RIGHT NOW — ${ongoingClasses.length} class(es):**\n`;
        ongoingClasses.forEach(c => {
          const minsLeft = minutesUntil(c.end_time, totalMinNow);
          // find the building for this room
          const roomInfo = roomsWithDist.find(r => r.room_name && r.room_name.toLowerCase() === (c.room_name || '').toLowerCase());
          const bldg = roomInfo ? roomInfo.building_name : c.room_block;
          const distInfo = roomInfo ? `~${roomInfo.distM}m / ${roomInfo.walkMin} min from you` : '';
          timetableCtx += `  🔴 ${c.course_code} "${c.course_name}" by ${c.instructor} | ${c.room_name} in ${bldg} | Ends in ~${minsLeft} min | ${c.enrolled}/${c.capacity} enrolled | ${distInfo}\n`;
        });
      } else {
        timetableCtx += `\n**No classes happening right now (${istTimeStr}).**\n`;
      }

      if (upcomingClasses.length) {
        timetableCtx += `\n**UPCOMING TODAY (${upcomingClasses.length}):**\n`;
        upcomingClasses.forEach(c => {
          const minsUntil = minutesUntil(c.start_time, totalMinNow);
          const fillPct = Math.min(99, Math.round((c.enrolled / Math.max(1, c.capacity)) * 100));
          const roomInfo = roomsWithDist.find(r => r.room_name && r.room_name.toLowerCase() === (c.room_name || '').toLowerCase());
          const bldg = roomInfo ? roomInfo.building_name : c.room_block;
          const distInfo = roomInfo ? `${roomInfo.distM}m away` : '';
          timetableCtx += `  ⏳ ${c.course_code} "${c.course_name}" | ${c.room_name} (${bldg}) | ${c.start_time}–${c.end_time} (in ~${minsUntil} min) | ~${fillPct}% full | ${distInfo}\n`;
        });
      }

      if (completedClasses.length) {
        timetableCtx += `\n**DONE TODAY:** ${completedClasses.map(c => `${c.course_code} (${c.start_time}–${c.end_time})`).join(' | ')}\n`;
      }

      timetableCtx += `\n**TODAY'S TOTAL:** ${todayClasses.length} classes on ${currentDay}`;
      if (todayClasses.length) {
        timetableCtx += ` | First: ${todayClasses[0].start_time} | Last ends: ${todayClasses[todayClasses.length - 1].end_time}`;
      }
      timetableCtx += '\n';

      // TOMORROW
      timetableCtx += `\n**TOMORROW (${tomorrowDay}) — ${tomorrowClasses.length} classes:**\n`;
      if (tomorrowClasses.length) {
        tomorrowClasses.slice(0, 8).forEach(c => {
          const fillPct = Math.min(99, Math.round((c.enrolled / Math.max(1, c.capacity)) * 100));
          timetableCtx += `  📅 ${c.start_time} ${c.course_code} "${c.course_name}" in ${c.room_name} | ~${fillPct}% full\n`;
        });
      } else {
        timetableCtx += `  No classes scheduled.\n`;
      }

      // WEEKLY
      if (weekOverview.length) {
        timetableCtx += `\n**WEEKLY OVERVIEW:**\n`;
        weekOverview.forEach(w => {
          timetableCtx += `  ${w.day_of_week}: ${w.class_count} classes (${w.first_class}–${w.last_class}), ~${w.total_students} students\n`;
        });
      }
    } else {
      timetableCtx += `[Timetable hidden — user asked about rooms only]\n`;
    }

    // ═══ PREDICTION SECTION ══════════════════════════════════════════════
    let predictionCtx = `\n### FUTURE PREDICTIONS:\n`;

    if (soonToFillRooms.length) {
      predictionCtx += `\n**ROOMS FILLING UP SOON:**\n`;
      soonToFillRooms.slice(0, 6).forEach(c => {
        const minsTill = minutesUntil(c.start_time, totalMinNow);
        const predictedPct = Math.min(99, Math.round((c.enrolled / Math.max(1, c.capacity)) * 100));
        if (minsTill >= 0 && minsTill <= 120) {
          predictionCtx += `  ⚠️ ${c.room_name} (Block-${c.room_block}) → ${c.course_code} "${c.course_name}" in ~${minsTill} min → will go to ~${predictedPct}% full (${c.enrolled} students)\n`;
        }
      });
    }

    if (soonToFreeRooms.length) {
      predictionCtx += `\n**ROOMS ABOUT TO FREE UP:**\n`;
      soonToFreeRooms.forEach(c => {
        const minsLeft = minutesUntil(c.end_time, totalMinNow);
        if (minsLeft >= 0 && minsLeft <= 40) {
          predictionCtx += `  🔓 ${c.room_name}: ${c.course_code} ends in ~${minsLeft} min → ${c.enrolled} students will leave\n`;
        }
      });
    }

    // ═══ CLASSROOM STATUS (with distance from user!) ════════════════════
    let classroomCtx = `\n### LIVE CLASSROOM STATUS (${roomsWithDist.length} rooms, campus avg: ${avgFullness}% full):\n`;

    classroomCtx += `\n**QUIET (<30% full) — ${emptyRooms.length} rooms (sorted by distance from you):**\n`;
    emptyRooms.slice(0, 15).forEach(r => {
      // Check if a class starts here soon
      const soonClass = soonToFillRooms.find(s => s.room_name && r.room_name && s.room_name.toLowerCase() === r.room_name.toLowerCase());
      const warning = soonClass ? ` ⚠️ CLASS IN ~${minutesUntil(soonClass.start_time, totalMinNow)} min!` : ' ✅ No class coming';
      classroomCtx += `  🟢 ${r.room_name} (${r.building_name}, Floor ${r.floor}): ${r.occPct}% full (${r.freeSeats} free seats) | ${r.distM}m away (~${r.walkMin} min walk)${warning}\n`;
    });

    classroomCtx += `\n**MODERATE (30–70%) — ${moderateRooms.length} rooms:**\n`;
    moderateRooms.slice(0, 8).forEach(r => {
      classroomCtx += `  🟡 ${r.room_name} (${r.building_name}): ${r.occPct}% full | ${r.distM}m away\n`;
    });

    classroomCtx += `\n**CROWDED (>70%) — ${crowdedRooms.length} rooms:**\n`;
    crowdedRooms.slice(0, 6).forEach(r => {
      classroomCtx += `  🔴 ${r.room_name} (${r.building_name}): ${r.occPct}% full\n`;
    });

    // ═══ PARKING ═════════════════════════════════════════════════════════
    let parkingCtx = `\n### LIVE PARKING (${totalFreeP}/${totalP} spots free campus-wide):\n`;
    parkingByZone.forEach(p => {
      const usedPct = p.total > 0 ? Math.round(((p.total - p.free) / p.total) * 100) : 0;
      const emoji = usedPct >= 80 ? '🔴' : usedPct >= 50 ? '🟡' : '🟢';
      parkingCtx += `  ${emoji} ${p.zone} (${p.location_desc || 'campus'}): ${p.free}/${p.total} free (${usedPct}% used)\n`;
    });

    // ═══ REAL DISTANCES (from campus_paths) ══════════════════════════════
    let distCtx = '';
    if (campusDistances.length) {
      distCtx = `\n### CAMPUS WALKING DISTANCES (real data):\n`;
      // Group by from_building
      const grouped = {};
      campusDistances.forEach(d => {
        if (!grouped[d.from_building]) grouped[d.from_building] = [];
        grouped[d.from_building].push(d);
      });
      for (const [from, targets] of Object.entries(grouped)) {
        targets.forEach(d => {
          distCtx += `  ${from} → ${d.to_building}: ${d.distance_m}m (~${d.walk_min} min) — ${d.note || ''}\n`;
        });
      }
    }

    // ═══ USER PROXIMITY SUMMARY ═════════════════════════════════════════
    // Tell the AI which buildings are nearest to the user right now
    const buildings = await safeRows(`SELECT name, lat, lng FROM buildings WHERE lat IS NOT NULL`);
    let proximityCtx = `\n### YOUR CURRENT PROXIMITY (from your GPS location):\n`;
    const bldgDists = buildings.map(b => ({
      name: b.name,
      dist: Math.round(haversineM(userLat, userLng, parseFloat(b.lat), parseFloat(b.lng)))
    })).sort((a, b) => a.dist - b.dist);
    bldgDists.forEach(b => {
      const walkMin = Math.max(1, Math.round(b.dist / 75));
      proximityCtx += `  📍 ${b.name}: ${b.dist}m (~${walkMin} min walk)\n`;
    });

    // ═══ CONVERSATION ANTI-REPETITION ════════════════════════════════════
    const prevRooms = extractMentionedRooms(history || []);
    let antiRepCtx = '';
    if (prevRooms.length) {
      antiRepCtx = `\n### ROOMS YOU ALREADY RECOMMENDED (DO NOT suggest these again unless user asks specifically):\n`;
      antiRepCtx += `  ${prevRooms.join(', ')}\n`;
      antiRepCtx += `  → Pick DIFFERENT rooms from the data above. The user wants fresh options.\n`;
    }

    const recentAnswerSnippets = (history || []).slice(-4)
      .filter(h => h.role === 'assistant')
      .map(h => h.content.slice(0, 100))
      .join(' | ');
    if (recentAnswerSnippets) {
      antiRepCtx += `\n### YOUR RECENT ANSWERS (vary your wording, opening, and structure):\n${recentAnswerSnippets}\n`;
    }

    // ═══ FINAL SYSTEM PROMPT ═════════════════════════════════════════════
    return `You are CampusFlow AI — the IITB Campus Intelligence Assistant. You have LIVE, REAL-TIME database access to the entire campus.

### USER CONTEXT:
- **DATE:** ${dateStr}
- **TIME:** ${istTimeStr} IST
- **LOCATION:** Lat ${userLat}, Lng ${userLng}, Floor ${userFloor}
- **NEAREST BUILDING:** ${bldgDists.length ? bldgDists[0].name + ' (' + bldgDists[0].dist + 'm)' : 'Unknown'}

${timetableCtx}
${predictionCtx}
${classroomCtx}
${parkingCtx}
${distCtx}
${proximityCtx}
${antiRepCtx}

─────────────────────────────────────────────────────────────────────────────
INTELLIGENCE RULES — FOLLOW THESE EXACTLY:

0. **🚨 ANSWER ONLY WHAT WAS ASKED:** If user asks about empty/quiet rooms → talk ONLY about rooms. If about parking → ONLY parking. If about schedule → ONLY schedule. NEVER volunteer unrelated information. Mixing topics = FAILURE.

1. **ALWAYS INCLUDE DISTANCE:** When recommending any room, ALWAYS mention:
   - The building it's in (e.g., "LHC-11 in LHC building")
   - How far it is from the user in meters and walk minutes
   - How many free seats
   Example: "LHC-11 in LHC (280m, ~4 min walk) — just 12% full with 132 free seats"

2. **ALWAYS INCLUDE DISTANCE FOR PARKING:** When recommending parking, use the campus distances data to say how far each zone is from major buildings.

3. **PREDICT THE FUTURE:** Before recommending a room, check if a class is starting there soon. If yes, WARN the user. Suggest rooms with NO upcoming classes as "safe" choices.

4. **VARY YOUR RESPONSE EVERY TIME:** Check the ROOMS YOU ALREADY RECOMMENDED section. NEVER suggest the same room twice in the same conversation unless the user asks about it. Pick different rooms. Vary your opening sentence, structure, and tone.

5. **FUTURE-AWARE:** Use "ROOMS ABOUT TO FREE UP" to suggest rooms that will be empty soon.

6. **DAY-AND-DATE AWARE:** Today is ${dateStr}. If asked about "tomorrow" give ${tomorrowDay}'s schedule. If asked about any specific day, look up that day's data. Remember: different days have DIFFERENT schedules.

7. **CONCISE BUT DATA-RICH:** 2-5 sentences. Include % occupancy, free seats, distance, and walk time. No tables, no JSON, no UUIDs.

8. **EXAMPLE GOOD RESPONSE to "which room is empty?":**
   "Right now your closest quiet room is LHC-11 in LHC building (280m, ~4 min walk) — only 8% full with 138 free seats, and no class until 2 PM. Another option is SIC-201 in KReSIT (350m, ~5 min) at 5% full. I'd avoid LC101 — it looks empty but MA105 with 140 students starts there in 25 min."

9. **EXAMPLE GOOD RESPONSE to "where to park?":**
   "VMCC Underground has 3 free spots and is closest to LHC (420m walk). KReSIT Parking has 1 free spot right behind the CSE building. Avoid Main Gate Zone — only 1 spot and it's 280m from LHC."

10. **EXAMPLE BAD RESPONSE (NEVER DO THIS):**
    "Your next class is MA105 in LC101." ← User asked about rooms, NOT schedule.
    "SIC-205 is empty." ← No distance, no seats, no building, no prediction. Useless.
─────────────────────────────────────────────────────────────────────────────`;
  } catch (err) {
    console.error('[buildSystemContext Error]', err.message);
    return `You are CampusFlow AI — a helpful campus assistant. The database is temporarily unavailable (${err.message}). Answer based on general IITB campus knowledge.`;
  }
}

// ─── Deterministic fallback (no API key) — also fully rewritten ───────────
async function deterministicFallback(res, question = '') {
  try {
    const { currentDay, tomorrowDay, istTimeStr, totalMinNow, dateStr } = getISTContext();

    // Get rooms with building info + distances from default campus center
    const defaultLat = 19.1334, defaultLng = 72.9133;
    const classrooms = await safeRows(
      `SELECT r.room_number AS room_name, r.room_type, r.capacity,
              COALESCE(r.current_occupancy, 0) AS current_occupancy,
              b.name AS building_name, b.lat, b.lng
       FROM rooms r
       JOIN floors f ON r.floor_id = f.id
       JOIN buildings b ON f.building_id = b.id
       WHERE r.capacity > 0 AND r.is_available IS NOT FALSE
       ORDER BY COALESCE(r.current_occupancy::float / NULLIF(r.capacity, 0), 0) ASC
       LIMIT 20`
    );

    const roomsWithDist = classrooms.map(r => {
      const distM = (r.lat && r.lng)
        ? Math.round(haversineM(defaultLat, defaultLng, parseFloat(r.lat), parseFloat(r.lng)))
        : 999;
      const walkMin = Math.max(1, Math.round(distM / 75));
      const occPct = r.capacity > 0 ? Math.round((r.current_occupancy / r.capacity) * 100) : 0;
      const freeSeats = r.capacity - r.current_occupancy;
      return { ...r, distM, walkMin, occPct, freeSeats };
    });

    const nextClass = await safeRows(
      `SELECT course_code, course_name, instructor, room_name, room_block, start_time, end_time, capacity, enrolled
       FROM timetable WHERE day_of_week = $1 AND start_time > $2
       ORDER BY start_time ASC LIMIT 3`,
      [currentDay, istTimeStr]
    );

    const ongoingClass = await safeRows(
      `SELECT course_code, course_name, room_name, room_block, start_time, end_time, enrolled, capacity
       FROM timetable WHERE day_of_week = $1 AND start_time <= $2 AND end_time >= $2
       ORDER BY start_time ASC LIMIT 3`,
      [currentDay, istTimeStr]
    );

    const soonToFillRooms = await safeRows(
      `SELECT room_name, start_time, course_code, enrolled, capacity
       FROM timetable WHERE day_of_week = $1 AND start_time > $2
       ORDER BY start_time ASC LIMIT 8`,
      [currentDay, istTimeStr]
    );

    const freeParking = await safeRows(
      `SELECT pz.zone_name AS zone, pz.location_desc,
              COUNT(ps.id) AS free_count, pz.total_slots
       FROM parking_zones pz
       JOIN parking_slots ps ON ps.zone_id = pz.id
       WHERE ps.is_occupied = false
       GROUP BY pz.zone_name, pz.location_desc, pz.total_slots
       ORDER BY free_count DESC LIMIT 4`
    );

    const tomorrowClasses = await safeRows(
      `SELECT course_code, course_name, room_name, start_time, end_time, enrolled, capacity
       FROM timetable WHERE day_of_week = $1 ORDER BY start_time ASC LIMIT 8`,
      [tomorrowDay]
    );

    // Get campus distances for parking context
    const campusDistances = await safeRows(
      `SELECT b1.name AS from_building, b2.name AS to_building,
              cp.distance_m, cp.walk_min
       FROM campus_paths cp
       JOIN buildings b1 ON cp.from_building_id = b1.id
       JOIN buildings b2 ON cp.to_building_id = b2.id
       ORDER BY b1.name, cp.distance_m ASC`
    );

    const q = String(question || '').toLowerCase();

    // ── Intent detection ──────────────────────────────────────────────────
    const wantsRoom       = /\b(empty|quiet|free|available|khali|calm|seat|study)\b|\broom\b|\bclassroom\b/.test(q);
    const wantsParking    = /\b(park|parking|car|spot|vehicle|two.?wheel|bike)\b/.test(q);
    const wantsClass      = !wantsRoom && /\bclass\b|\bcourse\b|\blecture\b|\blab\b|\bschedule\b|\btimetable\b|\bnext class\b|\bmy class\b/.test(q);
    const wantsNextClass  = !wantsRoom && /\bnext\b|\bkab\b|\bwhen is\b|\bwhat time\b/.test(q) && wantsClass;
    const wantsTomorrow   = /\btomorrow\b|\bkal\b|\bnext day\b/.test(q);
    const wantsPrediction = /\bpredict\b|\bwill\b|\bfuture\b|\bfill\b|\bcongestion\b|\bexpect\b|\bsoon\b|\blater\b/.test(q) && !wantsRoom;
    const wantsDistance   = /\b(distance|far|near|close|walk|how long|reach|get to|way to)\b/.test(q);

    const parts = [];

    // Course code lookup
    const codeMatch = String(question || '').match(/\b([A-Za-z]{2,}\s*-?\s*\d{2,4})\b/);
    if (codeMatch) {
      const code = codeMatch[1].replace(/\s+/g, '').toUpperCase();
      const codeRows = await safeRows(
        `SELECT course_code, course_name, instructor, room_name, day_of_week, start_time, end_time, enrolled, capacity
         FROM timetable WHERE REPLACE(UPPER(course_code), ' ', '') = $1
         ORDER BY CASE day_of_week
           WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
           WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
           ELSE 7 END, start_time LIMIT 7`,
        [code]
      );
      if (codeRows.length) {
        const slots = codeRows.map(r => `${r.day_of_week} ${r.start_time}–${r.end_time} in ${r.room_name} (${r.enrolled}/${r.capacity})`).join('; ');
        parts.push(`📚 ${codeRows[0].course_code} — ${codeRows[0].course_name} by ${codeRows[0].instructor}: ${slots}.`);
      }
    }

    // ── Response builder ────────────────────────────────────────────────
    if (wantsRoom) {
      const topRooms = roomsWithDist.filter(r => r.occPct < 40).sort((a, b) => (a.distM + a.occPct * 5) - (b.distM + b.occPct * 5));
      if (topRooms.length) {
        const roomLines = [];
        for (const r of topRooms.slice(0, 5)) {
          const soonClass = soonToFillRooms.find(s => s.room_name && r.room_name && s.room_name.toLowerCase() === r.room_name.toLowerCase());
          let warning = '';
          if (soonClass) {
            const minsUntil = minutesUntil(soonClass.start_time, totalMinNow);
            warning = ` ⚠️ But ${soonClass.course_code} (${soonClass.enrolled} students) starts in ~${minsUntil} min!`;
          } else {
            warning = ' ✅ No class coming soon';
          }
          roomLines.push(`${r.room_name} in ${r.building_name} (${r.distM}m, ~${r.walkMin} min walk): ${r.occPct}% full, ${r.freeSeats} free seats${warning}`);
        }
        parts.push(`Here are the quietest rooms nearest to you right now:\n• ${roomLines.join('\n• ')}`);
      } else {
        parts.push('All rooms are fairly busy right now. Try the Central Library Reading Room for quiet study space.');
      }

    } else if (wantsParking) {
      if (freeParking.length) {
        const lines = freeParking.map(p => {
          const nearDist = campusDistances.find(d => d.from_building && d.from_building.toLowerCase().includes(p.zone.split(' ')[0].toLowerCase()));
          const distInfo = nearDist ? ` — ${nearDist.distance_m}m / ${nearDist.walk_min} min to ${nearDist.to_building}` : '';
          return `${p.zone} (${p.location_desc || ''}): ${p.free_count}/${p.total_slots} free${distInfo}`;
        });
        parts.push(`🅿️ Best parking right now:\n• ${lines.join('\n• ')}`);
      } else {
        parts.push('Parking data is temporarily unavailable.');
      }

    } else if (wantsDistance) {
      if (campusDistances.length) {
        const distLines = campusDistances.slice(0, 10).map(d => `${d.from_building} → ${d.to_building}: ${d.distance_m}m (~${d.walk_min} min)`);
        parts.push(`📍 Campus walking distances:\n• ${distLines.join('\n• ')}`);
      } else {
        parts.push('Distance data is being loaded.');
      }

    } else if (wantsTomorrow && tomorrowClasses.length) {
      const tc = tomorrowClasses;
      const lines = tc.map(c => {
        const fillPct = Math.round((c.enrolled / Math.max(1, c.capacity)) * 100);
        return `${c.start_time}–${c.end_time}: ${c.course_code} "${c.course_name}" in ${c.room_name} (~${fillPct}% expected)`;
      });
      parts.push(`📅 Tomorrow (${tomorrowDay}) — ${tc.length} classes:\n• ${lines.join('\n• ')}`);

    } else if (wantsClass) {
      if (ongoingClass.length) {
        const lines = ongoingClass.map(c => {
          const minsLeft = minutesUntil(c.end_time, totalMinNow);
          const roomInfo = roomsWithDist.find(r => r.room_name && r.room_name.toLowerCase() === (c.room_name || '').toLowerCase());
          const distInfo = roomInfo ? ` | ${roomInfo.distM}m away (~${roomInfo.walkMin} min walk)` : '';
          return `🔴 ${c.course_code} "${c.course_name}" in ${c.room_name} | ends in ~${minsLeft} min${distInfo}`;
        });
        parts.push(`Classes happening right now:\n${lines.join('\n')}`);
      }
      if (nextClass.length) {
        const lines = nextClass.map(c => {
          const minsUntil = minutesUntil(c.start_time, totalMinNow);
          const roomInfo = roomsWithDist.find(r => r.room_name && r.room_name.toLowerCase() === (c.room_name || '').toLowerCase());
          const distInfo = roomInfo ? ` | ${roomInfo.distM}m (~${roomInfo.walkMin} min walk)` : '';
          return `⏳ ${c.course_code} "${c.course_name}" by ${c.instructor} at ${c.start_time} in ${c.room_name}${distInfo}`;
        });
        parts.push(`Upcoming classes:\n${lines.join('\n')}`);
      }
      if (!ongoingClass.length && !nextClass.length) {
        parts.push(`No more classes scheduled for today (${currentDay}).`);
      }

    } else if (wantsPrediction) {
      const soonFree = await safeRows(
        `SELECT room_name, end_time, course_code, enrolled
         FROM timetable WHERE day_of_week = $1 AND start_time <= $2 AND end_time >= $2
         ORDER BY end_time ASC LIMIT 3`,
        [currentDay, istTimeStr]
      );
      if (soonFree.length) {
        const lines = soonFree.map(r => `${r.room_name}: ${r.course_code} ends at ${r.end_time} (${r.enrolled} students leaving)`);
        parts.push(`🔮 Rooms that will free up soon:\n• ${lines.join('\n• ')}`);
      }
    }

    if (!parts.length) {
      parts.push(`CampusFlow AI (${dateStr}). Ask me:\n- Which room is empty?\n- Where to park?\n- What is my schedule today?\n- What is my schedule tomorrow?\n- How far is LHC from KReSIT?\n- Any course code like MA105 or CS101`);
    }

    return res.json({ assistant_text: parts.join('\n\n') });
  } catch (err) {
    console.error('[deterministicFallback Error]', err.message);
    return res.json({ assistant_text: 'Campus data is temporarily unavailable. Please try again shortly.' });
  }
}

function isRoomAvailabilityQuery(question = '') {
  const q = String(question || '').toLowerCase();
  const hasRoomWord = /\b(room|classroom|classroon)\b/.test(q);
  const hasAvailabilityWord = /\b(empty|free|available|vacant|bookable|book)\b/.test(q);
  const hasExcludedIntent = /\b(canteen|cafeteria|food|library|parking|park|schedule|timetable|next class|course)\b/.test(q);
  return (hasRoomWord && !hasExcludedIntent) || (hasRoomWord && hasAvailabilityWord);
}

function isAmenityQuery(question = '') {
  const q = String(question || '').toLowerCase();
  return /\b(canteen|cafeteria|food|library|reading room|study area)\b/.test(q);
}

function isParkingQuery(question = '') {
  const q = String(question || '').toLowerCase();
  return /\b(parking|park|car|vehicle|bike|slot)\b/.test(q);
}

function isScheduleQuery(question = '') {
  const q = String(question || '').toLowerCase();
  const hasScheduleWord = /\b(schedule|timetable|class|classes|lecture|course|next class|upcoming class|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(q);
  const hasRoomOrAmenityWord = /\b(room|classroom|classroon|canteen|library|parking|park)\b/.test(q);
  return hasScheduleWord && !hasRoomOrAmenityWord;
}

function toMinutes(hhmm = '') {
  const parts = String(hhmm).split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return (h * 60) + m;
}

async function buildParkingLiveResponse() {
  const rows = await safeRows(
    `SELECT spot_name, status, distance_from_main
     FROM parking_spots
     ORDER BY distance_from_main ASC, spot_name ASC`
  );

  if (!rows.length) {
    return { assistant_text: '- Parking data is unavailable right now.', cards: [] };
  }

  const total = rows.length;
  const freeRows = rows.filter((r) => String(r.status || '').toLowerCase() === 'empty');
  const occupiedRows = total - freeRows.length;
  const freePct = Math.round((freeRows.length / Math.max(1, total)) * 100);

  const topFree = freeRows.slice(0, 6).map((r) => `${r.spot_name} (${r.distance_from_main || 0}m)`).join(', ');

  const text = [
    `- Live parking status: ${freeRows.length}/${total} spots free (${freePct}% free).`,
    `- Occupied spots: ${occupiedRows}/${total}.`,
    freeRows.length ? `- Nearest free spots: ${topFree}.` : '- No free parking spot right now.'
  ].join('\n');

  return {
    assistant_text: text,
    cards: freeRows.slice(0, 6).map((r, idx) => ({
      title: r.spot_name,
      subtitle: `Free | ${r.distance_from_main || 0}m from main`,
      priority: idx + 1,
      status: 'FREE'
    }))
  };
}

async function buildScheduleLiveResponse(question = '') {
  const { currentDay, tomorrowDay, istTimeStr } = getISTContext();
  const q = String(question || '').toLowerCase();
  const requestedDay = dayFromQuestion(question, currentDay, tomorrowDay);

  const rows = await safeRows(
    `SELECT day, time_slot, room_name, course, instructor, expected_students
     FROM timetable
     WHERE day = $1
     ORDER BY TO_TIMESTAMP(SPLIT_PART(time_slot, '-', 1), 'HH24:MI')::time ASC`,
    [requestedDay]
  );

  if (!rows.length) {
    return { assistant_text: `- No classes scheduled for ${requestedDay}.`, cards: [] };
  }

  const nowMin = toMinutes(String(istTimeStr).slice(0, 5));
  const upcoming = rows.filter((r) => toMinutes(String(r.time_slot).split('-')[0]) >= nowMin);
  const wantsNext = /\bnext|upcoming\b/.test(q);
  const view = wantsNext && requestedDay === currentDay ? upcoming : rows;

  const lines = view.slice(0, 8).map((r) => `- ${r.time_slot}: ${r.course} in ${r.room_name} (${r.instructor})`);
  const title = wantsNext && requestedDay === currentDay
    ? `- Upcoming classes for ${requestedDay}:`
    : `- Schedule for ${requestedDay}:`;

  return {
    assistant_text: `${title}\n${lines.join('\n')}`,
    cards: view.slice(0, 8).map((r, idx) => ({
      title: `${r.time_slot} ${r.course}`,
      subtitle: `${r.room_name} | ${r.instructor} | ${r.expected_students} students`,
      priority: idx + 1,
      status: 'SCHEDULE'
    }))
  };
}

async function buildAmenitySimulationResponse(question = '') {
  const q = String(question || '').toLowerCase();
  const asksLibrary = /\blibrary|reading room|study area\b/.test(q);
  const asksCanteen = /\bcanteen|cafeteria|food\b/.test(q);

  const studentRows = await safeRows(
    `SELECT COUNT(*)::int AS total_students FROM people WHERE type = 'student'`
  );
  const totalStudents = Number(studentRows[0]?.total_students || 100);

  const names = asksLibrary && !asksCanteen
    ? ['Library']
    : asksCanteen && !asksLibrary
      ? ['Canteen1', 'Canteen2']
      : ['Canteen1', 'Canteen2', 'Library'];

  const snapshot = getAmenitySimulationSnapshot();
  const records = snapshot.records
    .filter((r) => names.includes(r.name))
    .map((r) => ({
      name: r.name,
      cap: r.capacity,
      occ: r.occupancy,
      emptyPct: r.emptyPct,
      filledPct: r.filledPct,
      predictedOcc15m: r.predictedOcc15m,
      predictedEmpty15m: r.predictedEmpty15m,
      studentSharePct: Math.round((r.occupancy / Math.max(1, totalStudents)) * 100),
      suggestion: r.suggestion,
    }))
    .sort((a, b) => b.emptyPct - a.emptyPct);

  const lines = records.map((r) =>
    `- ${r.name}\n` +
    `  - Live now: ${r.emptyPct}% empty, ${r.filledPct}% occupied\n` +
    `  - Students share: ${r.studentSharePct}%\n` +
    `  - Prediction (15 min): ${r.predictedEmpty15m}% empty\n` +
    `  - Suggestion: ${r.suggestion}`
  );

  const templates = [
    'Live simulation update (refreshes every 30 seconds):',
    'Current live simulation status (updated every 30 seconds):',
    'Real-time simulated crowd report (30-second update cycle):',
  ];
  const title = templates[pickVariant(question, records.length, templates.length)];
  const updatedAt = new Date(snapshot.updatedAt).toLocaleTimeString('en-IN', { hour12: false });

  return {
    assistant_text: `${title}\nLast updated: ${updatedAt} IST\n\n${lines.join('\n')}`,
    cards: records.map((r, idx) => ({
      title: r.name,
      subtitle: `${r.emptyPct}% empty | ${r.filledPct}% occupied | 15 min prediction: ${r.predictedEmpty15m}% empty`,
      priority: idx + 1,
      status: r.emptyPct >= 55 ? 'GO_NOW' : (r.emptyPct >= 30 ? 'CHECK' : 'AVOID'),
      occupancy: r.occ,
      capacity: r.cap,
      empty_pct: r.emptyPct,
      filled_pct: r.filledPct,
      students_pct: r.studentSharePct,
      predicted_empty_pct_15m: r.predictedEmpty15m,
    })),
  };
}

function formatAssistantBullets(text = '') {
  const input = String(text || '').trim();
  if (!input) return input;
  if (/\n\s*[-•]/.test(input)) return input;

  const parts = input
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, 6);

  if (parts.length <= 1) return input;
  return parts.map((p) => `- ${p.trim()}`).join('\n');
}

async function buildRoomAvailabilityByDayResponse(question = '') {
  const { currentDay, tomorrowDay } = getISTContext();
  const requestedDay = dayFromQuestion(question, currentDay, tomorrowDay);
  const dayNumber = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(requestedDay);

  const classrooms = await safeRows(
    `SELECT room_name, capacity, current_occupancy, distance_from_main
     FROM classrooms
     ORDER BY distance_from_main ASC, room_name ASC`
  );

  const busyRows = await safeRows(
    `SELECT DISTINCT room_name
     FROM timetable
     WHERE day = $1`,
    [requestedDay]
  );
  const busy = new Set(busyRows.map((r) => String(r.room_name || '').toUpperCase()));

  const available = classrooms
    .filter((r) => !busy.has(String(r.room_name || '').toUpperCase()))
    .map((r) => {
      return {
        room_name: r.room_name,
        distance_from_main: Number(r.distance_from_main || 0),
      };
    })
    .sort((a, b) => (a.distance_from_main - b.distance_from_main));

  if (!available.length) {
    return {
      assistant_text: `I checked the timetable for ${requestedDay}. No lecture-free classroom is available right now.`,
      cards: [],
    };
  }

  const templates = [
    {
      intro: `I checked the timetable for ${requestedDay}.`,
      note: `These classrooms do not have lectures on ${requestedDay}:`,
    },
    {
      intro: `Here are the lecture-free classrooms for ${requestedDay}.`,
      note: `You can book any of these rooms:`,
    },
    {
      intro: `Based on the ${requestedDay} timetable, these rooms are free.`,
      note: `Booking is possible for the rooms below:`,
    },
  ];
  const template = templates[pickVariant(question, dayNumber, templates.length)];

  const lines = available.slice(0, 6).map((r) =>
    `${r.room_name} - no lecture on ${requestedDay}; bookable.`
  );

  const extraInfo = `Nearest option first, based on distance from the main building.`;

  return {
    assistant_text: `${template.intro}\n${template.note}\n\n- ${lines.join('\n- ')}\n\n${extraInfo}`,
    cards: available.slice(0, 6).map((r, idx) => ({
      title: `${r.room_name}`,
      subtitle: `No lecture on ${requestedDay}; bookable.`,
      priority: idx + 1,
      room_name: r.room_name,
      distance_from_main: r.distance_from_main,
      status: 'FREE_NO_CLASS',
    })),
  };
}

// ─── Main route handler ────────────────────────────────────────────────────
exports.query = async (req, res, next) => {
  try {
    const { question, model, userLat, userLng, userFloor, sessionId } = req.body || {};
    if (!question) return res.status(400).json({ error: 'question required' });

    const sid = sessionId || req.ip || 'default';

    if (isAmenityQuery(question)) {
      const amenityResponse = await buildAmenitySimulationResponse(question);
      pushHistory(sid, 'user', question);
      pushHistory(sid, 'assistant', amenityResponse.assistant_text || '');
      return res.json(amenityResponse);
    }

    if (isParkingQuery(question)) {
      const parkingResponse = await buildParkingLiveResponse();
      pushHistory(sid, 'user', question);
      pushHistory(sid, 'assistant', parkingResponse.assistant_text || '');
      return res.json(parkingResponse);
    }

    // Deterministic day-aware room availability (lecture/timetable aware)
    if (isRoomAvailabilityQuery(question)) {
      const roomResponse = await buildRoomAvailabilityByDayResponse(question);
      pushHistory(sid, 'user', question);
      pushHistory(sid, 'assistant', roomResponse.assistant_text || '');
      return res.json(roomResponse);
    }

    if (isScheduleQuery(question)) {
      const scheduleResponse = await buildScheduleLiveResponse(question);
      pushHistory(sid, 'user', question);
      pushHistory(sid, 'assistant', scheduleResponse.assistant_text || '');
      return res.json(scheduleResponse);
    }

    const key = readKey();
    if (!key) return deterministicFallback(res, question);

    const lat   = parseFloat(userLat)  || 19.1334;
    const lng   = parseFloat(userLng)  || 72.9133;
    const floor = parseInt(userFloor)  || 0;

    const history = getHistory(sid);
    const systemPrompt = await buildSystemContext(lat, lng, floor, history);

    pushHistory(sid, 'user', question);

    const isGemini = !key.startsWith('sk-') && !key.startsWith('sk-proj-');

    // ── Gemini path ──────────────────────────────────────────────────────
    if (isGemini) {
      const geminiModel = model || 'gemini-2.0-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

      const historyContents = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      }));

      const contents = [
        { role: 'user',  parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I am CampusFlow AI with full live access to IITB timetable, classroom occupancy, building distances, parking, and predictive intelligence. I will always include distances, building names, free seats, and predictions in my answers. I will never repeat previous recommendations.' }] },
        ...historyContents,
        { role: 'user',  parts: [{ text: question }] }
      ];

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.8,
            topP: 0.92,
            topK: 40,
            maxOutputTokens: 1024
          }
        })
      });

      const json = await resp.json();

      if (!resp.ok) {
        console.warn(`Gemini API Failed (${resp.status}). Using deterministic fallback.`);
        return deterministicFallback(res, question);
      }

      const replyText = json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
      const formattedReply = formatAssistantBullets(replyText);
      pushHistory(sid, 'assistant', formattedReply);
      return res.json({ assistant_text: formattedReply });
    }

    // ── OpenAI path ──────────────────────────────────────────────────────
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: question }
    ];

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages: openaiMessages,
        max_tokens: 1024,
        temperature: 0.8,
        presence_penalty: 0.7,
        frequency_penalty: 0.5
      })
    });

    const json = await resp.json();

    if (!resp.ok) {
      console.warn(`OpenAI API Failed (${resp.status}). Using deterministic fallback.`);
      return deterministicFallback(res, question);
    }

    const replyText = json.choices?.[0]?.message?.content || 'No response from OpenAI.';
    const formattedReply = formatAssistantBullets(replyText);
    pushHistory(sid, 'assistant', formattedReply);
    return res.json({ assistant_text: formattedReply });

  } catch (err) {
    next(err);
  }
};

// Export for chatController
exports.buildSystemContext = buildSystemContext;
