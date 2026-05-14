
//Dependencies,install express, bcrypt, ratelimit, nodemailer, crypto, etc
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

//pool for all of the routes to the postgres database server
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

//Nodemailer transporter setting up gmail password implementation
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

//Debugging code to ensure that when the server starts, is the transporter ready
transporter.verify()
    .then(() => console.log('Email transporter ready'))
    .catch(err => console.error('Email setup error:', err.message));


//this function is used to generate the one time password that the users will use to reset their password
function generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
}


//function to make use of nodemailer, the users email, and the one time password in order to sent the one time password to the users email
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


//function to generate a CSRF token, this is a 32 byte hex string that is used to secure user requests and ensure that they can't be emulated
// With this token, when users make a request, the csrf token is required to process this request
//this way, an attacker cant emulate a users actions
function generateCsrfToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    return token;
}


//This function is used to verify the csrf token that is generated from the system.
//it computes a check to ensure that there is actually a csrf token that exists within the request.
// furthermore it also computes if the submitted csrf token is correct, otherwise it errors
function verifyCsrf(req, res, next) {
    const submitted = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
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


//Rate limit for login attempt: 10 requests per hour per user, preventing DoS attacks
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


//Rate limit for register page: 5 requests per hour per users, preventing Dos attacks
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

//Rate limit for resetting password page: 5 requests per hour per user, preventing Dos attacks
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



//this get request serves the csrf token to the frontend, it generates a new one if one doesn't already exist in the session,
//the frontend fetches this before every POST request to include it in the request headers
router.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.json({ csrfToken: req.session.csrfToken });
});

//this get request serves the register page to the user
router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/register.html'));
});

//this get request serves the login page, but first checks if the user has logged out within the last 10 minutes,
//if they have and their account still exists, they are automatically logged back in and redirected to the dashboard
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



//Register page validation that makes use of express - validator to ensure that all of the fields are filled in with the correct data
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

//this is the post request for the register page, it first checks the rate limiter, csrf token and validation,
//if all of these pass then it checks if the username or email already exists in the database,
//if they dont then it hashes the password using bcrypt and inserts the new user into the database,
//it then logs the user in automatically by setting the session variables and generating a new csrf token
router.post('/register', registerLimiter, verifyCsrf, registerValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
    }

    const { username, real_name, email, password, height_cm, weight_kg, DoB, gender, target_weight_kg } = req.body; // ADD THIS

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

//login validation also making use of the express - validator dependency
const loginValidation = [
    body('username').trim().notEmpty().withMessage('Please enter your username.'),
    body('password').notEmpty().withMessage('Please enter your password.'),
];


//This is the login post function, it takes in quite a few parameters including the login limiter to limit rates, veryifyCSRF, and login validation
//This also will select the users data based on their username entered into the input, it will then use bycrypt to encyrpt the password entered by the user
//Then it will compare this password with the already hashed password stored inside the database.
//if they match, success, adn the user is allowed to login
//if they dont, then an error is thrown
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


//the post function for when a user logs out of the applciation, it sets the session variables to null, it then sends the user back to the home page
// it also records the date and time of the logout, this is so that we can begin to implement the session relogging
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

//this get request serves the dashboard page, it first checks if the user is logged in,
//if they are not then they are redirected to the login page
router.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, '../../Code/dashboard.html'));
});
//this get request returns the currently logged in users basic info,
//it is used by the frontend to check if the user is logged in and get their username
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



//this is the post code for the forgotten password page, obviously it has a reset limiter to ensure DoS attacks are mitigated.
//this then computes checks to ensure that the user has entered an email and if it exists inside the database
//If the email exists then a one time code is then generated and sent to the users email address using nodemailer.
//This will also encrypt the one time password. Only uses sha256, as bcrypt is slow, and OTPs are only in use briefly, there is no real need to implemet a very secure method
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



//this is anotehr codeblock, this one is for handling the check of the user entering the one time password that has been sent to their account.
//it retrieves the one time code hash from the database, and then compares this has with the hashed version of the one time code that the user enters into the application.
//if they match then the user is allowed to proceed onto the next page, if not an error is thrown
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


//another validation check, this time to ensure that when a user enters a new password, that it conforms
// to the already in place password validation of the register page, we make use of express-validation
// as well as a regex, in order to ensure that the password entered is valid
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


//This is the post method for the reset-password. it takes in the resetPassword Validation function
// it checks to ensure that the user has entered a new password, if they have then bcrypt with hash and salt the password, and store it in the database

router.post('/api/reset-password', resetPasswordValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array().map(e => e.msg) });
    }
    if (!req.session.resetVerified || !req.session.resetUserId) {
        return res.status(403).json({ success: false, errors: ['Please verify your reset code first.'] });
    }
    const { password } = req.body;

    try {
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
