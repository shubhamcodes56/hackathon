const bcrypt = require('bcrypt');
const { signToken, signRefreshToken } = require('../utils/jwt');
const db = require('../config/db');

exports.registerUser = async (userData) => {
    // 1. Check if user exists
    const existingUserRes = await db.query('SELECT * FROM users WHERE email = $1', [userData.email]);
    if (existingUserRes.rowCount > 0) {
        const error = new Error('User with that email already exists');
        error.statusCode = 400;
        throw error;
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    // 3. Save to database
    // Note: We use a COALESCE/subquery to get a default app_id if one isn't provided, 
    // but for simplicity here we assume the first app in the table.
    const newUserRes = await db.query(
        `INSERT INTO users (email, password_hash, full_name, status, app_id) 
         VALUES ($1, $2, $3, 'active', (SELECT id FROM apps LIMIT 1)) 
         RETURNING id, email, full_name, created_at`,
        [userData.email, hashedPassword, userData.fullName]
    );

    const newUser = newUserRes.rows[0];

    // 4. Generate Tokens (defaulting role to 'user' for now)
    const accessToken = signToken(newUser.id, 'user');
    const refreshToken = signRefreshToken(newUser.id, 'user');

    return { user: newUser, accessToken, refreshToken };
};

exports.loginUser = async (email, plainPassword) => {
    // 1. Find user
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
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
    return { user: userWithoutPassword, accessToken, refreshToken };
};
