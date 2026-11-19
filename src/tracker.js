import { BlizzardClient, parseRoster } from './blizzard.js';
import { updateBaseline } from './state.js';
import { buildEmbed } from './embed.js';
import { effectiveSlug } from './config.js';
import { guildUrl } from './links.js';
import { fetchDungeons } from './dungeons.js';

const DUNGEON_EVERY_MS = 60 * 60_000;

// One Blizzard client per region, shared by every server.
export class BlizzardPool {
  constructor({ clientId, clientSecret, fetchImpl }) {
    Object.assign(this, { clientId, clientSecret, fetchImpl });
    this.clients = new Map();
  }
  for(region, locale = 'en_US') {
    const key = `${region}:${locale}`;
    if (!this.clients.has(key)) {
      this.clients.set(key, new BlizzardClient({ clientId: this.clientId, clientSecret: this.clientSecret, region, locale, fetchImpl: this.fetchImpl }));
    }
    return this.clients.get(key);
  }
}

export function describeError(e, slug) {
  return e.status === 404 ? `guild "${slug}" not found, check the name and region on the website` : e.message;
}

// Looks a guild up once, for the website's "Check guild" button.
export async function checkGuild(pool, { guildName, guildSlug, region, locale }) {
  const slug = guildSlug || effectiveSlug({ guildName });
  const client = pool.for(region, locale);
  try {
    const { guildName: found, members } = parseRoster(await client.getRoster(slug), await client.getClassNames());
    return { ok: true, slug, name: found || guildName, count: members.length };
  } catch (e) {
    return { ok: false, slug, error: describeError(e, slug) };
  }
}

// Fills in each member's level from their own character profile, a few at a
// time. The roster is only trusted for who is in the guild: its levels lag.
// If a profile can't be read (under level 10, never logged out, or an API
// error), the roster level is kept. Levels only go up, so the higher of the
// two wins, which also covers a profile that's older than the roster.
export async function withProfileLevels(client, members, { concurrency = 4 } = {}) {
  const out = new Array(members.length);
  let next = 0;
  async function worker() {
    while (next < members.length) {
      const i = next++;
      const m = members[i];
      let level = m.level;
      if (m.profilePath) {
        try {
          const profileLevel = Number((await client.getCharacter(m.profilePath)).level);
          if (Number.isFinite(profileLevel) && profileLevel > level) level = profileLevel;
        } catch { /* keep the roster level */ }
      }
      out[i] = { ...m, level };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, members.length) }, worker));
  return out;
}

// Pulls the roster for one server's WoW guild and builds its embed.
// Returns the embed and the tracking fields to save. On failure it keeps the
// last good data and puts the reason in the footer.
export async function refreshServer(pool, server, { refreshMinutes, emojis = {}, now = new Date(), publicUrl = null }) {
  const slug = effectiveSlug(server);
  const client = pool.for(server.region, server.locale);
  let members = server.lastMembers || [];
  let displayName = server.wowGuildDisplayName || server.guildName;
  let tracking = { baseline: server.baseline, lastLevels: server.lastLevels };
  let error = null;
  let dungeonPatch = {};
  try {
    const parsed = parseRoster(await client.getRoster(slug), await client.getClassNames());
    members = await withProfileLevels(client, parsed.members);
    displayName = parsed.guildName || displayName;
    tracking = updateBaseline(tracking, members, server.timezone, now);
    // Dungeon clears change slowly, so they're read about once an hour.
    if (!server.dungeonsAt || now - new Date(server.dungeonsAt) >= DUNGEON_EVERY_MS) {
      dungeonPatch = { dungeons: await fetchDungeons(client, members, server.dungeons || {}), dungeonsAt: now.toISOString() };
    }
  } catch (e) {
    error = describeError(e, slug);
  }
  const embed = buildEmbed({
    members,
    baseline: tracking.baseline,
    config: { ...server, refreshMinutes },
    guildName: displayName,
    emojis,
    now,
    error,
    link: guildUrl(publicUrl, server),
  });
  return {
    embed,
    error,
    patch: error
      ? { lastError: error, lastAttemptAt: now.toISOString() }
      : { ...tracking, ...dungeonPatch, lastMembers: members, wowGuildDisplayName: displayName, lastError: null, lastRefreshAt: now.toISOString() },
  };
}
