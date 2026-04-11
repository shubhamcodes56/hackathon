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

exports.socialAuth = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.socialAuth(req.body);

        logger.info(`Social auth completed: ${user.email}`);

        res.cookie('jwt_refresh', refreshToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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

exports.providers = (req, res) => {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
    res.status(200).json({
        status: 'success',
        data: {
            google: {
                enabled: !!googleClientId,
                clientId: googleClientId
            },
            apple: {
                enabled: false
            }
        }
    });
};

exports.googleAccessAuth = async (req, res, next) => {
    try {
        const token = String(req.body.access_token || '');
        const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const userInfo = await userInfoResp.json().catch(() => ({}));
        if (!userInfoResp.ok) {
            const err = new Error(userInfo.error_description || userInfo.error || 'Google authentication failed');
            err.statusCode = 401;
            throw err;
        }

        if (!userInfo.email || userInfo.email_verified === false) {
            const err = new Error('Google account email is not verified.');
            err.statusCode = 401;
            throw err;
        }

        const { user, accessToken, refreshToken } = await authService.socialAuth({
            email: userInfo.email,
            fullName: userInfo.name,
            provider: 'google'
        });

        logger.info(`Google OAuth login completed: ${user.email}`);

        res.cookie('jwt_refresh', refreshToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
