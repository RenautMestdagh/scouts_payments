const express = require('express');
const router = express.Router();
const axios = require("axios");
const jose = require('jose');
const socketapi = require("../utils/socketapi");

const toScan = new Map(); // key = paymentID, value = timestamp
const PAYCONIQ_BASE_URL = 'https://merchant.api.bancontact.net/v3/payments';
const PAYCONIQ_CERT_URL = 'https://jwks.bancontact.net/';

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
                paymentIdsToRemove.push(paymentId);
            } else if (isExpired(paymentId)) {
                paymentIdsToRemove.push(paymentId);
            }
        } catch (error) {
            console.error(`Error polling payment ${paymentId}:`, error.message);
        }
    }

    paymentIdsToRemove.forEach((id) => toScan.delete(id));
};

setInterval(pollScanned, 1000);

let JWKS;
const initializeJWKS = async () => {
    JWKS = jose.createRemoteJWKSet(new URL(PAYCONIQ_CERT_URL), { cacheMaxAge: 12 * 60 * 60 * 1000 });
    return true;
};

initializeJWKS();

const verifyJWTWithRetry = async (jwt, options, maxRetries = 1) => {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await jose.jwtVerify(jwt, JWKS, options);
        } catch (error) {
            lastError = error;

            console.log(`JWT verification attempt ${attempt + 1} failed, refreshing JWKS cache...`);
            await initializeJWKS();
        }
    }

    throw lastError; // Throw the last error after all retries exhausted
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
        console.error("Error creating payment:", error.response?.data?.message || error);
        res.status(500).json({ error: "Failed to create payment." });
    }
});

router.post('/callback', async (req, res) => {
    if (req.get('User-Agent') !== 'Payconiq Payments/v3') {
        return res.sendStatus(403);
    }

    res.sendStatus(200);

    const { paymentId, status } = req.body;

    try {
        // Verify the JWT signature before processing
        const signatureHeader = req.headers['signature'];
        if (!signatureHeader) {
            throw new Error('Missing signature header');
        }

        // Split the detached JWS signature
        const signatureParts = signatureHeader.split('.');
        if (signatureParts.length !== 3 || signatureParts[1] !== '') {
            throw new Error('Invalid detached JWS format - expected header..signature');
        }

        const encodedHeader = signatureParts[0];
        const encodedSignature = signatureParts[2];

        // Create the complete JWT: header.payload.signature
        const payload = JSON.stringify(req.body);
        const encodedPayload = jose.base64url.encode(payload);
        const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

        // JWT verification options with critical headers
        const decodedHeader = JSON.parse(jose.base64url.decode(encodedHeader));
        const options = {
            // Whitelist the critical headers so 'jose' doesn't reject the token
            crit: Object.fromEntries(decodedHeader.crit.map(h => [h, true])),
            // 'typ' is a standard header, usually checked by the library if present
            typ: decodedHeader.typ,
            // Security: Constrain the allowed signing algorithm
            algorithms: [decodedHeader.alg],
        };

        // Verify the JWT using the cached JWKS with retry logic
        // This validates the signature and confirms the custom headers were present in the signed part
        const { payload: verifiedPayload, protectedHeader } = await verifyJWTWithRetry(jwt, options, 1);

        // =================================================================
        // MANUAL CRITICAL HEADER VALIDATION BLOCK
        // The signature is verified, now check the values of the custom headers
        const expectedIssuer = 'Payconiq';
        const expectedCallbackUrl = `https://${req.headers.host}/payment/callback`; // Should match the URL sent in the original payment request

        // 1. Check Issuer (https://payconiq.com/iss)
        if (protectedHeader['https://payconiq.com/iss'] !== expectedIssuer) {
            throw new Error(`Issuer mismatch: Expected ${expectedIssuer}, got ${protectedHeader['https://payconiq.com/iss']}`);
        }

        // 2. Check Callback Path (https://payconiq.com/path)
        if (protectedHeader['https://payconiq.com/path'] !== expectedCallbackUrl) {
            // This is a crucial security check to prevent replay attacks on a different endpoint
            throw new Error(`Callback URL mismatch: Expected ${expectedCallbackUrl}, got ${protectedHeader['https://payconiq.com/path']}`);
        }

        // 3. Check Subject (https://payconiq.com/sub) - Optional: Verify against a known Payconiq identifier if available
        if (!protectedHeader['https://payconiq.com/sub']) {
            throw new Error('Missing subject (https://payconiq.com/sub) in protected header');
        }

        // 4. Check JTI (https://payconiq.com/jti) - Optional: Implement replay protection if possible
        if (!protectedHeader['https://payconiq.com/jti']) {
            console.warn('Missing JTI (https://payconiq.com/jti) - Recommended for replay protection.');
        }

        // 5. Check IAT (https://payconiq.com/iat) - Optional: Check for freshness
        // This check is typically only for the presence, as the timestamp itself is not always verified.
        if (!protectedHeader['https://payconiq.com/iat']) {
            console.warn('Missing IAT (https://payconiq.com/iat) in protected header.');
        }

        // =================================================================

        // Additional verification: check that the payload matches the request body
        // The `jose` library will decode the payload and return it. This check ensures the payload
        // that was signed is exactly what was received in the request body.
        if (JSON.stringify(verifiedPayload) !== JSON.stringify(req.body)) {
            throw new Error('Payload mismatch between JWT and request body');
        }

        // Process payment status
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
        socketapi.io.emit('verificationFailed', paymentId || null);
    } finally {
        toScan.delete(paymentId);
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

module.exports = router;