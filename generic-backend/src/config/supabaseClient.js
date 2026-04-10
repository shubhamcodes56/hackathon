const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Supabase is optional — only create the client if credentials are provided.
// When DATABASE_URL is set, pg Pool is used instead and Supabase is not needed.
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
    try {
        const { createClient } = require('@supabase/supabase-js');
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (err) {
        // @supabase/supabase-js not installed — that's fine if pg is being used
    }
}

module.exports = supabase;
