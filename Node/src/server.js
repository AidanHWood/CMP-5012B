//Server code, this is where we install the dependencies, specify the paths, create the session and generate the secret etc yap yap

const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60
    }
}));

app.use(express.static(path.join(__dirname, '../../Code')));

const authRoutes = require('../../Code/Auth');
app.use('/', authRoutes);

app.use((req, res, next) => {
    console.log(req.session);
    next();
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/homepage.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

