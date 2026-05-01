// ═══════════════════════════════════════════════════════════════
//  Auth.js — Authentication & Password Reset Routes
//
//  This file handles:
//  1. CSRF protection (prevents cross-site request forgery)
//  2. Registration (with PostgreSQL)
//  3. Login (with PostgreSQL)
//  4. Logout
//  5. Forgot Password → sends 6-digit OTP email
//  6. Verify OTP
//  7. Reset Password
//  8. Dashboard access control
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const router = express.Router();
const SALT_ROUNDS = 12;

// ═══════════════════════════════════════════════════════════════
//  PostgreSQL Connection Pool
// ═══════════════════════════════════════════════════════════════
//
//  A "pool" manages multiple database connections efficiently.
//  Instead of opening/closing a connection for every query,
//  the pool keeps a few connections alive and reuses them.
//
//  The credentials come from the .env file via process.env.
// ═══════════════════════════════════════════════════════════════

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

// Test DB connection when the server starts
pool.query('SELECT NOW()')
    .then(() => console.log('✅ Connected to PostgreSQL'))
    .catch(err => console.error('❌ DB connection error:', err.message));

// Tell PostgreSQL to look in the cmp5012b schema for tables
pool.on('connect', (client) => {
    client.query('SET search_path TO cmp5012b, public');
});

// ═══════════════════════════════════════════════════════════════
//  Email Transporter (Gmail via Nodemailer)
// ═══════════════════════════════════════════════════════════════
//
//  nodemailer.createTransport() creates a reusable email sender.
//  We use Gmail's SMTP server with an "App Password" — this is
//  NOT your normal Gmail password. It's the 16-character code
//  you generated from Google's App Passwords page.
//
//  The transporter is created once and reused for every email.
// ═══════════════════════════════════════════════════════════════

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify email works on startup
transporter.verify()
    .then(() => console.log('✅ Email transporter ready'))
    .catch(err => console.error('❌ Email setup error:', err.message));

// ═══════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a random 6-digit OTP code.
 * crypto.randomInt is cryptographically secure — better than Math.random()
 * for security-sensitive things like reset codes.
 */
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}

function validatePassword(password) {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    return regex.test(password);
}

/**
 * Send the OTP code to the user's email.
 * The HTML template creates a nice-looking email with the code
 * displayed in large text so it's easy to read.
 */
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

// ═══════════════════════════════════════════════════════════════
//  CSRF Protection (kept from your original Auth.js)
// ═══════════════════════════════════════════════════════════════
//
//  CSRF (Cross-Site Request Forgery) protection stops attackers
//  from tricking a user's browser into making requests to your
//  server. How it works:
//  
//  1. Server generates a random token, stores it in the session
//  2. Frontend fetches that token via GET /api/csrf-token
//  3. Frontend includes the token in every POST request
//  4. Server checks the token matches — if not, reject the request
//
//  This means a malicious site can't forge requests because they
//  can't access the token stored in the user's session.
// ═══════════════════════════════════════════════════════════════

function generateCsrfToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    return token;
}
//this is the function to verify the token
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

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════════
//  Rate Limiters (kept from your original Auth.js)
// ═══════════════════════════════════════════════════════════════

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,                     // 10 attempts per window
    skipSuccessfulRequests: true,
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many login attempts. Please wait 15 minutes and try again.'],
        });
    },
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,   // 1 hour
    max: 5,                      // 5 registrations per hour
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many registration attempts. Please try again in an hour.'],
        });
    },
});

// Rate limiter specifically for password reset requests
// Prevents someone spamming reset emails
const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 5,                      // 5 reset requests per 15 min
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            errors: ['Too many reset attempts. Please wait and try again.'],
        });
    },
});

// ═══════════════════════════════════════════════════════════════
//  ROUTE: GET /api/csrf-token
//  Frontend calls this before any POST to get a CSRF token
// ═══════════════════════════════════════════════════════════════

router.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.json({ csrfToken: req.session.csrfToken });
});

