const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Generate a valid P-256 VAPID keypair in raw uncompressed base64url and private PEM formats
function generateVapidKeys() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    // Extract uncompressed 65-byte EC public key (X9.62 uncompressed format)
    const rawPublicKey = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
    const publicKeyBase64Url = rawPublicKey.subarray(rawPublicKey.length - 65).toString('base64url');
    
    return {
        publicKey: publicKeyBase64Url,
        privateKeyPem: privateKey
    };
}

// Generate JWT VAPID Authorization token (ES256)
function generateVapidJwt(endpoint, privateKeyPem) {
    const parsedUrl = new URL(endpoint);
    const audience = `${parsedUrl.protocol}//${parsedUrl.host}`;
    
    const header = { alg: 'ES256', typ: 'JWT' };
    const payload = {
        aud: audience,
        sub: 'mailto:liel.be.tz24@gmail.com',
        exp: Math.floor(Date.now() / 1000) + 12 * 3600 // 12 hours expiry
    };
    
    const tokenInput = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    const signature = crypto.sign('sha256', Buffer.from(tokenInput), privateKeyPem);
    return `${tokenInput}.${signature.toString('base64url')}`;
}

// HKDF-SHA256 Key Derivation helper using Node's native crypto.hkdfSync
function hkdf(salt, ikm, info, length) {
    return crypto.hkdfSync('sha256', ikm, salt, info, length);
}

// Encrypt payload according to RFC 8291 (Message Encryption for Web Push) & RFC 8188 (Encrypted Content Encoding)
function encryptPayload(subscription, payloadString) {
    const clientPublicKey = Buffer.from(subscription.keys.p256dh, 'base64url');
    const clientAuth = Buffer.from(subscription.keys.auth, 'base64url');
    
    // 1. Generate local ephemeral keys for key exchange
    const ecdh = crypto.createECDH('prime256v1');
    const serverPublicKey = ecdh.generateKeys();
    const sharedSecret = ecdh.computeSecret(clientPublicKey);
    
    // 2. Generate random 16-byte salt
    const salt = crypto.randomBytes(16);
    
    // 3. HKDF for Pseudo-Random Key (PRK) using "WebPush: info" label (RFC 8291)
    const prkInfo = Buffer.concat([
        Buffer.from('WebPush: info\0', 'utf8'),
        clientPublicKey,
        serverPublicKey
    ]);
    const prk = hkdf(clientAuth, sharedSecret, prkInfo, 32);
    
    // 4. Derive Content Encryption Key (CEK) and Nonce
    const cek = hkdf(salt, prk, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
    const nonce = hkdf(salt, prk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
    
    // 5. Pad and Frame payload (RFC 8188 aes128gcm framing)
    const payloadBuffer = Buffer.from(payloadString, 'utf8');
    const recordPaddingLength = 0; // Zero padding bytes
    
    // Plaintext format: payload + padding delimiter (0x02 is the last/only record delimiter)
    const plainText = Buffer.concat([
        payloadBuffer,
        Buffer.from([0x02])
    ]);
    
    const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const encrypted = Buffer.concat([cipher.update(plainText), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    const cipherText = Buffer.concat([encrypted, tag]);
    
    return {
        salt: salt.toString('base64url'),
        serverPublicKey: serverPublicKey.toString('base64url'),
        cipherText: cipherText
    };
}

// Send Web Push notification (RFC 8292 / RFC 8188)
async function sendNotification(vapidKeys, subscription, payloadString) {
    const endpoint = subscription.endpoint;
    const jwt = generateVapidJwt(endpoint, vapidKeys.privateKeyPem);
    
    const headers = {
        'TTL': '86400',
        'Urgency': 'high',
        'Authorization': `vapid t=${jwt},k=${vapidKeys.publicKey}`
    };
    
    let body = null;
    if (payloadString) {
        try {
            // Encrypt payload according to RFC 8291
            const enc = encryptPayload(subscription, payloadString);
            
            // Build RFC 8291 headers and body
            headers['Content-Encoding'] = 'aes128gcm';
            headers['Content-Type'] = 'application/octet-stream';
            
            // The body contains a specific RFC 8188 header structure:
            // - 16 bytes: salt
            // - 4 bytes: record size (usually 4096 = 0x00001000)
            // - 1 byte: public key length
            // - 65 bytes: server public key
            // - Remaining: encrypted ciphertext + tag
            const headerBuffer = Buffer.alloc(16 + 4 + 1 + 65);
            Buffer.from(enc.salt, 'base64url').copy(headerBuffer, 0);
            headerBuffer.writeUInt32BE(4096, 16);
            headerBuffer.writeUInt8(65, 20);
            Buffer.from(enc.serverPublicKey, 'base64url').copy(headerBuffer, 21);
            
            body = Buffer.concat([headerBuffer, enc.cipherText]);
        } catch (e) {
            console.error('[Web Push Encryption] Failed to encrypt payload, falling back to payload-free:', e);
            body = null; 
        }
    }
    
    const parsedUrl = new URL(endpoint);
    const options = {
        method: 'POST',
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: headers
    };
    
    return new Promise((resolve) => {
        const client = parsedUrl.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => resBody += chunk);
            res.on('end', () => {
                console.log(`[Push Service] Push request status: ${res.statusCode} for endpoint: ${endpoint.substring(0, 45)}...`);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, statusCode: res.statusCode });
                } else {
                    resolve({ success: false, statusCode: res.statusCode, error: resBody });
                }
            });
        });
        
        req.on('error', (err) => {
            console.error('[Push Service] Network request error:', err);
            resolve({ success: false, error: err.message });
        });
        
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

module.exports = {
    generateVapidKeys,
    sendNotification
};
