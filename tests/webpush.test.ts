import { createECDH, randomBytes, webcrypto } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// Mozilla's reference implementation of RFC 8188, used here only to check our output.
import ece from 'http_ece';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization } from '../supabase/functions/_shared/webpush.ts';

describe('encryptPayload', () => {
  it('produces a body the browser side can decrypt', async () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = randomBytes(16);
    const message = JSON.stringify({ title: 'Đã chi 80% hạn mức', body: '12.000.000 / 15.000.000 ₫' });

    const body = await encryptPayload(message, {
      p256dh: b64urlEncode(browser.getPublicKey()),
      auth: b64urlEncode(auth),
    });

    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: browser, authSecret: auth });
    expect(plain.toString('utf8')).toBe(message);
  });
});

describe('vapidAuthorization', () => {
  it('signs an ES256 JWT for the endpoint origin that verifies with the public key', async () => {
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
    const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
    const vapid = { publicKey: b64urlEncode(raw), privateKey: jwk.d!, subject: 'https://quanly-chitieu.pages.dev' };

    const header = await vapidAuthorization('https://web.push.apple.com/abc', vapid, Date.parse('2026-10-29T00:00:00Z'));
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m[4]).toBe(vapid.publicKey);
    const claims = JSON.parse(Buffer.from(b64urlDecode(m[2])).toString());
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com', sub: vapid.subject });
    const ok = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(m[3]),
      new TextEncoder().encode(`${m[1]}.${m[2]}`),
    );
    expect(ok).toBe(true);
  });
});
