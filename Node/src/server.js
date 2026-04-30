
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
// This keeps secrets (DB password, email password) out of your code
require('dotenv').config({ path: path.join(__dirname, '../.env') });
 
const app = express();
 
// ——— Middleware ———
// These run on EVERY request before your routes
 
// Parses JSON bodies (for fetch() with Content-Type: application/json)
app.use(express.json());
 
// Parses form submissions (for traditional <form> posts)
app.use(express.urlencoded({ extended: true }));
 
// ——— Session Setup ———
// Sessions let the server "remember" a logged-in user between requests.
// When someone logs in, we store their user_id in req.session.
// Express creates a cookie called "connect.sid" in the browser,
// which links back to the session data stored on the server.
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-to-something-random',
    resave: false,              // Don't save session if nothing changed
    saveUninitialized: false,   // Don't create session until something is stored
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,  // Cookie lasts 24 hours
        httpOnly: true                  // JavaScript can't access the cookie (security)
    }
}));
 
// Serve static files (HTML, CSS, JS) from the Code folder
app.use(express.static(path.join(__dirname, '../../Code')));
 
// ——— Wire in the Auth router ———
// Auth.js exports a router with all the login/register/reset routes.
// app.use() plugs it in so those routes are active.
const authRouter = require('./Auth');
app.use(authRouter);
 
// ——— Existing food JSON route ———
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
 
// ——— Homepage route ———
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/homepage.html'));
});
 
// ——— Start Server ———
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});