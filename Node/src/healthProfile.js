const express = require('express');
const router  = express.Router();
const pool    = require('./db');
const { verifyCsrf } = require('./Auth.js')

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Not logged in.' });
}

//this get request fetches the logged in users height and weight from the database,
//it is used to populate the health profile page and calculate the users BMI
router.get('/api/health-profile', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT height_cm, weight_kg FROM users WHERE user_id = $1`,
            [req.session.userId]
        );

        if (!result.rows.length)
            return res.status(404).json({ error: 'User not found.' });

        res.json(result.rows[0]);

    } catch (err) {
        console.error('GET /api/health-profile error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});


//This is the post request for the health proile, it checks if they have the valid auth checks,
// then it checks to see if the user has made any changes to their height or weight values
router.post('/api/health-profile', requireAuth, verifyCsrf , async (req, res) => {
    const { height_cm, weight_kg } = req.body;

    const height = height_cm ? parseFloat(height_cm) : null;
    const weight = weight_kg ? parseFloat(weight_kg) : null;

    if (height !== null && (isNaN(height) || height < 50 || height > 250))
        return res.status(400).json({ success: false, error: 'Height must be between 50 and 250 cm.' });

    if (weight !== null && (isNaN(weight) || weight < 20 || weight > 300))
        return res.status(400).json({ success: false, error: 'Weight must be between 20 and 300 kg.' });

    try {
        await pool.query(
            `UPDATE users SET
               height_cm = COALESCE($1, height_cm),
               weight_kg = COALESCE($2, weight_kg)
             WHERE user_id = $3`,
            [height, weight, req.session.userId]
        );

        res.json({ success: true });

    } catch (err) {
        console.error('POST /api/health-profile error:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

module.exports = router;