// ═══════════════════════════════════════════════════════════════
//  ROUTE: GET /register & GET /login
//  Serve the HTML pages
// ═══════════════════════════════════════════════════════════════

router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/register.html'));
});

router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/login.html'));
});

// ═══════════════════════════════════════════════════════════════
//  ROUTE: POST /register
//  Creates a new user account in PostgreSQL
// ═══════════════════════════════════════════════════════════════
//
//  WHAT CHANGED FROM YOUR ORIGINAL:
//  - Instead of users.push(user), we INSERT INTO the users table
//  - Instead of findByUsername(), we SELECT FROM users
//  - bcrypt.hash() is the same — it hashes the password before storing
//  - All your validation and CSRF checks are kept as-is
// ═══════════════════════════════════════════════════════════════

router.post('/register', registerLimiter, verifyCsrf, async (req, res) => {
    const {
        username, real_name, email, password, confirm_password,
        height_cm, weight_kg, DoB, gender, target_weight_kg
    } = req.body;

    const errors = [];

    if (!username || username.trim().length < 3) {
        errors.push('Username must be at least 3 characters.');
    }
    if (!real_name || real_name.trim().length < 2) {
        errors.push('Please enter your real name.');
    }
    if (!email || !isValidEmail(email.trim())) {
        errors.push('Please enter a valid email address.');
    }
    if (!password || !validatePassword(password)) {
        errors.push('Password must be at least 8 characters and contain an uppercase letter, lowercase letter, number, and special character.');
    }
    if (password !== confirm_password) {
        errors.push('Passwords do not match.');
    }

    if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
    }

    try {
        // ——— Check if username or email already exists ———
        // $1 and $2 are parameterized queries — they prevent SQL injection.
        // Never build SQL strings with string concatenation!
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

        // ——— Hash the password ———
        // bcrypt.hash() adds a random "salt" and hashes the password.
        // SALT_ROUNDS (12) controls how slow the hash is — higher = more secure but slower.
        // The result looks like: $2b$12$K3xG... (60 chars)
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // ——— Insert into PostgreSQL ———
        // RETURNING gives us back the new user's data without a second query
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

        // ——— Log them in automatically ———
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

// ═══════════════════════════════════════════════════════════════
//  ROUTE: POST /login
//  Authenticates a user against the PostgreSQL database
// ═══════════════════════════════════════════════════════════════
//
//  WHAT CHANGED:
//  - Instead of findByUsernameOrEmail(), we SELECT from the DB
//  - bcrypt.compare() is the same — it checks the password
//  - The "dummy hash" trick is kept: if no user is found, we still
//    run bcrypt.compare against a fake hash. This prevents timing
//    attacks (attacker can't tell if a username exists based on
//    how fast the response comes back).
// ═══════════════════════════════════════════════════════════════

router.post('/login', loginLimiter, verifyCsrf, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            errors: ['Please enter your username and password.'],
        });
    }

    try {
        // Look up user by username OR email
        const result = await pool.query(
            'SELECT user_id, username, email, password_hash FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
            [username.trim()]
        );

        const user = result.rows[0] || null;

        // Dummy hash — used if no user found, to prevent timing attacks
        const dummyHash = '$2b$12$KbQiHKvZpDffGhX7yL6t2eN8G6wmIqQFj8IDHdB9vjJE0iEOfO4aK';
        const hash = user ? user.password_hash : dummyHash;

        const passwordMatch = await bcrypt.compare(password, hash);

        if (!user || !passwordMatch) {
            return res.status(401).json({
                success: false,
                errors: ['Invalid username or password.'],
            });
        }

        // ——— Set session (log them in) ———
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

// ═══════════════════════════════════════════════════════════════
//  ROUTE: POST /logout
// ═══════════════════════════════════════════════════════════════

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// ═══════════════════════════════════════════════════════════════
//  ROUTE: GET /dashboard
//  Only accessible if logged in
// ═══════════════════════════════════════════════════════════════

router.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '../../Code/dashboard.html'));
});

