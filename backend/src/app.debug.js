const express = require('express');

const app = express();

app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.use((req, res) => {
    res.status(404).json({ status: 'fail', message: 'Not found' });
});

module.exports = app;
