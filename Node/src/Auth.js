const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');

const router = express.Router();
const SALT_ROUNDS = 12;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

pool.query('SELECT NOW()')
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => console.error('❌ DB connection error:', err.message));

pool.on('connect', (client) => {
    client.query('SET search_path TO cmp5012b, public');
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
    }
});


transporter.verify()
    .then(() => console.log('✅ Email transporter ready'))
    .catch(err => console.error('❌ Email setup error:', err.message));


function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}


async function sendOTPEmail(toEmail, otpCode) {
    const mailOptions = {
        from: `"Health Tracker" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Your Password Reset Code',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #0a0a0a; font-size: 24px; margin-bottom: 8px;">Password Reset</h2>
                <p style="color: #555; font-size: 15px; line-height: 1.5;">
                    You requested a password reset for your Health Tracker account. Use the code below:
                </p>
                <div style="background: #f5f5f5; border-radius: 10px; padding: 24px; text-align: center; margin: 24px 0;">
                    <span style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0a0a0a;">${otpCode}</span>
                </div>
                <p style="color: #999; font-size: 13px;">
                    This code expires in <strong>5 minutes</strong>. If you didn't request this, ignore this email.
                </p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
}

function generateCsrfToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    return token;
}

function verifyCsrf(req, res, next) {
    const submitted = req.body._csrf || req.headers['x-csrf-token'];
    const sessionToken = req.session.csrfToken;

    if (!submitted || !sessionToken) {
        return res.status(403).json({
            success: false,
            errors: ['Missing CSRF token.'],
        });
    }

    if (submitted !== sessionToken) {
        return res.status(403).json({
            success: false,
            errors: ['Invalid CSRF token.'],
        });
    }

    next();
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many login attempts. Please wait 15 minutes and try again.'],
        });
    },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many registration attempts. Please try again in an hour.'],
        });
    },
});


const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many reset attempts. Please wait and try again.'],
        });
    },
});



router.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.json({ csrfToken: req.session.csrfToken });
});


router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/register.html'));
});

router.get('/login', async (req, res) => {
    const TEN_MINUTES = 10 * 60 * 1000;
    const logout = req.session.recentLogout;

    if (logout && (Date.now() - logout.at) < TEN_MINUTES && logout.userId) {
        const result = await pool.query(
            'SELECT user_id, username FROM users WHERE user_id = $1',
            [logout.userId]
        );
        if (result.rows.length > 0){
            req.session.userId = logout.userId;
            req.session.username = logout.username;
            req.session.recentLogout = null;
            generateCsrfToken(req);
            return res.redirect('/dashboard');
        }
    }
    res.sendFile(path.join(__dirname, '../../Code/login.html'));
});

const registerValidation = [
    body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters.'),
    body('real_name').trim().isLength({ min: 2 }).withMessage('Please enter your real name.'),
    body('email').trim().isEmail().normalizeEmail().withMessage('Please enter a valid email address.'),
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
        .withMessage('Password must contain uppercase, lowercase, number and special character.'),
    body('confirm_password').custom((value, { req }) => {
        if (value !== req.body.password) throw new Error('Passwords do not match.');
        return true;
    }),
];
router.post('/register', registerLimiter, verifyCsrf, registerValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
    }
    try {

        const existing = await pool.query(
            'SELECT user_id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
            [username.trim(), email.trim()]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                errors: ['Username or email already taken.']
            });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const result = await pool.query(
            `INSERT INTO users (username, real_name, email, password_hash, height_cm, weight_kg, DoB, gender, target_weight_kg)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING user_id, username, email`,
            [
                username.trim(),
                real_name.trim(),
                email.trim().toLowerCase(),
                hashedPassword,
                height_cm || null,
                weight_kg || null,
                DoB || null,
                gender || null,
                target_weight_kg || null
            ]
        );

        const newUser = result.rows[0];

        req.session.userId = newUser.user_id;
        req.session.username = newUser.username;
        generateCsrfToken(req);

        return res.json({ success: true, redirect: '/dashboard' });

    } catch (err) {
        console.error('Register error:', err);
        return res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.']
        });
    }
});

const loginValidation = [
    body('username').trim().notEmpty().withMessage('Please enter your username.'),
    body('password').notEmpty().withMessage('Please enter your password.'),
];

router.post('/login', loginLimiter, verifyCsrf, loginValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
    }

    const { username, password } = req.body;
    try {

        const result = await pool.query(
            'SELECT user_id, username, email, password_hash FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
            [username.trim()]
        );

        const user = result.rows[0] || null;
        const dummyHash = '$2b$12$KbQiHKvZpDffGhX7yL6t2eN8G6wmIqQFj8IDHdB9vjJE0iEOfO4aK';
        const hash = user ? user.password_hash : dummyHash;

        const passwordMatch = await bcrypt.compare(password, hash);

        if (!user || !passwordMatch) {
            return res.status(401).json({
                success: false,
                errors: ['Invalid username or password.'],
            });
        }
        req.session.userId = user.user_id;
        req.session.username = user.username;
        generateCsrfToken(req);

        return res.json({ success: true, redirect: '/dashboard' });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.'],
        });
    }
});

router.post('/logout', (req, res) => {
    const username = req.session.username || null;
    const userId = req.session.userId || null;

    req.session.userId    = null;
    req.session.username  = null;
    req.session.csrfToken = null;

    req.session.recentLogout = {
        username,
        userId,
        at: Date.now()
    };

    res.redirect('/');
});


router.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '../../Code/dashboard.html'));
});

router.get('/api/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            loggedIn: true,
            userId: req.session.userId,
            username: req.session.username
        });
    } else {
        res.json({ loggedIn: false });
    }
});

router.post('/api/forgot-password', resetLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                errors: ['Email is required.']
            });
        }

        const result = await pool.query(
            'SELECT user_id, email FROM users WHERE LOWER(email) = LOWER($1)',
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: 'If that email exists, a reset code has been sent.'
            });
        }

        const user = result.rows[0];

        await pool.query(
            'UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE',
            [user.user_id]
        );

        const otpCode = generateOTP();
        const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await pool.query(
            'INSERT INTO password_resets (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
            [user.user_id, otpHash, expiresAt]
        );

        await sendOTPEmail(user.email, otpCode);

        req.session.resetEmail = email.trim().toLowerCase();

        res.json({
            success: true,
            message: 'If that email exists, a reset code has been sent.'
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.']
        });
    }
});


router.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                errors: ['Email and code are required.']
            });
        }

        const userResult = await pool.query(
            'SELECT user_id FROM users WHERE LOWER(email) = LOWER($1)',
            [email.trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                errors: ['Invalid request.']
            });
        }

        const userId = userResult.rows[0].user_id;

        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const otpResult = await pool.query(
            `SELECT id FROM password_resets
             WHERE user_id = $1 AND otp_code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId, otpHash]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                errors: ['Invalid or expired code. Please request a new one.']
            });
        }

        await pool.query(
            'UPDATE password_resets SET used = TRUE WHERE id = $1',
            [otpResult.rows[0].id]
        );

        req.session.resetUserId = userId;
        req.session.resetVerified = true;

        res.json({
            success: true,
            message: 'Code verified. You can now reset your password.'
        });

    } catch (err) {
        console.error('Verify OTP error:', err);
        res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.']
        });
    }
});

const resetPasswordValidation = [
    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/)
        .withMessage('Password must contain uppercase, lowercase, number and special character.'),
    body('confirm_password').custom((value, { req }) => {
        if (value !== req.body.password) throw new Error('Passwords do not match.');
        return true;
    }),
];

router.post('/api/reset-password', resetPasswordValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
    }
    try{
        const newHash = await bcrypt.hash(password, SALT_ROUNDS);

        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE user_id = $2',
            [newHash, req.session.resetUserId]
        );

        delete req.session.resetUserId;
        delete req.session.resetVerified;
        delete req.session.resetEmail;

        res.json({
            success: true,
            message: 'Password reset successfully. You can now log in.'
        });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.']
        });
    }
});

module.exports = { router, verifyCsrf };