const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function seed() {
    const client = await pool.connect();
    try {
        console.log('--- Seeding Comprehensive IITB Campus Data ---');
        
        await client.query('TRUNCATE parking_slots, parking_zones, rooms, floors, buildings CASCADE');

        const bRes = await client.query(`
            INSERT INTO buildings (name, block_name, description, lat, lng)
            VALUES 
            ('Main Building', 'Admin Block', 'Central administrative hub of IITB', 19.1334, 72.9133),
            ('LHC', 'Lecture Hall Complex', 'Large lecture halls and seminar rooms', 19.1340, 72.9140),
            ('KReSIT Building', 'New CSE Dept', 'Computer Science and Engineering dept', 19.1350, 72.9150),
            ('VMCC', 'Victor Menezes Convention Centre', 'Massive halls and auditoriums for presentations', 19.1325, 72.9160),
            ('SOM', 'SJMSOM', 'School of Management Classrooms', 19.1315, 72.9145),
            ('Central Library', 'Library Block', 'Reading Rooms and references', 19.1330, 72.9125),
            ('Electrical Dept', 'EE Block', 'Electrical Engineering labs and classrooms', 19.1345, 72.9120)
            RETURNING id, name
        `);
        const b = bRes.rows;
        const bMap = {};
        b.forEach(x => bMap[x.name] = x.id);

        const floorsParams = [
            // Main Building
            [bMap['Main Building'], 0, 'Ground Floor', 'Registrar office and Lobby'],
            [bMap['Main Building'], 1, 'First Floor', 'Deans offices'],
            // LHC
            [bMap['LHC'], 1, 'LHC First Floor', 'Primary Lecture Halls'],
            [bMap['LHC'], 2, 'LHC Second Floor', 'Secondary Lecture Halls'],
            [bMap['LHC'], 3, 'LHC Third Floor', 'Smaller Seminar Rooms'],
            // CSE
            [bMap['KReSIT Building'], 1, 'First Floor', 'Computer Labs'],
            [bMap['KReSIT Building'], 2, 'Second Floor', 'Classrooms and staff rooms'],
            // VMCC
            [bMap['VMCC'], 0, 'Ground Floor', 'Large Auditoriums'],
            [bMap['VMCC'], 1, 'First Floor', 'Mini Auditoriums'],
            // SOM
            [bMap['SOM'], 1, 'First Floor', 'MBA Classrooms'],
            // Library
            [bMap['Central Library'], 1, 'First Floor', 'Reference reading room'],
            [bMap['Electrical Dept'], 1, 'First Floor', 'Electronics Labs']
        ];

        const fMap = {};
        for(let fp of floorsParams) {
            const fRes = await client.query(`
                INSERT INTO floors (building_id, floor_number, floor_alias, plan_description)
                VALUES ($1, $2, $3, $4) RETURNING id, floor_alias
            `, fp);
            fMap[fp[2]] = fRes.rows[0].id; // using alias as key
        }

        const roomParams = [
            // Main Building
            [fMap['Ground Floor'], 'G-01', 'Admin Office', 10, false, true, true],
            [fMap['Ground Floor'], 'G-05', 'Main Lobby', 100, true, true, true],
            // LHC 1
            [fMap['LHC First Floor'], 'LHC-11', 'Classroom', 150, true, true, true],
            [fMap['LHC First Floor'], 'LHC-12', 'Classroom', 200, true, true, true],
            [fMap['LHC First Floor'], 'LHC-14', 'Classroom', 120, true, true, true],
            // LHC 2
            [fMap['LHC Second Floor'], 'LHC-21', 'Classroom', 150, true, true, true],
            [fMap['LHC Second Floor'], 'LHC-22', 'Classroom', 180, true, true, true],
            [fMap['LHC Second Floor'], 'LHC-23', 'Classroom', 80, true, true, true],
            // LHC 3
            [fMap['LHC Third Floor'], 'LHC-31', 'Classroom', 60, true, true, true],
            // KReSIT
            [fMap['First Floor'], 'SIC-101', 'Computer Lab', 80, true, true, true],
            [fMap['Second Floor'], 'SIC-201', 'Classroom', 110, true, true, true],
            [fMap['Second Floor'], 'SIC-205', 'Classroom', 90, true, true, true],
            // VMCC
            [fMap['Ground Floor'], 'Auditorium 1', 'Auditorium', 400, true, true, true],
            [fMap['First Floor'], 'Seminar Rm 1', 'Seminar Hall', 60, true, true, true],
            [fMap['First Floor'], 'Seminar Rm 2', 'Seminar Hall', 60, true, true, true],
            // SOM
            [fMap['First Floor'], 'SOM-101', 'Classroom', 70, true, true, true],
            [fMap['First Floor'], 'SOM-102', 'Classroom', 70, true, true, true],
            // Library
            [fMap['First Floor'], 'Reading Rm 1', 'Reading Room', 300, false, true, true],
            // EE
            [fMap['First Floor'], 'EE-101', 'Lab', 40, true, true, true]
        ];

        for(let rp of roomParams) {
            await client.query(`
                INSERT INTO rooms (floor_id, room_number, room_type, capacity, has_projector, has_ac, is_available)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, rp);
        }

        const zRes = await client.query(`
            INSERT INTO parking_zones (zone_name, location_desc, total_slots)
            VALUES 
            ('Main Gate Zone', 'Near the main entrance gate', 50),
            ('KReSIT Parking', 'Behind the CSE building', 30),
            ('VMCC Underground', 'Basement of VMCC', 100),
            ('SOM Parking', 'Beside the Management building', 40)
            RETURNING id, zone_name
        `);
        const zones = zRes.rows;
        const zMap = {};
        zones.forEach(z => zMap[z.zone_name] = z.id);

        await client.query(`
            INSERT INTO parking_slots (zone_id, slot_number, is_occupied, vehicle_type)
            VALUES 
            ($1, 'MG-01', true, 'Car'), ($1, 'MG-02', false, 'Car'),
            ($2, 'KR-01', true, 'Bike'), ($2, 'KR-02', false, 'Car'),
            ($3, 'VM-01', false, 'Car'), ($3, 'VM-02', false, 'Car'), ($3, 'VM-03', false, 'Car'),
            ($4, 'SM-01', true, 'Car')
        `, [zMap['Main Gate Zone'], zMap['KReSIT Parking'], zMap['VMCC Underground'], zMap['SOM Parking']]);

        console.log('✅ Comprehensive IITB Data Seeded Successfully!');
    } catch (err) {
        console.error('❌ Error seeding data:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
