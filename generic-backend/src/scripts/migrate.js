const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runSQL() {
    const schemaPath = path.join(__dirname, '..', 'sql', 'campus_schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    try {
        console.log('--- Connecting to Database ---');
        const client = await pool.connect();
        console.log('--- Executing Campus Schema ---');
        await client.query(sql);
        console.log('✅ Schema created successfully!');
        client.release();
    } catch (err) {
        console.error('❌ Error executing SQL:', err.message);
    } finally {
        await pool.end();
    }
}

runSQL();
