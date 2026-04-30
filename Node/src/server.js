// --------------------------------------------------------------
//  server.js — Main entry point
//  This is the "brain" that starts Express, sets up middleware,
//  and connects all the route files together.
// --------------------------------------------------------------
 
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
 
// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });
 
const app = express();
 
// ——— Middleware ———
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// ——— Session Setup ———
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-to-something-random',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true
    }
}));
 
// Serve static files (HTML, CSS, JS) from the Code folder
app.use(express.static(path.join(__dirname, '../../Code')));
 
// ——— Wire in the Auth router ———
const authRouter = require('./Auth');
app.use(authRouter);
 
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

app.post('/api/exercise', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const { exercise_type, duration_min, distance_km, calories_burned } = req.body;
    if (!exercise_type || !duration_min) return res.status(400).json({ error: 'Exercise type and duration are required' });
    try {
        const result = await pool.query(
            `INSERT INTO exercise_logs (user_id, exercise_type, duration_min, distance_km, calories_burned, log_date)
             VALUES ($1, $2, $3, $4, $5, NOW())
             RETURNING exercise_log_id, exercise_type, duration_min, distance_km, calories_burned, log_date`,
            [req.session.userId, exercise_type, Number(duration_min), distance_km ? Number(distance_km) : null, Number(calories_burned) || 0]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Log exercise error:', err);
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



// ——— Homepage route ———
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/homepage.html'));
});
 
// ——— Start Server ———
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});