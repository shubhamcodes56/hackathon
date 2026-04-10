const db = require('./src/config/db');

async function seed() {
    try {
        console.log('Ensuring default application exists...');
        await db.query("INSERT INTO apps (name) VALUES ('Default Application') ON CONFLICT (name) DO NOTHING");
        console.log('Default application verified. 🚀');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding:', err.message);
        process.exit(1);
    }
}

seed();
