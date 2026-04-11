require('dotenv').config();
const cron = require('node-cron');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function ts() {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

async function safeQuery(query, params) {
  for (let i = 0; i < 3; i++) {
    try {
      return await pool.query(query, params);
    } catch (err) {
      console.error(`${ts()} 🔁 Query error, retry ${i + 1}:`, err.message || err);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw new Error('DB query failed after retries');
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function simulatorFn() {
  console.log(`${ts()} 🔄 LIVE IITB SIMULATOR...`);

  try {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const now = new Date();
    const opts = { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' };
    const istTimeStr = new Intl.DateTimeFormat('en-US', opts).format(now);
    const day = days[now.getDay()];

    const timetableQuery = `
      SELECT room_name, capacity, enrolled 
      FROM timetable 
      WHERE day_of_week = $1 AND start_time <= $2 AND end_time >= $2
    `;
    const activeClassesRes = await safeQuery(timetableQuery, [day, istTimeStr]);
    const activeClasses = activeClassesRes.rows;
    // Build a map of active rooms
    const activeRoomMap = {};
    for (const c of activeClasses) activeRoomMap[c.room_name] = c;

    // 1) Update classrooms occupancy
    const roomsRes = await safeQuery("SELECT id, room_number, capacity, current_occupancy FROM rooms");
    for (const r of roomsRes.rows) {
      if (!r.capacity) continue;
      
      const { id, room_number, capacity, current_occupancy } = r;
      // Active class map usually matches room_name against room_number, let's treat them as equivalent
      const room_name = room_number;

      if (activeRoomMap[room_name]) { // It's class time!
        const classData = activeRoomMap[room_name];
        // Enforce high occupancy (80-95% of enrolled)
        const targetOcc = Math.min(capacity, Math.floor(classData.enrolled * (0.8 + Math.random() * 0.15)));
        
        // Slightly random fluctuation if already close to target
        let newOcc = targetOcc;
        if (current_occupancy > 0) {
            const delta = Math.floor(Math.random() * 5) - 2;
            newOcc = Math.max(Math.floor(capacity * 0.5), Math.min(targetOcc + delta, capacity));
        }

        if (newOcc !== current_occupancy) {
          const isAvail = newOcc < (capacity * 0.9);
          await safeQuery('UPDATE rooms SET current_occupancy = $1, is_available = $2 WHERE id = $3', [newOcc, isAvail, id]);
          console.log(`${ts()} 📚 Class active in ${room_name}: ${newOcc}/${capacity} filled`);
        }
      } else {
        // Normal random idle fluctuation
        if (Math.random() < 0.40) {
          const delta = Math.floor(Math.random() * 11) - 5;
          let newOcc = current_occupancy + delta;
          
          // Without class, room should gradually empty out to ~10%
          if (newOcc > capacity * 0.2) {
              newOcc -= Math.floor(Math.random() * 10) + 5; // empty faster
          }

          newOcc = Math.max(0, Math.min(newOcc, capacity));
          
          if (newOcc !== current_occupancy) {
            const isAvail = newOcc < (capacity * 0.9);
            await safeQuery('UPDATE rooms SET current_occupancy = $1, is_available = $2 WHERE id = $3', [newOcc, isAvail, id]);
            // const percent = Math.round((newOcc / capacity) * 100);
            // console.log(`${ts()} 🏫 Room ${room_name || room_number}: ${newOcc}/${capacity} (${percent}% full)`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`${ts()} ❌ Classrooms update failed:`, err.message || err);
  }

  // 2) Update parking slots occupancy
  try {
    const parkRes = await safeQuery('SELECT id, slot_number, is_occupied FROM parking_slots');
    for (const p of parkRes.rows) {
      let newStatus = p.is_occupied;

      // rules: empty -> occupied with 20% prob, occupied -> empty with 20% prob
      if (Math.random() < 0.20) {
        newStatus = !p.is_occupied;
        await safeQuery('UPDATE parking_slots SET is_occupied = $1 WHERE id = $2', [newStatus, p.id]);
        const verb = newStatus ? '→ CAR ARRIVED 🚗' : '→ CAR LEFT (Free) 🟢';
        console.log(`${ts()} 🅿️ Slot ${p.slot_number} ${verb}`);
      }
    }
  } catch (err) {
    console.error(`${ts()} ❌ Parking update failed:`, err.message || err);
  }
}

// run immediately once
simulatorFn().catch((e) => console.error(`${ts()} ❌ Simulator initial run failed:`, e.message || e));

// schedule every 30 seconds
cron.schedule('*/30 * * * * *', () => {
  simulatorFn().catch((e) => console.error(`${ts()} ❌ Simulator job error:`, e.message || e));
});

module.exports = { simulatorFn };
