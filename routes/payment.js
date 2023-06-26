var express = require('express');
var router = express.Router();
const axios = require("axios");
const jwksClient = require('jwks-ec');
const jwt = require('jsonwebtoken');
const toScan = new Set();
let app
let io

function initiateSocketIo() {
  app = require("../app");

  io = require('socket.io')(app.server, {
    cors: {
      methods: ["GET", "POST"],
      transports: ['websocket', 'polling'],
      credentials: true
    },
    allowEIO3: true
  });
  app.app.use(function(req, res, next){
    res.io = io;
    next();
  });
}

setTimeout(initiateSocketIo, 5000)

const client = jwksClient({
  cache: true, // Default Value
  cacheMaxEntries: 5, // Default value
  jwksUri: 'https://payconiq.com/certificates',
  cacheMaxAge: 600000, // Defaults to 10m
  requestHeaders: {}, // Optional
  requestAgentOptions: {} // Optional
});

const headers = {
  'Authorization': 'Bearer ' + process.env.PAYCONIQ_BEARER,
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/JSON',
};

router.get('/', async function(req, res) {

  let paymentInfo = {
    "amount": 1,//req.query.amount * 100,
    "currency": "EUR",
    "description": "Drankkaart",
    "callbackUrl": "https://minivoetbal.scoutswaregem.be/callback"//https://"+req.headers.host+"/payment/callback",
  }

  const payment = await axios.post('https://api.payconiq.com/v3/payments', paymentInfo, { headers })
  toScan.add(payment.data.paymentId);

  res.render('payment', { title: 'Payment', paymentId: payment.data.paymentId, qrCode: payment.data._links.qrcode.href.concat("&f=SVG") });
});

router.get('/callback', async function(req, res) {
  const JWT = "eyJ0eXAiOiJKT1NFK0pTT04iLCJraWQiOiJlcy5zaWduYXR1cmUucGF5Y29uaXEuY29tLjIwMjMiLCJhbGciOiJFUzI1NiIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2lhdCI6IjIwMjMtMDYtMjZUMDA6NDk6MDYuODgzNTM1WiIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2p0aSI6IjE2NWRiZTYyZTJiZDdlMyIsImh0dHBzOi8vcGF5Y29uaXEuY29tL3BhdGgiOiJodHRwczovL21pbml2b2V0YmFsLnNjb3V0c3dhcmVnZW0uYmUvY2FsbGJhY2siLCJodHRwczovL3BheWNvbmlxLmNvbS9pc3MiOiJQYXljb25pcSIsImh0dHBzOi8vcGF5Y29uaXEuY29tL3N1YiI6IjYzOTg0NGYxOGVmZDFhMjM4ODlkOGEzMCIsImNyaXQiOlsiaHR0cHM6Ly9wYXljb25pcS5jb20vaWF0IiwiaHR0cHM6Ly9wYXljb25pcS5jb20vanRpIiwiaHR0cHM6Ly9wYXljb25pcS5jb20vcGF0aCIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2lzcyIsImh0dHBzOi8vcGF5Y29uaXEuY29tL3N1YiJdfQ..ksPejngyQKQ7G063_zgDsiTpDlsyF6LEOUntElM8Zr0TG_cHmPRefxWFDhqxziO3AaWTSdJC5P20B35zmULikQ"
  //const JWT = req.headers['signature']
  const signature = JWT.split('.')
  let buff = new Buffer(signature[0], 'base64');
  const JOSE_header = JSON.parse(buff.toString('ascii'));

  let token = buff.toString('ascii')
  buff = new Buffer(signature[2], 'base64');
  const JWS_signature = buff.toString('ascii');

  let signingKey = await getSigningKey(JOSE_header.kid);
  signingKey = "-----BEGIN PUBLIC KEY-----\n" +
      "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvIjXgNAOS1XwZGFDqUTw0QyZ/Ttu\n" +
      "RW4yxwvu+KxadL+6W6W6n3Huwxc7dzRUuBtX8x0qePVs9uPrsf2IPWsb9g==\n" +
      "-----END PUBLIC KEY-----\n"
  jwt.verify(JWT, signingKey, function(err, decoded) {
    console.log(decoded)
  });

  // client.getSigningKey(JOSE_header.kid, (err, key) => {
  //   const signingKey = key.publicKey || key.privateKey;
  //   console.log(5)
  //   // Now I can use this to configure my Express or Hapi middleware
  // });

  // buff = new Buffer(signature[2], 'base64');
  // const JWS_signature = buff.toString('ascii');


  if(req.body.status==="SUCCEEDED"){
    return res.io.emit('betaald', req.body.paymentId);
  } else if (req.body.status==="CANCELLED"){
    return res.io.emit('failed', req.body.paymentId);
  } else
    return res.io.emit('heh', req.body.paymentId);
})

router.post('/cancel', async function(req, res) {
  let response
  try{
    response = await axios.delete('https://api.payconiq.com/v3/payments/'+req.body.paymentId, { headers })
  } catch (e) {
    return res.send("heh")
  }

  if(response.status===204)
    res.send("k")
  else
    res.send("heh")
})

const getSigningKey = (kid) => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key.publicKey || key.privateKey;
        resolve(signingKey);
      }
    });
  });
};

async function pollScanned() {

  const paymentIdsToRemove = [];

  for (const paymentId of toScan) {
    try {
      const response = await axios.get(`https://api.payconiq.com/v3/payments/${paymentId}`, {headers});
      const paymentStatus = response.data.status;

      if (paymentStatus !== 'PENDING') {
        io.emit('scanned', paymentId);
        paymentIdsToRemove.push(paymentId);
      }
    } catch (error) {
      console.error(`Error while polling payment ${paymentId}:`, error);
    }
  }

  // Remove the identified payment IDs from the toScan set
  for (const paymentId of paymentIdsToRemove) {
    toScan.delete(paymentId);
  }
}


// Add the following line to periodically call the pollScanned function, for example every minute.
setInterval(pollScanned, 1000);


module.exports = router;
