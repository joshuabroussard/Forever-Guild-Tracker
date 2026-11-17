import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000;

// Server-side sessions kept in memory; the cookie only holds a signed ID.
// A restart signs everyone out, which is fine for a small settings site.
export class Sessions {
  constructor(secret) {
    this.secret = secret;
    this.map = new Map();
  }

  sign(value) {
    return `${value}.${createHmac('sha256', this.secret).update(value).digest('base64url')}`;
  }

  unsign(signed) {
    if (typeof signed !== 'string') return null;
    const i = signed.lastIndexOf('.');
    if (i < 1) return null;
    const value = signed.slice(0, i);
    const a = Buffer.from(this.sign(value));
    const b = Buffer.from(signed);
    return a.length === b.length && timingSafeEqual(a, b) ? value : null;
  }

  create(data) {
    const id = randomBytes(24).toString('base64url');
    this.map.set(id, { ...data, csrf: randomBytes(24).toString('base64url'), expires: Date.now() + TTL_MS });
    this.sweep();
    return this.sign(id);
  }

  get(cookieValue) {
    const id = this.unsign(cookieValue);
    const s = id && this.map.get(id);
    if (!s) return null;
    if (s.expires < Date.now()) {
      this.map.delete(id);
      return null;
    }
    return s;
  }

  destroy(cookieValue) {
    const id = this.unsign(cookieValue);
    if (id) this.map.delete(id);
  }

  sweep() {
    const now = Date.now();
    for (const [id, s] of this.map) if (s.expires < now) this.map.delete(id);
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, secure = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}
