const express = require('express');
const router  = express.Router();
const pool    = require('./db');
const { verifyCsrf } = require('/Auth.js')
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Not logged in.' });
}

// ─── DELETE /api/account ─────────────────────────────────────
// Deletes all data belonging to the logged-in user then removes
// the user row itself. Each table is deleted explicitly so only
// the session user's rows are affected — no cascading into other
// users' data.
router.delete('/api/account', requireAuth, verifyCsrf,  async (req, res) => {
    const userId = req.session.userId;

    try {
        // Delete all user-owned data in dependency order
        // (child rows first, users row last)
        await pool.query(`DELETE FROM food_log        WHERE user_id = $1`, [userId]);
        await pool.query(`DELETE FROM exercise_logs   WHERE user_id = $1`, [userId]);
        await pool.query(`DELETE FROM weight_logs     WHERE user_id = $1`, [userId]);
        await pool.query(`DELETE FROM goals      WHERE user_id = $1`, [userId]);
        await pool.query(`DELETE FROM friendships     WHERE user_id = $1 OR f_user_id = $1`, [userId]);

        // Delete the user row itself
        const result = await pool.query(
            `DELETE FROM users WHERE user_id = $1 RETURNING user_id`,
            [userId]
        );

        if (!result.rows.length)
            return res.status(404).json({ success: false, error: 'User not found.' });

        // Destroy the session so they can't make further requests
        req.session.destroy(err => {
            if (err) console.error('Session destroy error after account deletion:', err);
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });

    } catch (err) {
        console.error('DELETE /api/account error:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

module.exports = router;