import { BlizzardClient, parseRoster } from './blizzard.js';
import { updateBaseline } from './state.js';
import { buildEmbed } from './embed.js';
import { effectiveSlug } from './config.js';

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

// Pulls the roster for one server's WoW guild and builds its embed.
// Returns the embed and the tracking fields to save. On failure it keeps the
// last good data and puts the reason in the footer.
export async function refreshServer(pool, server, { refreshMinutes, emojis = {}, now = new Date() }) {
  const slug = effectiveSlug(server);
  const client = pool.for(server.region, server.locale);
  let members = server.lastMembers || [];
  let displayName = server.wowGuildDisplayName || server.guildName;
  let tracking = { baseline: server.baseline, lastLevels: server.lastLevels };
  let error = null;
  try {
    const parsed = parseRoster(await client.getRoster(slug), await client.getClassNames());
    members = parsed.members;
    displayName = parsed.guildName || displayName;
    tracking = updateBaseline(tracking, members, server.timezone, now);
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
  });
  return {
    embed,
    error,
    patch: error
      ? { lastError: error, lastAttemptAt: now.toISOString() }
      : { ...tracking, lastMembers: members, wowGuildDisplayName: displayName, lastError: null, lastRefreshAt: now.toISOString() },
  };
}