// ═══════════════════════════════════════════════════════════════
//  ROUTE: GET /api/me
//  Returns current logged-in user info (useful for frontend)
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
//  PASSWORD RESET FLOW — 3 steps
// ═══════════════════════════════════════════════════════════════
//
//  Step 1: POST /api/forgot-password
//     → User enters their email
//     → Server generates a 6-digit OTP, saves it to password_resets table
//     → Server emails the OTP to the user
//     → OTP expires after 5 minutes
//
//  Step 2: POST /api/verify-otp
//     → User enters the 6-digit code from their email
//     → Server checks it against the database (correct? not expired? not used?)
//     → If valid, marks OTP as "used" and sets a session flag
//
//  Step 3: POST /api/reset-password
//     → User enters a new password
//     → Server checks the session flag (must have verified OTP first)
//     → Hashes the new password and updates the users table
// ═══════════════════════════════════════════════════════════════

// ——— Step 1: Request OTP ———
router.post('/api/forgot-password', resetLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                errors: ['Email is required.']
            });
        }

        // Find the user by email
        const result = await pool.query(
            'SELECT user_id, email FROM users WHERE LOWER(email) = LOWER($1)',
            [email.trim()]
        );

        // SECURITY: Always respond with the same message whether the email
        // exists or not. This prevents attackers from discovering which
        // emails have accounts (called "user enumeration").
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                message: 'If that email exists, a reset code has been sent.'
            });
        }

        const user = result.rows[0];

        // Invalidate any previous unused OTPs for this user
        // This prevents old codes from working after a new one is requested
        await pool.query(
            'UPDATE password_resets SET used = TRUE WHERE user_id = $1 AND used = FALSE',
            [user.user_id]
        );

        // Generate OTP and set expiry to 5 minutes from now
        const otpCode = generateOTP();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        // Save OTP to database
        await pool.query(
            'INSERT INTO password_resets (user_id, otp_code, expires_at) VALUES ($1, $2, $3)',
            [user.user_id, otpCode, expiresAt]
        );

        // Send the email
        await sendOTPEmail(user.email, otpCode);

        // Store email in session so the verify step knows which user
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

// ——— Step 2: Verify OTP ———
router.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                errors: ['Email and code are required.']
            });
        }

        // Find the user
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

        // Look for a valid OTP:
        // - Matches the user
        // - Matches the code they entered
        // - Has NOT been used already
        // - Has NOT expired (expires_at is in the future)
        // ORDER BY created_at DESC LIMIT 1 gets the most recent one
        const otpResult = await pool.query(
            `SELECT id FROM password_resets
             WHERE user_id = $1 AND otp_code = $2 AND used = FALSE AND expires_at > NOW()
             ORDER BY created_at DESC LIMIT 1`,
            [userId, otp]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                errors: ['Invalid or expired code. Please request a new one.']
            });
        }

        // Mark the OTP as used so it can't be reused
        await pool.query(
            'UPDATE password_resets SET used = TRUE WHERE id = $1',
            [otpResult.rows[0].id]
        );

        // Store in session that this user has verified their OTP
        // The reset-password route checks for this
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

// ——— Step 3: Reset Password ———
router.post('/api/reset-password', async (req, res) => {
    try {
        const { password, confirm_password } = req.body;

        // Check that the user actually verified an OTP first
        // Without this, someone could skip straight to this endpoint
        if (!req.session.resetVerified || !req.session.resetUserId) {
            return res.status(403).json({
                success: false,
                errors: ['Please verify your reset code first.']
            });
        }

        if (!password || !confirm_password) {
            return res.status(400).json({
                success: false,
                errors: ['Both password fields are required.']
            });
        }

        if (password !== confirm_password) {
            return res.status(400).json({
                success: false,
                errors: ['Passwords do not match.']
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                errors: ['Password must be at least 8 characters.']
            });
        }

        // Hash the new password
        const newHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Update it in the database
        await pool.query(
            'UPDATE users SET password_hash = $1 WHERE user_id = $2',
            [newHash, req.session.resetUserId]
        );

        // Clean up the reset session data
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

module.exports = router;