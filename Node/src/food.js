// ═══════════════════════════════════════════════════════════════
//  routes/foods.js — Food search and logging routes
//  Uses FDC API with PostgreSQL caching
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const { Pool } = require('pg');
const { verifyCsrf } = require('/Auth.js')

const pool = new Pool({
    host:     process.env.DB_HOST,
    port:     process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

pool.on('connect', (client) => {
    client.query('SET search_path TO cmp5012b, public');
});
const router  = express.Router();
const API_KEY = process.env.FDC_API_KEY;

// ─── Nutrient IDs we care about ──────────────────────────────
const NUTRIENT_MAP = {
    1008: 'calories',
    1062: 'energy',
    1003: 'protein',
    1004: 'fat',
    1005: 'carbs',
    1079: 'fibre',
    2000: 'sugars',
    1093: 'sodium',
};

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Not logged in.' });
}

// ─── Helper: extract nutrients from FDC food object ──────────
function extractNutrients(foodNutrients = []) {
    const result = {};
    for (const n of foodNutrients) {
        const key = NUTRIENT_MAP[n.nutrientId || n.nutrient?.id];
        if (key) result[key] = n.value ?? n.amount ?? null;
    }
    return result;
}

// ─── Helper: save a food to DB cache ─────────────────────────
async function cacheFood(name, nutrients) {
    try {
        const result = await pool.query(
            `INSERT INTO foods (food_name, "Energy", calories, protein, fat, carbs, fibre, sugars, sodium)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (food_name) DO UPDATE SET
               "Energy"  = EXCLUDED."Energy",
               calories  = EXCLUDED.calories,
               protein   = EXCLUDED.protein,
               fat       = EXCLUDED.fat,
               carbs     = EXCLUDED.carbs,
               fibre     = EXCLUDED.fibre,
               sugars    = EXCLUDED.sugars,
               sodium    = EXCLUDED.sodium
             RETURNING *`,
            [
                name,
                nutrients.energy   || null,
                nutrients.calories || null,
                nutrients.protein  || null,
                nutrients.fat      || null,
                nutrients.carbs    || null,
                nutrients.fibre    || null,
                nutrients.sugars   || null,
                nutrients.sodium   || null,
            ]
        );
        return result.rows[0];
    } catch (err) {
        console.error('Cache error:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  GET /api/foods/search?q=banana
//  1. Check DB cache first
//  2. If no results, call FDC API and cache results
// ═══════════════════════════════════════════════════════════════
router.get('/api/foods/search', requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2 || q.trim().length > 100)
        return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

    try {
        // 1. Check DB cache
        const cached = await pool.query(
            `SELECT * FROM foods WHERE LOWER(food_name) LIKE LOWER($1) LIMIT 20`,
            [`%${q.trim()}%`]
        );

        if (cached.rows.length > 0) {
            return res.json({ source: 'cache', foods: cached.rows });
        }

        // 2. Cache miss — call FDC API
        const apiUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&api_key=${API_KEY}&pageSize=20&dataType=SR%20Legacy,Foundation`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            return res.status(502).json({ error: 'Failed to reach food database API.' });
        }

        const data = await response.json();

        if (!data.foods || data.foods.length === 0) {
            return res.json({ source: 'api', foods: [] });
        }

        // 3. Cache each result in DB
        const saved = [];
        for (const food of data.foods) {
            const nutrients = extractNutrients(food.foodNutrients || []);
            const cached    = await cacheFood(food.description, nutrients);
            if (cached) saved.push(cached);
        }

        return res.json({ source: 'api', foods: saved });

    } catch (err) {
        console.error('Food search error:', err);
        res.status(500).json({ error: 'Server error during food search.' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/food-log
//  Log a food entry for the logged-in user
//  Body: { food_id, quantity_grams, meal_type }
// ═══════════════════════════════════════════════════════════════
router.post('/api/food-log', requireAuth, verifyCsrf, async (req, res) => {
    const { food_id, quantity_grams, meal_type } = req.body;

    if (!food_id || !quantity_grams || !meal_type) {
        return res.status(400).json({ error: 'food_id, quantity_grams and meal_type are required.' });
    }

    const validMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validMeals.includes(meal_type.toLowerCase())) {
        return res.status(400).json({ error: 'meal_type must be breakfast, lunch, dinner or snack.' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO food_log (user_id, food_id, quantity_grams, meal_type, log_date)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING *`,
            [req.session.userId, food_id, quantity_grams, meal_type.toLowerCase()]
        );
        res.json({ success: true, entry: result.rows[0] });

    } catch (err) {
        console.error('Food log error:', err);
        res.status(500).json({ error: 'Server error while logging food.' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  GET /api/food-log/today
//  Get today's food log with scaled nutrients and total calories
// ═══════════════════════════════════════════════════════════════
router.get('/api/food-log/today', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                fl.f_log_id,
                fl.quantity_grams,
                fl.meal_type,
                fl.log_date,
                f.food_id,
                f.food_name,
                -- Scale nutrients by quantity (values are per 100g)
                ROUND((f.calories * fl.quantity_grams / 100)::numeric, 1) AS calories,
                ROUND((f.protein  * fl.quantity_grams / 100)::numeric, 1) AS protein,
                ROUND((f.fat      * fl.quantity_grams / 100)::numeric, 1) AS fat,
                ROUND((f.carbs    * fl.quantity_grams / 100)::numeric, 1) AS carbs,
                ROUND((f.fibre    * fl.quantity_grams / 100)::numeric, 1) AS fibre,
                ROUND((f.sugars   * fl.quantity_grams / 100)::numeric, 1) AS sugars,
                ROUND((f.sodium   * fl.quantity_grams / 100)::numeric, 1) AS sodium
             FROM food_log fl
             JOIN foods f ON fl.food_id = f.food_id
             WHERE fl.user_id = $1
               AND fl.log_date::date = CURRENT_DATE
             ORDER BY fl.log_date ASC`,
            [req.session.userId]
        );

        const totalCalories = result.rows.reduce((sum, row) => sum + (parseFloat(row.calories) || 0), 0);

        res.json({ entries: result.rows, total_calories: Math.round(totalCalories) });

    } catch (err) {
        console.error('Food log fetch error:', err);
        res.status(500).json({ error: 'Server error while fetching food log.' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  DELETE /api/food-log/:id
//  Remove a food log entry (only if it belongs to the user)
// ═══════════════════════════════════════════════════════════════
router.delete('/api/food-log/:id', requireAuth, verifyCsrf, async (req, res) => {
    try {
        const result = await pool.query(
            `DELETE FROM food_log WHERE f_log_id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.session.userId]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Entry not found.' });

        res.json({ success: true });

    } catch (err) {
        console.error('Food log delete error:', err);
        res.status(500).json({ error: 'Server error while deleting entry.' });
    }
});

// ═══════════════════════════════════════════════════════════════
//  POST /api/foods/manual
//  Creates a new food in foods table then logs it
// ═══════════════════════════════════════════════════════════════
router.post('/api/foods/manual', requireAuth, verifyCsrf, async (req, res) => {
    const { food_name, calories, energy, protein, fat, carbs, fibre, sugars, sodium, quantity_grams, meal_type } = req.body;


    if (!food_name || !calories || !quantity_grams || !meal_type)
        return res.status(400).json({ error: 'food_name, calories, quantity_grams and meal_type are required.' });

    const validMeals = ['breakfast', 'lunch', 'dinner', 'snack'];
    if (!validMeals.includes(meal_type.toLowerCase()))
        return res.status(400).json({ error: 'Invalid meal type.' });

    try {
        const numericFields = [
            { name: 'Food Name', value: food_name.trim().length, min: 2, max: 150, required: true},
            { name: 'Calories', value: calories, min: 0, max: 10000, required: true },
            { name: 'Quantity', value: quantity_grams, min: 1, max: 10000, required: true},
            { name: 'Protein', value: protein, min: 0, max: 1000, required: false},
            { name: 'Fat', value: fat, min: 0, max: 1000, required: false},
            { name: 'Carbs', value: carbs, min: 0, max: 1000, required: false},
            { name: 'Fibre', value: fibre, min: 0, max: 1000, required: false},
            { name: 'Sugars', value: sugars, min: 0, max: 1000, required: false},
            { name: 'Sodium', value: sodium, min: 0, max: 100000, required: false}
        ];

        for (const field of numericFields) {
            if (!field.required && !field.value) continue;
            const num = Number(field.value);
            if (isNaN(num) || num < field.min || num > field.max)
                return res.status(400).json({error:`${field.name} must be between ${field.min} and ${field.max}`});
        }
        const foodResult = await pool.query(
            `INSERT INTO foods (food_name, "Energy", calories, protein, fat, carbs, fibre, sugars, sodium)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (food_name) DO UPDATE SET calories = EXCLUDED.calories
             RETURNING *`,
            [food_name.trim(), energy || null, calories, protein || null, fat || null, carbs || null, fibre || null, sugars || null, sodium || null]
        );

        const food = foodResult.rows[0];

        const logResult = await pool.query(
            `INSERT INTO food_log (user_id, food_id, quantity_grams, meal_type, log_date)
             VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
            [req.session.userId, food.food_id, quantity_grams, meal_type.toLowerCase()]
        );

        res.json({ success: true, food, entry: logResult.rows[0] });

    } catch (err) {
        console.error('Manual food error:', err);
        res.status(500).json({ error: 'Server error while saving food.' });
    }
});

module.exports = router;