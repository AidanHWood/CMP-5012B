//this javascript file is used as a setup for the postgres database connection.
//setting up the connection pool for the database to be accessed.
//then it connects to the database, and gives a success or error message, dependent on the outcome of the connection


const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port:     process.env.DB_PORT || 5432,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: 3
});

pool.on('connect', (client) => {
    client.query('SET search_path TO cmp5012b, public');
});

pool.connect()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => console.error('DB connection error:', err.message));

module.exports = pool;
