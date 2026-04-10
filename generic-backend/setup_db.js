const { Client } = require('pg');

const config = {
    user: 'postgres',
    host: 'localhost',
    password: 'shubham22', // Updated with the password provided by the user
    port: 5432,
};

const schema = `
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CORE: APPLICATIONS
CREATE TABLE IF NOT EXISTS apps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    api_key_hash VARCHAR(255) UNIQUE,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CORE: USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    last_login_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(app_id, email)
);

-- RBAC
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    UNIQUE(app_id, name)
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    UNIQUE(app_id, name)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- AUDIT
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SETTINGS
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS sync_users_updated_at ON users;
CREATE TRIGGER sync_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

DROP TRIGGER IF EXISTS sync_apps_updated_at ON apps;
CREATE TRIGGER sync_apps_updated_at BEFORE UPDATE ON apps FOR EACH ROW EXECUTE PROCEDURE update_timestamp();
`;

async function setup() {
    console.log('--- Database Automation Setup ---');

    // 1. Create the Database
    const client = new Client({ ...config, database: 'postgres' });
    try {
        await client.connect();
        console.log('Connected to PostgreSQL server.');

        // Check if generic_db exists
        const res = await client.query("SELECT 1 FROM pg_database WHERE datname='generic_db'");
        if (res.rowCount === 0) {
            console.log('Creating database: generic_db...');
            await client.query('CREATE DATABASE generic_db');
            console.log('Database created successfully.');
        } else {
            console.log('Database generic_db already exists.');
        }
    } catch (err) {
        console.error('Connection error:', err.message);
        console.log('\nTIP: Is your password "postgres" or "admin"? Update it in setup_db.js!');
        process.exit(1);
    } finally {
        await client.end();
    }

    // 2. Apply the Schema
    const dbClient = new Client({ ...config, database: 'generic_db' });
    try {
        await dbClient.connect();
        console.log('Connected to generic_db. Applying schema...');
        await dbClient.query(schema);
        console.log('Schema applied successfully! 🚀');
    } catch (err) {
        console.error('Error applying schema:', err.message);
    } finally {
        await dbClient.end();
    }
}

setup();
