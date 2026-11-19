import { CLASSES } from './classes.js';

// Minimal client for Blizzard's WoW Forever API.
// Forever isn't in Blizzard's docs yet. The namespaces and routes below are the
// ones the community confirmed after launch (Nov 2026):
//   profile-forever-{region}  guild + character profiles (no realm in the path)
//   static-forever-{region}   classes, races
export class BlizzardClient {
  constructor({ clientId, clientSecret, region = 'us', locale = 'en_US', fetchImpl = globalThis.fetch }) {
    if (!clientId || !clientSecret) throw new Error('BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set in .env');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.region = region;
    this.locale = locale;
    this.fetch = fetchImpl;
    this.token = null;
    this.tokenExpires = 0;
    this.classNames = null;
  }

  get host() {
    return this.region === 'cn' ? 'https://gateway.battlenet.com.cn' : `https://${this.region}.api.blizzard.com`;
  }

  async getToken() {
    if (this.token && Date.now() < this.tokenExpires - 60_000) return this.token;
    const res = await this.fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Blizzard login failed (${res.status}). Check BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET.`);
    const body = await res.json();
    this.token = body.access_token;
    this.tokenExpires = Date.now() + body.expires_in * 1000;
    return this.token;
  }

  async get(path, namespace) {
    const url = `${this.host}${path}?namespace=${namespace}-forever-${this.region}&locale=${this.locale}`;
    const res = await this.fetch(url, { headers: { Authorization: `Bearer ${await this.getToken()}` } });
    if (res.status === 404) {
      const err = new Error(`Not found: ${path}`);
      err.status = 404;
      throw err;
    }
    if (!res.ok) throw new Error(`Blizzard API ${res.status} on ${path}`);
    return res.json();
  }

  async getRoster(guildSlug) {
    return this.get(`/data/wow/guild/${encodeURIComponent(guildSlug)}/roster`, 'profile');
  }

  // A character's own profile. Blizzard's guild roster can lag behind by hours,
  // while the character profile updates when the player logs out.
  async getCharacter(profilePath) {
    return this.get(profilePath, 'profile');
  }

  async getDungeons(profilePath) {
    return this.get(`${profilePath}/encounters/dungeons`, 'profile');
  }

  // URL of a class's or item's icon. Forever's media routes aren't confirmed,
  // so this falls back to Classic Era and then retail, which share icons.
  async getMediaIcon(kind, id) {
    for (const ns of [`static-forever-${this.region}`, `static-classic1x-${this.region}`, `static-${this.region}`]) {
      const url = `${this.host}/data/wow/media/${kind}/${encodeURIComponent(id)}?namespace=${ns}`;
      const res = await this.fetch(url, { headers: { Authorization: `Bearer ${await this.getToken()}` } });
      if (!res.ok) continue;
      const body = await res.json();
      const icon = (body.assets || []).find((a) => a.key === 'icon')?.value;
      if (icon) return icon;
    }
    return null;
  }

  getClassIconUrl(classId) {
    return this.getMediaIcon('playable-class', classId);
  }

  getItemIconUrl(itemId) {
    return this.getMediaIcon('item', itemId);
  }

  async getClassNames() {
    if (this.classNames) return this.classNames;
    try {
      const body = await this.get('/data/wow/playable-class/index', 'static');
      this.classNames = Object.fromEntries((body.classes || []).map((c) => [c.id, c.name]));
    } catch {
      this.classNames = {};
    }
    return this.classNames;
  }
}


// Turns Blizzard's roster response into plain member objects.
// Forever characters have a surname; the roster field name for it isn't
// documented, so a few likely spellings are checked.
export function parseRoster(body, classNames = {}) {
  const members = (body.members || []).map((m) => {
    const c = m.character || {};
    const surname = c.surname || c.last_name || c.family_name || '';
    const name = surname && !String(c.name).includes(' ') ? `${c.name} ${surname}` : String(c.name || 'Unknown');
    const classId = c.playable_class?.id;
    return {
      id: c.id ?? name,
      name,
      level: Number(c.level) || 0,
      classId,
      className: c.playable_class?.name || classNames[classId] || CLASSES[classId]?.name || 'Unknown',
      rank: m.rank ?? null,
      profilePath: characterPath(c, name),
    };
  });
  return { guildName: body.guild?.name || null, members };
}

// Path of a roster character's own profile. Uses the link Blizzard puts in the
// roster when there is one, otherwise the community-observed Forever format
// /profile/wow/character/{name}-{surname}, lowercase.
export function characterPath(c, fullName) {
  const href = c.key?.href;
  if (href) {
    try {
      const { pathname } = new URL(href);
      if (pathname.startsWith('/profile/wow/character/')) return pathname;
    } catch { /* fall through */ }
  }
  const slug = String(fullName || c.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  return slug ? `/profile/wow/character/${encodeURIComponent(slug)}` : null;
}
