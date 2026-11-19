// Armory-style character details for the website, read live from Blizzard
// and cached so page views don't hammer the API. Only characters already on
// a tracked roster are looked up, so the cache stays small.
const TTL = 10 * 60_000;
const MEDIA_HOST = 'https://render.worldofwarcraft.com/';

export class Armory {
  constructor(pool, { ttl = TTL, now = () => Date.now() } = {}) {
    this.pool = pool;
    this.ttl = ttl;
    this.now = now;
    this.cache = new Map();
  }

  // Returns { found: true, ...details }, { found: false } when Blizzard has no
  // profile (under level 10 or never logged out), or { error } on API trouble.
  async character(region, locale, profilePath) {
    const key = `${region}:${profilePath}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttl) return hit.value;
    if (hit?.pending) return hit.pending;
    const pending = this.load(region, locale, profilePath).then((value) => {
      this.cache.set(key, { at: this.now(), value });
      return value;
    });
    this.cache.set(key, { at: hit?.at ?? 0, value: hit?.value, pending });
    try {
      return await pending;
    } catch (e) {
      this.cache.delete(key);
      throw e;
    }
  }

  async load(region, locale, profilePath) {
    const client = this.pool.for(region, locale);
    let profile;
    try {
      profile = await client.get(profilePath, 'profile');
    } catch (e) {
      return e.status === 404 ? { found: false } : { error: e.message };
    }
    const [equipment, media] = await Promise.all([
      client.get(`${profilePath}/equipment`, 'profile').catch(() => null),
      client.get(`${profilePath}/character-media`, 'profile').catch(() => null),
    ]);
    return { found: true, ...parseCharacter(profile, equipment, media) };
  }
}

const QUALITIES = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];

export function parseCharacter(profile = {}, equipment = null, media = null) {
  const assets = media?.assets || [];
  const pick = (k) => assets.find((a) => a.key === k)?.value;
  const image = pick('inset') || pick('avatar') || pick('main');
  const items = (equipment?.equipped_items || []).map((i) => ({
    slot: i.slot?.name || i.slot?.type || '',
    name: i.name || 'Unknown item',
    quality: QUALITIES.includes(i.quality?.type) ? i.quality.type : 'COMMON',
    itemLevel: Number(i.level?.value) || null,
  }));
  return {
    name: profile.name || null,
    level: Number(profile.level) || null,
    race: profile.race?.name || null,
    className: profile.character_class?.name || null,
    faction: profile.faction?.name || null,
    guildName: profile.guild?.name || null,
    title: profile.active_title?.display_string || null,
    lastLogin: Number(profile.last_login_timestamp) || null,
    itemLevel: Number(profile.equipped_item_level || profile.average_item_level) || null,
    image: typeof image === 'string' && image.startsWith(MEDIA_HOST) ? image : null,
    items,
  };
}
