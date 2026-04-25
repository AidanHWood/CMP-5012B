const express = require('express');

const app = express();
const PORT = 3000;


app.use(express.json());


const path = require('path');

app.use(express.static(path.join(__dirname, '../../Code')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../Code/homepage.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});