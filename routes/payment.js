var express = require('express');
var router = express.Router();
const axios = require("axios");
const toScan = new Set();
let socketapi = require("../utils/socketapi");
const jose = require('jose')

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
    "callbackUrl": "http://http://152.70.57.40/payment/callback"//https://"+req.headers.host+"/payment/callback",
  }

  const payment = await axios.post('https://api.payconiq.com/v3/payments', paymentInfo, { headers })
  toScan.add(payment.data.paymentId);

  res.render('payment', { title: 'Payment', paymentId: payment.data.paymentId, qrCode: payment.data._links.qrcode.href.concat("&f=SVG") });
});

router.get('/callback', async function(req, res) {
  const signature = req.headers['signature'].split('.')
  const jwt = signature[0]+btoa(JSON.stringify(req.body))+signature[2];

  const options = {
    crit: {"https://payconiq.com/sub":true, "https://payconiq.com/iss":true, "https://payconiq.com/iat":true, "https://payconiq.com/jti":true, "https://payconiq.com/path":true}
  }
  const JWKS =jose.createRemoteJWKSet(new URL('https://payconiq.com/certificates'))
  const { payload, protectedHeader } = await jose
      .jwtVerify(jwt, JWKS, options)
      .catch(async (error) => {
        if (error?.code === 'ERR_JWKS_MULTIPLE_MATCHING_KEYS') {
          for await (const publicKey of error) {
            try {
              return await jose.jwtVerify(jwt, publicKey, options)
            } catch (innerError) {}
          }
        }
        return res.io.emit('verificationFailed', req.body.paymentId)
      })

  if (payload && protectedHeader) {
    if(req.body.status==="SUCCEEDED"){
      return res.io.emit('betaald', req.body.paymentId);
    } else if (req.body.status==="CANCELLED"){
      return res.io.emit('failed', req.body.paymentId);
    } else
      return res.io.emit('heh', req.body.paymentId);
  }
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
