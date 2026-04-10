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

  // 1) Update classrooms occupancy randomly
  try {
    const roomsRes = await safeQuery("SELECT id, room_number, capacity, current_occupancy FROM rooms");
    for (const r of roomsRes.rows) {
      if (!r.capacity) continue;
      
      const { id, room_number, capacity, current_occupancy } = r;

      // 40% chance the room's occupancy changes slightly
      if (Math.random() < 0.40) {
        // Change between -5 and +5 students
        const delta = Math.floor(Math.random() * 11) - 5;
        let newOcc = current_occupancy + delta;
        
        // Clamp between 0 and capacity
        newOcc = Math.max(0, Math.min(newOcc, capacity));
        
        if (newOcc !== current_occupancy) {
          // Update the occupancy, and calculate if it's "available" (let's say it's unavailable if >90% full)
          const isAvail = newOcc < (capacity * 0.9);
          
          await safeQuery('UPDATE rooms SET current_occupancy = $1, is_available = $2 WHERE id = $3', [newOcc, isAvail, id]);
          const percent = Math.round((newOcc / capacity) * 100);
          console.log(`${ts()} 🏫 Room ${room_number}: ${newOcc}/${capacity} (${percent}% full)`);
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
