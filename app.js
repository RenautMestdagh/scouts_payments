const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
// const session = require('cookie-session');
const favicon = require("serve-favicon");
require('dotenv').config();

const app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public', 'images', 'favicon.ico'))); //tab small picture (favicon)

// app.use(
//     session({
//       resave: false,
//       saveUninitialized: false,
//       secret: 'Smhi*5zRr&Drv#7L',
//     })
// )

// const redirectLogin = (req, res, next) => {
//   if (!( req.session.userId || req.headers['user-agent']==="Payconiq Payments/v3"))
//     return res.redirect('/login')
//   next()
// }
//
// app.use('/login', require('./routes/login'));

app.use('/', /*redirectLogin,*/ require('./routes/index'));
app.use('/payment', require('./routes/payment'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;