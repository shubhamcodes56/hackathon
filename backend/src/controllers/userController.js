const db = require('../config/db');
const logger = require('../utils/logger');

exports.getAllUsers = async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT id, email, full_name, status, created_at, last_login_at FROM users ORDER BY created_at DESC'
        );

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: {
                users: result.rows
            }
        });
    } catch (err) {
        next(err);
    }
};

exports.getUserStats = async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT status, COUNT(*) as count FROM users GROUP BY status'
        );

        res.status(200).json({
            status: 'success',
            data: {
                stats: result.rows
            }
        });
    } catch (err) {
        next(err);
    }
};
