var express = require('express');
var router = express.Router();
const axios = require("axios");
const jwksClient = require('jwks-ec');
const jwt = require('jsonwebtoken');
const toScan = new Set();
let socketapi = require("../utils/socketapi");
const jose = require('jose')

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
  const jwt = "eyJ0eXAiOiJKT1NFK0pTT04iLCJraWQiOiJlcy5zaWduYXR1cmUucGF5Y29uaXEuY29tLjIwMjMiLCJhbGciOiJFUzI1NiIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2lhdCI6IjIwMjMtMDYtMjZUMDI6NDk6NTEuNDU5MTc5WiIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2p0aSI6IjgxZjJlNGQ3OTFiYWYwODYiLCJodHRwczovL3BheWNvbmlxLmNvbS9wYXRoIjoiaHR0cHM6Ly9taW5pdm9ldGJhbC5zY291dHN3YXJlZ2VtLmJlL2NhbGxiYWNrIiwiaHR0cHM6Ly9wYXljb25pcS5jb20vaXNzIjoiUGF5Y29uaXEiLCJodHRwczovL3BheWNvbmlxLmNvbS9zdWIiOiI2Mzk4NDRmMThlZmQxYTIzODg5ZDhhMzAiLCJjcml0IjpbImh0dHBzOi8vcGF5Y29uaXEuY29tL2lhdCIsImh0dHBzOi8vcGF5Y29uaXEuY29tL2p0aSIsImh0dHBzOi8vcGF5Y29uaXEuY29tL3BhdGgiLCJodHRwczovL3BheWNvbmlxLmNvbS9pc3MiLCJodHRwczovL3BheWNvbmlxLmNvbS9zdWIiXX0..ezk94vlx13_w2wCO9tvmlLIS9o48-gqkQftOylSKYdXmAgEluFy3rOUkr81HaVzMrFqDd02_qHv_jNhjRrBtYw"
  // //const JWT = req.headers['signature']
  // const signature = JWT.split('.')
  // let buff = new Buffer(signature[0], 'base64');
  // const JOSE_header = JSON.parse(buff.toString('ascii'));
  //
  // let token = buff.toString('ascii')
  // buff = new Buffer(signature[2], 'base64');
  // const JWS_signature = buff.toString('ascii');
  //
  // let signingKey = await getSigningKey(JOSE_header.kid);
  // signingKey = "-----BEGIN PUBLIC KEY-----\n" +
  //     "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEvIjXgNAOS1XwZGFDqUTw0QyZ/Ttu\n" +
  //     "RW4yxwvu+KxadL+6W6W6n3Huwxc7dzRUuBtX8x0qePVs9uPrsf2IPWsb9g==\n" +
  //     "-----END PUBLIC KEY-----\n"
  //
  // jwt.verify(JWS_signature, signingKey, function(err, decoded) {
  //   console.log(decoded)
  // });

  const options = {
    crit: {"https://payconiq.com/sub":true, "https://payconiq.com/iss":true, "https://payconiq.com/iat":true, "https://payconiq.com/jti":true, "https://payconiq.com/path":true}
  }
  const JWKS =jose.createRemoteJWKSet(new URL('https://payconiq.com/certificates'))
  const { payload, protectedHeader } = await jose
      .jwtVerify(jwt, JWKS, options)
      .catch(async (error) => {
        console.log("heeeh")
        if (error?.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS') {
          for await (const publicKey of error) {
            try {
              return await jose.jwtVerify(jwt, publicKey, options)
            } catch (innerError) {
              if (innerError?.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
                continue
              }
              throw innerError
            }
          }
          throw new jose.errors.JWSSignatureVerificationFailed()
        }
        throw error
      })
  console.log(protectedHeader)
  console.log(payload)

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
        socketapi.io.emit('scanned', paymentId);
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
