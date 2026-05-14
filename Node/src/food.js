const express = require('express');
const { Pool } = require('pg');
const { body, validationResult } = require('express-validator');
const { verifyCsrf } = require('./Auth.js');

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

function extractNutrients(foodNutrients = []) {
    const result = {};
    for (const n of foodNutrients) {
        const key = NUTRIENT_MAP[n.nutrientId || n.nutrient?.id];
        if (key) result[key] = n.value ?? n.amount ?? null;
    }
    return result;
}

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

router.get('/api/foods/search', requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2 || q.trim().length > 100)
        return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

    try {
        const cached = await pool.query(
            `SELECT * FROM foods WHERE LOWER(food_name) LIKE LOWER($1) LIMIT 20`,
            [`%${q.trim()}%`]
        );

        if (cached.rows.length > 0) {
            return res.json({ source: 'cache', foods: cached.rows });
        }

        const apiUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&api_key=${API_KEY}&pageSize=20&dataType=SR%20Legacy,Foundation`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            return res.status(502).json({ error: 'Failed to reach food database API.' });
        }

        const data = await response.json();

        if (!data.foods || data.foods.length === 0) {
            return res.json({ source: 'api', foods: [] });
        }

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

const foodLogValidation = [
    body('food_id').isInt({ min: 1 }).withMessage('Invalid food_id.'),
    body('quantity_grams').isFloat({ min: 1, max: 10000 }).withMessage('Quantity must be between 1 and 10000.'),
    body('meal_type').isIn(['breakfast', 'lunch', 'dinner', 'snack']).withMessage('Invalid meal type.'),
];

router.post('/api/food-log', requireAuth, verifyCsrf, foodLogValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { food_id, quantity_grams, meal_type } = req.body;

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

const manualFoodValidation = [
    body('food_name').trim().isLength({ min: 2, max: 150 }).withMessage('Food name must be between 2 and 150 characters.'),
    body('calories').isFloat({ min: 0, max: 10000 }).withMessage('Calories must be between 0 and 10000.'),
    body('quantity_grams').isFloat({ min: 1, max: 10000 }).withMessage('Quantity must be between 1 and 10000.'),
    body('meal_type').isIn(['breakfast', 'lunch', 'dinner', 'snack']).withMessage('Invalid meal type.'),
    body('energy').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 50000 }),
    body('protein').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 1000 }),
    body('fat').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 1000 }),
    body('carbs').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 1000 }),
    body('fibre').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 1000 }),
    body('sugars').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 1000 }),
    body('sodium').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100000 }),
];

router.post('/api/foods/manual', requireAuth, verifyCsrf, manualFoodValidation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { food_name, calories, energy, protein, fat, carbs, fibre, sugars, sodium, quantity_grams, meal_type } = req.body;

    try {
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