const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigration() {
  const sqlPath = path.join(__dirname, 'migrations', '001_create_core_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    console.log('Connecting to DB...');
    await pool.connect();
    console.log('Running migration...');
    await pool.query(sql);
    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
