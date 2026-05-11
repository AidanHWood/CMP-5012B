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
const helmet = require('helmet');

 
// Load environment variables from .env file
require('dotenv').config({ path: path.join(__dirname, '../.env') });
 
const app = express();
 
// ——— Middleware ———


app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src":  ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
            "script-src-attr": ["'unsafe-hashes'", "'unsafe-inline'"],
            "connect-src": ["'self'", "https://cdn.jsdelivr.net"],
        }
    }
}));
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
const { router: authRouter } = require('./Auth');
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

// --- dashboard js ---
app.get('/api/dashboard-stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        // calorie goal from user profile
        const userRes = await pool.query(
            'SELECT calorie_goal FROM users WHERE user_id = $1',
            [req.session.userId]
        );
        const calorieGoal = userRes.rows[0]?.calorie_goal || 2000;

        // total calories eaten today from food_log
        const foodRes = await pool.query(
            `SELECT COALESCE(SUM(ROUND((f.calories * fl.quantity_grams / 100)::numeric, 1)), 0) AS total_calories,
                    COALESCE(SUM(ROUND((f.protein  * fl.quantity_grams / 100)::numeric, 1)), 0) AS total_protein,
                    COALESCE(SUM(ROUND((f.carbs    * fl.quantity_grams / 100)::numeric, 1)), 0) AS total_carbs,
                    COALESCE(SUM(ROUND((f.fibre    * fl.quantity_grams / 100)::numeric, 1)), 0) AS total_fibre
             FROM food_log fl
             JOIN foods f ON fl.food_id = f.food_id
             WHERE fl.user_id = $1 AND fl.log_date::date = CURRENT_DATE`,
            [req.session.userId]
        );

        const exerciseRes = await pool.query(
            `SELECT COALESCE(SUM(calories_burned), 0) AS total_burned
             FROM exercise_logs
             WHERE user_id = $1 AND DATE(log_date) = CURRENT_DATE`,
            [req.session.userId]
        );

        const streakRes = await pool.query(
            `WITH daily AS (
                SELECT DISTINCT log_date::date AS day
                FROM food_log WHERE user_id = $1
             ),
             numbered AS (
                SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
                FROM daily
             ),
             groups AS (
                SELECT grp, COUNT(*) AS streak, MAX(day) AS last_day
                FROM numbered GROUP BY grp
             )
             SELECT streak FROM groups
             WHERE last_day >= CURRENT_DATE - 1
             ORDER BY last_day DESC LIMIT 1`,
            [req.session.userId]
        );

        const caloriesEaten = Math.round(parseFloat(foodRes.rows[0].total_calories));
        const caloriesBurned = Math.round(parseFloat(exerciseRes.rows[0].total_burned));

        res.json({
            calories_eaten:  caloriesEaten,
            calories_burned: caloriesBurned,
            net_calories:    caloriesEaten - caloriesBurned,
            calorie_goal:    calorieGoal,
            streak:          parseInt(streakRes.rows[0]?.streak) || 0,
            macros: {
                protein: Math.round(parseFloat(foodRes.rows[0].total_protein)),
                carbs:   Math.round(parseFloat(foodRes.rows[0].total_carbs)),
                fibre:   Math.round(parseFloat(foodRes.rows[0].total_fibre)),
            }
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/weekly-exercise', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `SELECT TO_CHAR(DATE(log_date), 'Dy') AS day_label,
                    DATE(log_date) AS day_date,
                    COALESCE(SUM(calories_burned), 0) AS calories_burned
             FROM exercise_logs
             WHERE user_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '6 days'
             GROUP BY DATE(log_date)
             ORDER BY DATE(log_date) ASC`,
            [req.session.userId]
        );

        // fill in missing days with 0
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
            const dateStr = d.toISOString().split('T')[0];
            const found = result.rows.find(r => r.day_date.toISOString().split('T')[0] === dateStr);
            days.push({ label, calories_burned: found ? Math.round(parseFloat(found.calories_burned)) : 0 });
        }

        res.json({ days });
    } catch (err) {
        console.error('Weekly exercise error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/food-log/today-by-meal', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `SELECT fl.meal_type,
                    ROUND(SUM(f.calories * fl.quantity_grams / 100)::numeric, 1) AS meal_calories
             FROM food_log fl
             JOIN foods f ON fl.food_id = f.food_id
             WHERE fl.user_id = $1 AND fl.log_date::date = CURRENT_DATE
             GROUP BY fl.meal_type
             ORDER BY CASE fl.meal_type
               WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2
               WHEN 'snack' THEN 3 WHEN 'dinner' THEN 4 END`,
            [req.session.userId]
        );
        res.json({ meals: result.rows });
    } catch (err) {
        console.error('Meal breakdown error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/goals', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `SELECT goal_id, goal_type, goal_name, goal_value, actual_value, deadline, updated_at
             FROM user_goals
             WHERE user_id = $1
             ORDER BY updated_at DESC`,
            [req.session.userId]
        );
        res.json({ goals: result.rows });
    } catch (err) {
        console.error('Get goals error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
 
 
// --- goal name and deadline ---
app.post('/api/goals', async (req, res) => {
    console.log('Goals POST body:', req.body);
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const { goal_type, goal_name, goal_value, actual_value, deadline } = req.body;
    const valid = ['gym_weight', '5k_run', '10k_run', 'weight_loss',
                   'calories', 'steps', 'water', 'custom'];
    if (!goal_type || !valid.includes(goal_type))
        return res.status(400).json({ error: 'Invalid goal_type' });
    try {
        const result = await pool.query(
            `INSERT INTO user_goals
               (user_id, goal_type, goal_name, goal_value, actual_value, deadline, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             RETURNING *`,
            [
                req.session.userId,
                goal_type,
                goal_name    || null,
                goal_value   ?? null,
                actual_value ?? null,
                deadline     || null,
            ]
        );
        res.json({ success: true, goal: result.rows[0] });
    } catch (err) {
        console.error('Add goal error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
 
 
// --- Update goals ---
app.patch('/api/goals/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const { actual_value, goal_value } = req.body;
    try {
        const result = await pool.query(
            `UPDATE user_goals SET
               actual_value = COALESCE($1, actual_value),
               goal_value   = COALESCE($2, goal_value),
               updated_at   = NOW()
             WHERE goal_id = $3 AND user_id = $4
             RETURNING *`,
            [
                actual_value !== undefined ? actual_value : null,
                goal_value   !== undefined ? goal_value   : null,
                req.params.id,
                req.session.userId,
            ]
        );
        if (!result.rows.length)
            return res.status(404).json({ error: 'Goal not found' });
        res.json({ success: true, goal: result.rows[0] });
    } catch (err) {
        console.error('Update goal error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
 
 
// --- Delete goals ---
app.delete('/api/goals/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `DELETE FROM user_goals
             WHERE goal_id = $1 AND user_id = $2
             RETURNING goal_id`,
            [req.params.id, req.session.userId]
        );
        if (!result.rows.length)
            return res.status(404).json({ error: 'Goal not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('Delete goal error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/user-profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    try {
        const result = await pool.query(
            `SELECT username, real_name, email, age, height_cm, weight_kg,
                    calorie_goal
             FROM users WHERE user_id = $1`,
            [req.session.userId]
        );
        res.json(result.rows[0] || {});
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/user-profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
    const { real_name, email, age, height_cm, weight_kg, calorie_goal } = req.body;
    try {
        await pool.query(
            `UPDATE users SET
               real_name   = COALESCE($1, real_name),
               email       = COALESCE($2, email),
               age         = COALESCE($3, age),
               height_cm   = COALESCE($4, height_cm),
               weight_kg   = COALESCE($5, weight_kg),
               calorie_goal = COALESCE($6, calorie_goal)
             WHERE user_id = $7`,
            [real_name||null, email||null,
             age ? parseInt(age) : null,
             height_cm ? parseFloat(height_cm) : null,
             weight_kg ? parseFloat(weight_kg) : null,
             calorie_goal ? parseInt(calorie_goal) : null,
             req.session.userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error('Profile update error:', err);
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
