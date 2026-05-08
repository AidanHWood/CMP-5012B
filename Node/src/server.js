// --------------------------------------------------------------
//  server.js — Main entry point
//  This is the "brain" that starts Express, sets up middleware,
//  and connects all the route files together.
// --------------------------------------------------------------

console.log('=== SERVER FILE LOADED ===');
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet')
 
// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });
 
const app = express();
 
// ——— Middleware ———
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// ——— Session Setup ———

if (!process.env.SESSION_SECRET) throw new Error('Session Secret not set in .env')
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
}));

// ——— Protected page routes (must be before static middleware) ———
const CODE_DIR = path.join(__dirname, '../../Code');

app.get('/dashboard.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    res.sendFile(path.join(CODE_DIR, 'dashboard.html'));
});
app.get('/logCalories.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    res.sendFile(path.join(CODE_DIR, 'logCalories.html'));
});
app.get('/logExercise.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    res.sendFile(path.join(CODE_DIR, 'logExercise.html'));
});
app.get('/myHistory.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    res.sendFile(path.join(CODE_DIR, 'myHistory.html'));
});
app.get('/friends.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    res.sendFile(path.join(CODE_DIR, 'friends.html'));
});
// Serve static files (HTML, CSS, JS) from the Code folder
app.use(express.static(path.join(__dirname, '../../Code')));
 
// ——— Wire in the Auth router ———
const authRouter = require('./Auth');
app.use(authRouter);

const friendRoutes = require('./friends');
app.use('/', friendRoutes);
 
// ——— Wire in Food routes ———
const filePath = path.join(__dirname, 'data', 'food.json');
const foodRoutes = require('./food');
app.use('/', foodRoutes);
 
app.post('/add-food', (req, res) => {
    try {
        let data = [];
        if (fs.existsSync(filePath)) {
            data = JSON.parse(fs.readFileSync(filePath));
        }
        data.push(req.body);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Server error' });
    }
});
 
// ——— Calorie logging routes (in-memory for now) ———
let calorieLog = [];
 
app.get('/api/calories', (req, res) => {
    res.json(calorieLog);
});
 
app.post('/api/calories', (req, res) => {
    const { meal, calories, description } = req.body;
    const entry = {
        id: Date.now(),
        meal,
        calories: Number(calories),
        description: description || '',
        timestamp: new Date().toISOString()
    };
    calorieLog.push(entry);
    res.status(201).json(entry);
});
 
app.delete('/api/calories/:id', (req, res) => {
    calorieLog = calorieLog.filter(e => e.id !== Number(req.params.id));
    res.status(204).send();
});


// ——— Exercise Logging Routes (PostgreSQL) ———
const pool = require('./db');
app.get('/api/user-weight', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query('SELECT weight_kg FROM users WHERE user_id = $1', [req.session.userId]);
        res.json({ weight_kg: result.rows[0]?.weight_kg || 70 });
    } catch (err) {
        console.error('Fetch weight error:', err);
        res.json({ weight_kg: 70 });
    }
});

