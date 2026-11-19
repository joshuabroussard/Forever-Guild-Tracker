// Armory-style character details for the website, read live from Blizzard
// and cached so page views don't hammer the API. Only characters already on
// a tracked roster are looked up, so the cache stays small.
const TTL = 10 * 60_000;
const ICON_TTL = 24 * 60 * 60_000;
const MEDIA_HOST = 'https://render.worldofwarcraft.com/';

export class Armory {
  constructor(pool, { ttl = TTL, now = () => Date.now() } = {}) {
    this.pool = pool;
    this.ttl = ttl;
    this.now = now;
    this.cache = new Map();
    this.icons = new Map(); // itemId -> { at, url }
  }

  // Returns { found: true, ...details }, { found: false } when Blizzard has no
  // profile (under level 10 or never logged out), or { error } on API trouble.
  async character(region, locale, profilePath) {
    const key = `${region}:${profilePath}`;
    const hit = this.cache.get(key);
    if (hit && !hit.pending && this.now() - hit.at < this.ttl) return hit.value;
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
    const [equipment, media, stats] = await Promise.all([
      client.get(`${profilePath}/equipment`, 'profile').catch(() => null),
      client.get(`${profilePath}/character-media`, 'profile').catch(() => null),
      client.get(`${profilePath}/statistics`, 'profile').catch(() => null),
    ]);
    const details = parseCharacter(profile, equipment, media, stats);
    await this.addIcons(client, details.items);
    return { found: true, ...details };
  }

  // Item icons, looked up once a day per item, a few at a time.
  async addIcons(client, items) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const item = items[next++];
        if (!item.id) continue;
        const hit = this.icons.get(item.id);
        if (hit && this.now() - hit.at < ICON_TTL) {
          item.icon = hit.url;
          continue;
        }
        const url = await client.getItemIconUrl(item.id).catch(() => null);
        const safe = typeof url === 'string' && url.startsWith(MEDIA_HOST) ? url : null;
        this.icons.set(item.id, { at: this.now(), url: safe });
        item.icon = safe;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  }
}

const QUALITIES = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];

function color(c) {
  if (!c || ![c.r, c.g, c.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) return null;
  return `rgb(${c.r},${c.g},${c.b})`;
}

const str = (v) => (typeof v === 'string' && v.trim() ? v : null);

export function parseItem(i) {
  return {
    id: Number(i.item?.id) || null,
    slot: i.slot?.name || i.slot?.type || '',
    slotType: i.slot?.type || null,
    name: i.name || 'Unknown item',
    quality: QUALITIES.includes(i.quality?.type) ? i.quality.type : 'COMMON',
    itemLevel: Number(i.level?.value) || null,
    binding: str(i.binding?.name),
    inventoryType: str(i.inventory_type?.name),
    subclass: str(i.item_subclass?.name),
    armor: str(i.armor?.display?.display_string) || (i.armor?.value ? `${i.armor.value} Armor` : null),
    weapon: i.weapon
      ? {
          damage: str(i.weapon.damage?.display_string),
          speed: str(i.weapon.attack_speed?.display_string),
          dps: str(i.weapon.dps?.display_string),
        }
      : null,
    stats: (i.stats || []).map((s) => ({
      text: str(s.display?.display_string) || `${s.value > 0 ? '+' : ''}${s.value} ${s.type?.name || ''}`.trim(),
      color: color(s.display?.color),
      equip: !!s.is_equip_bonus,
    })),
    enchantments: (i.enchantments || []).map((e) => str(e.display_string)).filter(Boolean),
    spells: (i.spells || []).map((s) => str(s.description)).filter(Boolean),
    set: i.set
      ? {
          name: str(i.set.display_string) || str(i.set.item_set?.name),
          effects: (i.set.effects || []).map((e) => ({ text: str(e.display_string), active: !!e.is_active })).filter((e) => e.text),
        }
      : null,
    durability: str(i.durability?.display_string),
    requirement: str(i.requirements?.level?.display_string),
    description: str(i.description),
  };
}

// Character sheet numbers, grouped like the in-game panel. Only what Blizzard
// returns is kept.
export function parseStats(s) {
  if (!s || typeof s !== 'object') return [];
  const num = (v) => (typeof v === 'number' ? v : typeof v?.effective === 'number' ? v.effective : typeof v?.value === 'number' ? v.value : null);
  const pct = (v) => (num(v) == null ? null : `${num(v).toFixed(2)}%`);
  const whole = (v) => (num(v) == null ? null : Math.round(num(v)).toLocaleString('en-US'));
  const power = s.power_type?.name || 'Power';
  const groups = [
    ['General', [['Health', whole(s.health)], [power, whole(s.power)]]],
    ['Attributes', [['Strength', whole(s.strength)], ['Agility', whole(s.agility)], ['Stamina', whole(s.stamina)], ['Intellect', whole(s.intellect)], ['Spirit', whole(s.spirit)]]],
    ['Melee', [['Attack Power', whole(s.attack_power)], ['Damage per second', num(s.main_hand_dps) == null ? null : num(s.main_hand_dps).toFixed(1)], ['Crit chance', pct(s.melee_crit)], ['Hit', pct(s.melee_hit)]]],
    ['Ranged', [['Ranged Attack Power', whole(s.ranged_attack_power)], ['Crit chance', pct(s.ranged_crit)]]],
    ['Spell', [['Spell Power', whole(s.spell_power)], ['Crit chance', pct(s.spell_crit)], ['Hit', pct(s.spell_hit)], ['Mana regen', whole(s.mana_regen)]]],
    ['Defense', [['Armor', whole(s.armor)], ['Defense', whole(s.defense)], ['Dodge', pct(s.dodge)], ['Parry', pct(s.parry)], ['Block', pct(s.block)]]],
  ];
  return groups
    .map(([title, rows]) => ({ title, rows: rows.filter(([, v]) => v != null && v !== '0' && v !== '0.00%') }))
    .filter((g) => g.rows.length);
}

export function parseCharacter(profile = {}, equipment = null, media = null, stats = null) {
  const assets = media?.assets || [];
  const pick = (...keys) => {
    for (const k of keys) {
      const v = assets.find((a) => a.key === k)?.value;
      if (typeof v === 'string' && v.startsWith(MEDIA_HOST)) return v;
    }
    return null;
  };
  return {
    name: profile.name || null,
    level: Number(profile.level) || null,
    race: profile.race?.name || null,
    className: profile.character_class?.name || null,
    gender: profile.gender?.name || null,
    faction: profile.faction?.name || null,
    guildName: profile.guild?.name || null,
    title: profile.active_title?.display_string || null,
    lastLogin: Number(profile.last_login_timestamp) || null,
    itemLevel: Number(profile.equipped_item_level || profile.average_item_level) || null,
    image: pick('inset', 'avatar', 'main'),
    render: pick('main-raw', 'main', 'main-sd-raw'),
    items: (equipment?.equipped_items || []).map(parseItem),
    stats: parseStats(stats),
  };
}
