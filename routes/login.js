const express = require('express');
const router = express.Router();

const redirectHome = (req, res, next) =>{
    if(req.session.userId)
        return res.redirect('/')
    next()
}

router.get("/", redirectHome, (req,res)=>{
    res.render('login', {title: 'Login'});
})

router.post("/", redirectHome, (req, res) => {

    if (req.body.password === process.env.ACCESSPASS) {
        req.session.userId = 1

        return res.send("K")
    }
    return res.send('fout')
})

module.exports = router;
