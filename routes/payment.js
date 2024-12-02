const express = require('express');
const router = express.Router();
const axios = require("axios");
const jose = require('jose');
const socketapi = require("../utils/socketapi");

const toScan = new Map(); // key = paymentID, value = timestamp
const PAYCONIQ_BASE_URL = 'https://api.payconiq.com/v3/payments';
const PAYCONIQ_CERT_URL = 'https://payconiq.com/certificates';

const headers = {
  Authorization: `Bearer ${process.env.PAYCONIQ_BEARER}`,
  'Cache-Control': 'no-cache',
  'Content-Type': 'application/json',
};

// Helper functions
const isExpired = (paymentId) => {
  const timeCreated = toScan.get(paymentId);
  return Date.now() - timeCreated >= 1200000; // Expired after 20 minutes
};

const pollScanned = async () => {
  const paymentIdsToRemove = [];

  for (const paymentId of toScan.keys()) {
    try {
      const { data } = await axios.get(`${PAYCONIQ_BASE_URL}/${paymentId}`, { headers });
      if (data.status !== 'PENDING') {
        socketapi.io.emit('scanned', paymentId);
        //paymentIdsToRemove.push(paymentId);
      } else if (isExpired(paymentId)) {
        paymentIdsToRemove.push(paymentId);
      } else {
        socketapi.io.emit('auth_fail', paymentId);
        paymentIdsToRemove.push(paymentId);
      }
    } catch (error) {
      console.error(`Error polling payment ${paymentId}:`, error.message);
    }
  }

  paymentIdsToRemove.forEach((id) => toScan.delete(id));
};

// Routes
router.get('/', async (req, res) => {
  const amount = parseFloat(req.query.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid or missing 'amount' query parameter." });
  }

  const paymentInfo = {
    amount: Math.round(amount * 100),
    currency: "EUR",
    callbackUrl: `https://${req.headers.host}/payment/callback`,
  };

  try {
    const { data } = await axios.post(PAYCONIQ_BASE_URL, paymentInfo, { headers });
    toScan.set(data.paymentId, Date.now());

    res.json({
      paymentId: data.paymentId,
      qrCode: `${data._links.qrcode.href}&f=SVG`,
    });
  } catch (error) {
    console.error("Error creating payment:", error.message || error);
    res.status(500).json({ error: "Failed to create payment." });
  }
});

router.post('/callback', async (req, res) => {
  res.sendStatus(200); // Acknowledge receipt
  toScan.delete(req.body.paymentId);

  try {
    const signature = req.headers['signature'].split('.');
    signature[1] = jose.base64url.encode(JSON.stringify(req.body));
    const jwt = signature.join(".");

    const options = {
      crit: {
        "https://payconiq.com/sub": true,
        "https://payconiq.com/iss": true,
        "https://payconiq.com/iat": true,
        "https://payconiq.com/jti": true,
        "https://payconiq.com/path": true,
      },
    };

    const JWKS = jose.createRemoteJWKSet(new URL(PAYCONIQ_CERT_URL));
    const { payload, protectedHeader } = await jose.jwtVerify(jwt, JWKS, options);

    if (!payload || !protectedHeader) {
      throw new Error("JWT verification failed");
    }

    const { paymentId, status } = req.body;
    switch (status) {
      case "SUCCEEDED":
        socketapi.io.emit('betaald', paymentId);
        break;
      case "AUTHORIZATION_FAILED":
        socketapi.io.emit('auth_fail', paymentId);
        break;
      case "CANCELLED":
        socketapi.io.emit('canceled', paymentId);
        break;
      case "EXPIRED":
        socketapi.io.emit('expired', paymentId);
        break;
      case "FAILED":
        console.log("Payment failed:", status);
        socketapi.io.emit('failed', paymentId);
        break;
      default:
        console.log("Unexpected status:", req.body);
        socketapi.io.emit('heh', paymentId);
    }
  } catch (error) {
    console.error("JWT verification error:", error.message);
    socketapi.io.emit('verificationFailed', req.body?.paymentId || null);
  }
});

router.post('/cancel', async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) return res.status(400).send("Missing paymentId.");

  try {
    const response = await axios.delete(`${PAYCONIQ_BASE_URL}/${paymentId}`, { headers });
    res.send(response.status === 204 ? "k" : "heh");
  } catch (error) {
    console.error("Error canceling payment:", error.message);
    res.send("heh");
  }
});

// Periodic polling for payment statuses
setInterval(pollScanned, 1000);

module.exports = router;
