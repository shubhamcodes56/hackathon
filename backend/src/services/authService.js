const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { signToken, signRefreshToken } = require('../utils/jwt');
const db = require('../config/db');

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function deriveUsername(email) {
    const localPart = normalizeEmail(email).split('@')[0] || 'user';
    return localPart.replace(/[^a-z0-9._-]/gi, '') || 'user';
}

function humanizeUsername(username) {
    return String(username || '')
        .replace(/[._-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Guest';
}

function attachIdentity(user, fallbackProvider = 'email') {
    if (!user) return user;
    const username = user.username || deriveUsername(user.email);
    return {
        ...user,
        username,
        auth_provider: user.auth_provider || fallbackProvider,
        display_name: user.full_name || humanizeUsername(username)
    };
}

exports.registerUser = async (userData) => {
    // 1. Check if user exists
    const email = normalizeEmail(userData.email);
    const existingUserRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUserRes.rowCount > 0) {
        const error = new Error('User with that email already exists');
        error.statusCode = 400;
        throw error;
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const username = deriveUsername(email);

    // 3. Save to database
    // Note: We use a COALESCE/subquery to get a default app_id if one isn't provided, 
    // but for simplicity here we assume the first app in the table.
    let newUserRes;
    try {
        newUserRes = await db.query(
            `INSERT INTO users (email, password_hash, full_name, status, app_id, username, auth_provider) 
             VALUES ($1, $2, $3, 'active', (SELECT id FROM apps LIMIT 1), $4, 'email') 
             RETURNING id, email, full_name, username, auth_provider, created_at`,
            [email, hashedPassword, userData.fullName, username]
        );
    } catch (err) {
        newUserRes = await db.query(
            `INSERT INTO users (email, password_hash, full_name, status, app_id) 
             VALUES ($1, $2, $3, 'active', (SELECT id FROM apps LIMIT 1)) 
             RETURNING id, email, full_name, created_at`,
            [email, hashedPassword, userData.fullName]
        );
    }

    const newUser = newUserRes.rows[0];

    // 4. Generate Tokens (defaulting role to 'user' for now)
    const accessToken = signToken(newUser.id, 'user');
    const refreshToken = signRefreshToken(newUser.id, 'user');

    return { user: attachIdentity(newUser, 'email'), accessToken, refreshToken };
};

exports.loginUser = async (email, plainPassword) => {
    // 1. Find user
    const normalizedEmail = normalizeEmail(email);
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (userRes.rowCount === 0) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }

    const user = userRes.rows[0];

    // 2. Verify password
    const isMatch = await bcrypt.compare(plainPassword, user.password_hash);
    if (!isMatch) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }

    // 3. Update last login
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 4. Generate tokens
    const accessToken = signToken(user.id, 'user');
    const refreshToken = signRefreshToken(user.id, 'user');

    // Don't return password hash
    const { password_hash, ...userWithoutPassword } = user;
    return { user: attachIdentity(userWithoutPassword, 'email'), accessToken, refreshToken };
};

exports.socialAuth = async ({ email, fullName, provider = 'google' }) => {
    const normalizedEmail = normalizeEmail(email);
    const username = deriveUsername(normalizedEmail);
    const displayName = fullName && String(fullName).trim() ? String(fullName).trim() : humanizeUsername(username);

    const existingUserRes = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    let user;

    if (existingUserRes.rowCount > 0) {
        user = existingUserRes.rows[0];
        await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
    } else {
        const randomPassword = crypto.randomBytes(32).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 12);

        try {
            const createdRes = await db.query(
                `INSERT INTO users (email, password_hash, full_name, status, app_id, username, auth_provider) 
                 VALUES ($1, $2, $3, 'active', (SELECT id FROM apps LIMIT 1), $4, $5) 
                 RETURNING id, email, full_name, username, auth_provider, created_at`,
                [normalizedEmail, hashedPassword, displayName, username, provider]
            );
            user = createdRes.rows[0];
        } catch (err) {
            const createdRes = await db.query(
                `INSERT INTO users (email, password_hash, full_name, status, app_id) 
                 VALUES ($1, $2, $3, 'active', (SELECT id FROM apps LIMIT 1)) 
                 RETURNING id, email, full_name, created_at`,
                [normalizedEmail, hashedPassword, displayName]
            );
            user = createdRes.rows[0];
        }
    }

    const safeUser = attachIdentity(user, provider);
    const accessToken = signToken(safeUser.id, 'user');
    const refreshToken = signRefreshToken(safeUser.id, 'user');

    return { user: safeUser, accessToken, refreshToken };
};
