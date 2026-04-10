const authService = require('../services/authService');
const logger = require('../utils/logger');

exports.signup = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.registerUser(req.body);

        logger.info(`New user registered: ${user.email}`);

        // Set Refresh Token as an HttpOnly Cookie (Immune to XSS)
        res.cookie('jwt_refresh', refreshToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // true in prod
            sameSite: 'strict'
        });

        res.status(201).json({
            status: 'success',
            accessToken,
            data: { user }
        });
    } catch (err) {
        next(err);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const { user, accessToken, refreshToken } = await authService.loginUser(email, password);

        logger.info(`User logged in: ${user.email}`);

        // Set Refresh Token as an HttpOnly Cookie (Immune to XSS)
        res.cookie('jwt_refresh', refreshToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        res.status(200).json({
            status: 'success',
            accessToken,
            data: { user }
        });
    } catch (err) {
        next(err);
    }
};

exports.getProfile = async (req, res, next) => {
    // req.user is set by the protect middleware
    res.status(200).json({
        status: 'success',
        data: {
            user: req.user
        }
    });
};
