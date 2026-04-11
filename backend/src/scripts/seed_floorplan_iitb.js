require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const buildings = [
  { name: 'Main Building', block: 'Admin Block', lat: 19.1334, lng: 72.9133 },
  { name: 'LHC', block: 'Lecture Hall Complex', lat: 19.1340, lng: 72.9140 },
  { name: 'KReSIT Building', block: 'CSE Dept', lat: 19.1350, lng: 72.9150 },
  { name: 'VMCC', block: 'Convention Centre', lat: 19.1325, lng: 72.9160 },
  { name: 'SOM', block: 'Management School', lat: 19.1315, lng: 72.9145 },
  { name: 'Central Library', block: 'Library', lat: 19.1330, lng: 72.9125 },
  { name: 'Electrical Dept', block: 'EE Block', lat: 19.1345, lng: 72.9120 },
  { name: 'Mechanical Dept', block: 'ME Block', lat: 19.1352, lng: 72.9115 },
  { name: 'Chemistry Dept', block: 'CH Block', lat: 19.1322, lng: 72.9118 },
  { name: 'Hostel Zone', block: 'Hostels', lat: 19.1305, lng: 72.9095 },
  { name: 'Canteen Complex', block: 'Food Court', lat: 19.1328, lng: 72.9139 }
];

const floorplanRooms = [
  { building: 'LHC', floor: 1, alias: 'L1', room: 'LC101', type: 'Classroom', capacity: 150 },
  { building: 'LHC', floor: 1, alias: 'L1', room: 'LC102', type: 'Classroom', capacity: 150 },
  { building: 'LHC', floor: 2, alias: 'L2', room: 'LC201', type: 'Classroom', capacity: 150 },
  { building: 'LHC', floor: 2, alias: 'L2', room: 'LC202', type: 'Classroom', capacity: 150 },
  { building: 'LHC', floor: 3, alias: 'L3', room: 'LC301', type: 'Classroom', capacity: 120 },
  { building: 'LHC', floor: 3, alias: 'L3', room: 'LC302', type: 'Classroom', capacity: 120 },
  { building: 'KReSIT Building', floor: 1, alias: 'K1', room: 'SIC-101', type: 'Computer Lab', capacity: 80 },
  { building: 'KReSIT Building', floor: 2, alias: 'K2', room: 'SIC-201', type: 'Classroom', capacity: 110 },
  { building: 'VMCC', floor: 0, alias: 'G', room: 'Auditorium 1', type: 'Auditorium', capacity: 400 },
  { building: 'VMCC', floor: 1, alias: 'V1', room: 'Seminar Rm 1', type: 'Seminar Hall', capacity: 60 },
  { building: 'Central Library', floor: 1, alias: 'CL1', room: 'Reading Rm 1', type: 'Reading Room', capacity: 300 },
  { building: 'Electrical Dept', floor: 1, alias: 'EE1', room: 'EE-101', type: 'Lab', capacity: 40 },
  { building: 'Main Building', floor: 0, alias: 'G', room: 'G-01', type: 'Admin Office', capacity: 10 },
  { building: 'Main Building', floor: 0, alias: 'G', room: 'G-05', type: 'Lobby', capacity: 100 },
  { building: 'SOM', floor: 1, alias: 'S1', room: 'SOM-101', type: 'Classroom', capacity: 70 },
  { building: 'SOM', floor: 1, alias: 'S1', room: 'SOM-102', type: 'Classroom', capacity: 70 }
];

const paths = [
  ['Main Building', 'LHC', 280, 4, 'Main walkway'],
  ['LHC', 'Central Library', 240, 3, 'Library road'],
  ['LHC', 'KReSIT Building', 350, 5, 'Academic spine'],
  ['LHC', 'VMCC', 420, 6, 'Through central lawn'],
  ['Main Building', 'Central Library', 220, 3, 'Admin side path'],
  ['KReSIT Building', 'VMCC', 300, 4, 'CSE connector'],
  ['SOM', 'Main Building', 310, 4, 'South corridor'],
  ['Hostel Zone', 'LHC', 950, 13, 'Hostel main road'],
  ['Hostel Zone', 'Main Building', 1100, 15, 'Lake side route'],
  ['Canteen Complex', 'LHC', 170, 2, 'Food court lane'],
  ['Canteen Complex', 'Central Library', 260, 4, 'North lane']
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const bMap = {};
    for (const b of buildings) {
      const r = await client.query(
        `INSERT INTO buildings (name, block_name, lat, lng)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE SET block_name = EXCLUDED.block_name, lat = EXCLUDED.lat, lng = EXCLUDED.lng
         RETURNING id`,
        [b.name, b.block, b.lat, b.lng]
      );
      bMap[b.name] = r.rows[0].id;
    }

    const fMap = {};
    for (const row of floorplanRooms) {
      const key = `${row.building}::${row.floor}`;
      if (!fMap[key]) {
        const f = await client.query(
          `INSERT INTO floors (building_id, floor_number, floor_alias, plan_description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (building_id, floor_number) DO UPDATE SET floor_alias = EXCLUDED.floor_alias
           RETURNING id`,
          [bMap[row.building], row.floor, row.alias, `${row.building} floor ${row.floor}`]
        );
        fMap[key] = f.rows[0].id;
      }

      await client.query(
        `INSERT INTO rooms (floor_id, room_number, room_type, capacity, has_projector, has_ac, is_available)
         VALUES ($1, $2, $3, $4, true, true, true)
         ON CONFLICT (floor_id, room_number)
         DO UPDATE SET room_type = EXCLUDED.room_type, capacity = EXCLUDED.capacity, is_available = true`,
        [fMap[key], row.room, row.type, row.capacity]
      );
    }

    for (const [from, to, dist, min, note] of paths) {
      await client.query(
        `INSERT INTO campus_paths (from_building_id, to_building_id, distance_m, walk_min, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (from_building_id, to_building_id)
         DO UPDATE SET distance_m = EXCLUDED.distance_m, walk_min = EXCLUDED.walk_min, note = EXCLUDED.note`,
        [bMap[from], bMap[to], dist, min, note]
      );
      await client.query(
        `INSERT INTO campus_paths (from_building_id, to_building_id, distance_m, walk_min, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (from_building_id, to_building_id)
         DO UPDATE SET distance_m = EXCLUDED.distance_m, walk_min = EXCLUDED.walk_min, note = EXCLUDED.note`,
        [bMap[to], bMap[from], dist, min, note]
      );
    }

    await client.query('COMMIT');
    console.log('IITB floorplan seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Floorplan seed failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
