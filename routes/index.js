var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', (req, res) => {
    let amounts = [5, 10, 15, 20, 30, 50];

    try {
        const parsed = process.env.AMOUNTS.split(';').map(Number).filter(n => !isNaN(n));
        if (parsed.length >= 6) amounts = parsed.slice(0, 6);
    } catch {}

    res.render('index', { title: 'Payments', amounts });
});

module.exports = router;
