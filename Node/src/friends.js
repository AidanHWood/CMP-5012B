const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const { verifyCsrf } = require('./Auth.js');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
});

pool.on('connect', (client) => {
    client.query('SET search_path TO cmp5012b, public');
});

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.status(401).json({ error: 'Not logged in.' });
}


//this get request fetches all accepted friends for the logged in user,
//it joins the friendships and users tables to return the friend details
router.get('/api/friends', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.user_id, u.username, u.real_name, f.status, f.created_at
             FROM friendships f
             JOIN users u ON (
                 CASE WHEN f.user_id = $1 THEN f.f_user_id ELSE f.user_id END = u.user_id
             )
             WHERE (f.user_id = $1 OR f.f_user_id = $1) AND f.status = 'accepted'`,
            [req.session.userId]
        );
        res.json({ friends: result.rows });
    } catch (err) {
        console.error('Get friends error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});


//this get request fetches all pending friend requests sent to the logged in user,
//it is used to populate the friend requests section on the friends page
router.get('/api/friends/requests', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.user_id, u.username, u.real_name, f.created_at
             FROM friendships f
             JOIN users u ON f.user_id = u.user_id
             WHERE f.f_user_id = $1 AND f.status = 'pending'`,
            [req.session.userId]
        );
        res.json({ requests: result.rows });
    } catch (err) {
        console.error('Get requests error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

//this get request searches for users by username or real name,
//it also returns the friendship status and direction so the frontend knows whether to show add, sent or accept buttons
router.get('/api/friends/search', requireAuth, async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim().length < 2 || q.trim().length > 100)
        return res.status(400).json({ error: 'Search query must be at least 2 characters.' });

    try {
        const result = await pool.query(
            `SELECT u.user_id, u.username, u.real_name,
                    f.status,
                    CASE
                        WHEN f.user_id = $1 THEN 'sent'
                        WHEN f.f_user_id = $1 THEN 'received'
                        ELSE NULL
                    END AS direction
             FROM users u
             LEFT JOIN friendships f ON (
                 (f.user_id = $1 AND f.f_user_id = u.user_id) OR
                 (f.f_user_id = $1 AND f.user_id = u.user_id)
             )
             WHERE u.user_id != $1
               AND (LOWER(u.username) LIKE LOWER($2) OR LOWER(u.real_name) LIKE LOWER($2))
             LIMIT 10`,
            [req.session.userId, `%${q.trim()}%`]
        );
        res.json({ users: result.rows });
    } catch (err) {
        console.error('Friend search error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

//This is the post request for when a user requests fo be friends with another user, first it checks the valid CSRF and auth functions,
//Then it will select both of the users and insert both the values into the friendships table, describing the relationship between the 2 users
router.post('/api/friends/request', requireAuth, verifyCsrf, async (req, res) => {
    const userId = parseInt(req.body.userId);
    if (!userId || isNaN(userId) || userId <=0)
        return res.status(400).json({ error: 'Invalid userId.'});

    try {
        const existing = await pool.query(
            `SELECT status FROM friendships
             WHERE (user_id = $1 AND f_user_id = $2) OR (user_id = $2 AND f_user_id = $1)`,
            [req.session.userId, userId]
        );

        if (existing.rows.length > 0)
            return res.status(400).json({ error: `Friend request already ${existing.rows[0].status}.` });

        await pool.query(
            `INSERT INTO friendships (user_id, f_user_id, status, created_at, updated_at)
             VALUES ($1, $2, 'pending', NOW(), NOW())`,
            [req.session.userId, userId]
        );

        res.json({ success: true, message: 'Friend request sent.' });
    } catch (err) {
        console.error('Friend request error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

//this is a post request for then the requested friends accepts the invitation
// all this function changes is the status of the friendship from pending to accepted.
//then the friend will be able to be viewed on both thefriends and leaderboards page
router.post('/api/friends/accept', requireAuth, verifyCsrf, async (req, res) => {
    const userId = parseInt(req.body.userId);
    if (!userId || isNaN(userId) || userId <=0)
        return res.status(400).json({ error: 'Invalid userId.'});
    try {
        const result = await pool.query(
            `UPDATE friendships SET status = 'accepted', updated_at = NOW()
             WHERE user_id = $1 AND f_user_id = $2 AND status = 'pending'
             RETURNING *`,
            [userId, req.session.userId]
        );

        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Friend request not found.' });

        res.json({ success: true, message: 'Friend request accepted.' });
    } catch (err) {
        console.error('Accept friend error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

//this is the post request for when the requested friend rejects the request, this will just delete both of the users information from the friendship table,
// we do this because if there has been a rejection, then there is no relationship between the 2 users anymore, so we must delete them both from the table
router.post('/api/friends/reject', requireAuth, verifyCsrf, async (req, res) => {
    const userId = parseInt(req.body.userId);
    if (!userId || isNaN(userId) || userId <=0)
        return res.status(400).json({ error: 'Invalid userId.'});
    try {
        await pool.query(
            `DELETE FROM friendships
             WHERE (user_id = $1 AND f_user_id = $2) OR (user_id = $2 AND f_user_id = $1)`,
            [req.session.userId, userId]
        );

        res.json({ success: true, message: 'Friendship removed.' });
    } catch (err) {
        console.error('Reject friend error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;

