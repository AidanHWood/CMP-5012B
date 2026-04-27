const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(express.json());

// serve frontend
app.use(express.static(__dirname));

const filePath = path.join(__dirname, 'data', 'food.json');

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'logCalories.html'));
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});