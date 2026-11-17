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

const FALLBACK_CLASSES = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
  7: 'Shaman', 8: 'Mage', 9: 'Warlock', 11: 'Druid',
};

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
      className: c.playable_class?.name || classNames[classId] || FALLBACK_CLASSES[classId] || 'Unknown',
      rank: m.rank ?? null,
    };
  });
  return { guildName: body.guild?.name || null, members };
}
