require('dotenv').config();
const logger = require('../utils/logger');

// ─── Strategy: prefer pg Pool when DATABASE_URL is set, otherwise fall back to Supabase ───

let pool = null;
let supabase = null;

// 1. Try pg Pool first
if (process.env.DATABASE_URL) {
    try {
        const { Pool } = require('pg');
        pool = new Pool({ connectionString: process.env.DATABASE_URL });
        logger.info('✅ Using pg Pool (PostgreSQL direct connection)');
    } catch (err) {
        logger.warn('pg module not available: ' + err.message);
    }
}

// 2. Fall back to Supabase if pg is unavailable
if (!pool) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    if (SUPABASE_URL && SUPABASE_KEY) {
        try {
            const { createClient } = require('@supabase/supabase-js');
            supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
            logger.info('✅ Using Supabase client (pg not available)');
        } catch (err) {
            logger.warn('Supabase client init failed: ' + err.message);
        }
    } else {
        logger.warn('⚠ No database configured. Set DATABASE_URL or SUPABASE_URL + SUPABASE_KEY in .env');
    }
}

// ─── Unified query() wrapper ───
async function query(sql, params) {
    // pg Pool path — handles any SQL
    if (pool) return pool.query(sql, params);

    // Supabase path — lightweight emulation for common queries
    if (!supabase) throw new Error('No database connection available. Check .env configuration.');

    const low = (sql || '').toLowerCase();

    if (low.includes('from users')) {
        // UPDATE last_login_at
        if (low.startsWith('update users')) {
            // params[0] = NOW(), params[1] = user id
            const { error } = await supabase
                .from('users')
                .update({ last_login_at: new Date().toISOString() })
                .eq('id', params[params.length - 1]);
            if (error) throw error;
            return { rowCount: 1, rows: [] };
        }

        // SELECT for auth (email lookup)
        if (low.includes('where email')) {
            const email = params[0];
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', email)
                .limit(1);
            if (error) throw error;
            return { rowCount: (data || []).length, rows: data || [] };
        }

        // GROUP BY status (stats endpoint)
        if (low.includes('group by status')) {
            const { data: users, error } = await supabase.from('users').select('status');
            if (error) throw error;
            const counts = {};
            users.forEach(u => { const s = u.status || 'unknown'; counts[s] = (counts[s] || 0) + 1; });
            const rows = Object.keys(counts).map(k => ({ status: k, count: String(counts[k]) }));
            return { rowCount: rows.length, rows };
        }

        // Default: list all users
        const { data, error } = await supabase
            .from('users')
            .select('id,email,full_name,status,created_at,last_login_at')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return { rowCount: (data || []).length, rows: data || [] };
    }

    // INSERT into users (registration)
    if (low.startsWith('insert into users')) {
        const { email, password_hash, full_name } = {
            email:         params[0],
            password_hash: params[1],
            full_name:     params[2]
        };
        const { data, error } = await supabase
            .from('users')
            .insert([{ email, password_hash, full_name, status: 'active' }])
            .select('id,email,full_name,created_at');
        if (error) throw error;
        return { rowCount: 1, rows: data || [] };
    }

    throw new Error('Unsupported SQL in Supabase compatibility layer: ' + sql.substring(0, 80));
}

module.exports = {
    supabase,
    pool,
    from: (table) => supabase ? supabase.from(table) : null,
    query
};
