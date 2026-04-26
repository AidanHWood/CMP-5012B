const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');

const router = express.Router();
const SALT_ROUNDS = 12;

//THIS SHIT IS TEMPORARY UNTIL I ADD THE POSTGRES TABLES
const users = [];
let nextId = 1;

function findByUsernameOrEmail(identifier) {
    const lower = identifier.toLowerCase();

    return users.find(
        (u) =>
            u.username.toLowerCase() === lower ||
            u.email.toLowerCase() === lower
    );
}

function findByUsername(username) {
    return users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
    );
}

function findByEmail(email) {
    return users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase()
    );
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


function generateCsrfToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    return token;
}


function verifyCsrf(req, res, next) {
    const submitted = req.body._csrf || req.headers['x-csrf-token'];
    const sessionToken = req.session.csrfToken;

    // TEMP DEBUG LOGS — remove once it works
    console.log('VERIFY SESSION ID:', req.sessionID);
    console.log('Submitted CSRF:', submitted);
    console.log('Session CSRF:', sessionToken);

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

router.get('/api/csrf-token', (req, res) => {
    // Only generate a token if the session does not already have one
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    //TEMP DEBUG FOR THE CSRF TOKEN, THIS SHIT WILL BE REMOVED MAYBE IDK IM TO TIRED FOR THIS SHIT
    console.log('CSRF SESSION ID:', req.sessionID);
    console.log('Saved CSRF:', req.session.csrfToken);

    res.json({
        csrfToken: req.session.csrfToken,
    });
});

router.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

router.post('/register', registerLimiter, verifyCsrf, async (req, res) => {
    const {
        username,
        real_name,
        email,
        password,
        confirm_password,
        height_cm,
        weight_kg,
        age,
        gender,
        target_weight_kg,
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

    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters.');
    }

    if (password !== confirm_password) {
        errors.push('Passwords do not match.');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            errors,
        });
    }

    if (findByUsername(username.trim())) {
        return res.status(400).json({
            success: false,
            errors: ['That username is already taken.'],
        });
    }

    if (findByEmail(email.trim())) {
        return res.status(400).json({
            success: false,
            errors: ['An account with that email already exists.'],
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const user = {
            id: nextId++,
            username: username.trim(),
            real_name: real_name.trim(),
            email: email.trim().toLowerCase(),
            password: hashedPassword,
            height_cm: height_cm || null,
            weight_kg: weight_kg || null,
            age: age || null,
            gender: gender || null,
            target_weight_kg: target_weight_kg || null,
        };

        users.push(user);

        req.session.userId = user.id;
        req.session.username = user.username;

        generateCsrfToken(req);

        return res.json({
            success: true,
            redirect: '/dashboard',
        });
    } catch (err) {
        console.error('Register error:', err);

        return res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.'],
        });
    }
});

router.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

router.post('/login', loginLimiter, verifyCsrf, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            errors: ['Please enter your username and password.'],
        });
    }

    try {
        const user = findByUsernameOrEmail(username.trim());

        const dummyHash =
            '$2b$12$KbQiHKvZpDffGhX7yL6t2eN8G6wmIqQFj8IDHdB9vjJE0iEOfO4aK';

        const hash = user ? user.password : dummyHash;
        const passwordMatch = await bcrypt.compare(password, hash);

        if (!user || !passwordMatch) {
            return res.status(401).json({
                success: false,
                errors: ['Invalid username or password.'],
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        // Rotate CSRF token after login
        generateCsrfToken(req);

        return res.json({
            success: true,
            redirect: '/dashboard',
        });
    } catch (err) {
        console.error('Login error:', err);

        return res.status(500).json({
            success: false,
            errors: ['Server error. Please try again.'],
        });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }

        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

router.get('/dashboard', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login');
    }

    res.sendFile(path.join(__dirname, 'dashboard.html'));
});
module.exports = router;