app.get('/api/exercise', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `SELECT exercise_log_id, exercise_type, duration_min, distance_km, calories_burned, log_date
             FROM exercise_logs WHERE user_id = $1 AND DATE(log_date) = CURRENT_DATE ORDER BY log_date DESC`,
            [req.session.userId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Fetch exercise error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
app.delete('/api/exercise/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        await pool.query('DELETE FROM exercise_logs WHERE exercise_log_id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
        res.status(204).send();
    } catch (err) {
        console.error('Delete exercise error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
console.log('=== REGISTERING WEIGHT HISTORY ROUTE ===');

// ——— Weight History Route ———
app.get('/api/weight-history', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });

    try {
        let query;
        let params;

        if (req.query.from && req.query.to) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(req.query.from) || !dateRegex.test(req.query.to))
                return res.status(400).json({error: 'Invalid date format: Dates must be in the YYYY-MM-DD format'})
            query = `SELECT weight_log_id, weight_kg, log_date
                     FROM weight_logs
                     WHERE user_id = $1 AND log_date >= $2 AND log_date <= ($3::date + INTERVAL '1 day')
                     ORDER BY log_date ASC`;
            params = [req.session.userId, req.query.from, req.query.to];
        } else {
            const days = parseInt(req.query.days) || 7;
            if (days < 1 || days > 365)
                return res.status(400).json({error: 'Days must be a valid range:(1-365)'})
            query = `SELECT weight_log_id, weight_kg, log_date
                     FROM weight_logs
                     WHERE user_id = $1 AND log_date >= NOW() - ($2 * INTERVAL '1 day')
                     ORDER BY log_date ASC`;
            params = [req.session.userId, days];
        }

        const result = await pool.query(query, params);
        res.json({ entries: result.rows });

    } catch (err) {
        console.error('Weight history error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});



app.post('/api/exercise', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const { exercise_type, duration_min, distance_km, calories_burned, weight_moved_kg } = req.body;
    if (!exercise_type || !duration_min) return res.status(400).json({ error: 'Exercise type and duration are required' });

    const validTypes =['running', 'cycling', 'walking', 'swimming', 'gym', 'sport']
    if (!validTypes.includes(exercise_type))
        return res.status(400).json({error: 'Invalid Exercise type'})

    const numericFields = [
        { name: 'Duration', value: duration_min, min: 1, max: 1440, required: true},
        { name: 'Calories Burned', value: calories_burned, min: 0, max: 10000, required: true },
        { name: 'Distance', value: distance_km, min: 0, max: 10000, required: false},
        { name: 'Weight Moved', value: weight_moved_kg, min: 0, max: 10000, required: false}];

    for (const field of numericFields) {
        if (!field.required && !field.value) continue;
        const num = Number(field.value);
        if (isNaN(num) || num < field.min || num > field.max)
            return res.status(400).json({error:`${field.name} must be between ${field.min} and ${field.max}`});
    }
    try {
        const result = await pool.query(
            `INSERT INTO exercise_logs (user_id, exercise_type, duration_min, distance_km, calories_burned, weight_moved_kg, log_date)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING exercise_log_id, exercise_type, duration_min, distance_km, calories_burned, weight_moved_kg, log_date`,
            [req.session.userId, exercise_type, Number(duration_min), distance_km ? Number(distance_km) : null, Number(calories_burned) || 0, weight_moved_kg ? Number(weight_moved_kg) : null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Log exercise error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});



app.get('/api/exercise-history', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });



    const validTypes =['running', 'cycling', 'walking', 'swimming', 'gym', 'sport']
    const type = req.query.type || 'running';

    if (!validTypes.includes(type))
        return res.status(400).json({error: 'Invalid Exercise type'})

    try {
        let query, params;
        if (req.query.from && req.query.to) {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(req.query.from) || !dateRegex.test(req.query.to))
                return res.status(400).json({error: 'Invalid date format: Dates must be in the YYYY-MM-DD format'})
            query = `SELECT exercise_log_id, exercise_type, duration_min, distance_km, 
                            calories_burned, weight_moved_kg, log_date
                     FROM exercise_logs
                     WHERE user_id = $1 AND exercise_type = $2 
                       AND log_date >= $3 AND log_date <= ($4::date + INTERVAL '1 day')
                     ORDER BY log_date ASC`;
            params = [req.session.userId, type, req.query.from, req.query.to];
        } else {
            const days = parseInt(req.query.days) || 7;
            if (days < 1 || days > 365)
                return res.status(400).json({error: 'Days must be a valid range:(1-365)'})
            query = `SELECT exercise_log_id, exercise_type, duration_min, distance_km, 
                            calories_burned, weight_moved_kg, log_date
                     FROM exercise_logs
                     WHERE user_id = $1 AND exercise_type = $2 
                       AND log_date >= NOW() - ($3 * INTERVAL '1 day')
                     ORDER BY log_date ASC`;
            params = [req.session.userId, type, days];
        }

        const result = await pool.query(query, params);
        res.json({ entries: result.rows });

    } catch (err) {
        console.error('Exercise history error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ——— Homepage route ———
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/homepage.html'));
});
 
// ——— Start Server ———
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
