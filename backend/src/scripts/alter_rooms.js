const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function alterDb() {
    const client = await pool.connect();
    try {
        console.log('--- Altering rooms table ---');
        await client.query(`
            ALTER TABLE rooms 
            ADD COLUMN IF NOT EXISTS current_occupancy INTEGER DEFAULT 0;
        `);
        // update existing rows to some random occupancy just in case
        await client.query(`
            UPDATE rooms 
            SET current_occupancy = floor(random() * capacity * 0.8)
            WHERE current_occupancy IS NULL OR current_occupancy = 0;
        `);
        console.log('✅ Added current_occupancy column!');
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

alterDb();
