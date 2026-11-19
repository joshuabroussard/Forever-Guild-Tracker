import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SECTIONS } from './sections/index.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REGIONS = ['us', 'eu', 'kr', 'tw'];

// App-wide settings, all from .env.
export function loadEnv(env = process.env) {
  const required = [
    'DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET',
    'BLIZZARD_CLIENT_ID', 'BLIZZARD_CLIENT_SECRET', 'SESSION_SECRET', 'PUBLIC_URL',
  ];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in .env: ${missing.join(', ')}`);
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  return {
    discordToken: env.DISCORD_TOKEN,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    blizzardClientId: env.BLIZZARD_CLIENT_ID,
    blizzardClientSecret: env.BLIZZARD_CLIENT_SECRET,
    sessionSecret: env.SESSION_SECRET,
    publicUrl: env.PUBLIC_URL.replace(/\/$/, ''),
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT) || 3000,
    refreshMinutes: Math.max(5, Number(env.REFRESH_MINUTES) || 15),
    dataFile: env.DATA_FILE || join(ROOT, 'data', 'servers.json'),
  };
}

// Defaults for one Discord server's settings.
export const DEFAULT_SERVER = {
  enabled: false,
  guildName: '',
  guildSlug: '',
  region: 'us',
  locale: 'en_US',
  timezone: 'America/Chicago',
  channelId: null,
  color: '#3b82f6',
  sections: ['summary', 'leveling'],
  leveling: { maxLevel: 60, top: 25 },
  publicPage: true,
};

// Blizzard hasn't documented how Forever guild slugs are built. This guess
// (lowercase, apostrophes dropped, spaces to hyphens) matches what the
// community has found; the website lets you override it.
export function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/\s+/g, '-');
}

function validTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function int(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// Turns a submitted settings form into a clean server config, or returns
// errors. `channels` is the list of channel IDs the bot can post in.
export function normalizeServerForm(form, channels = []) {
  const errors = [];
  const guildName = String(form.guildName || '').trim().slice(0, 64);
  if (!guildName) errors.push('Enter your WoW guild name.');
  const region = String(form.region || '').toLowerCase();
  if (!REGIONS.includes(region)) errors.push('Pick a region.');
  const guildSlug = form.guildSlug ? slugify(String(form.guildSlug).slice(0, 64)) : '';
  if (guildSlug && !/^[\p{L}\p{N}-]+$/u.test(guildSlug)) errors.push('The guild slug can only have letters, numbers and hyphens.');
  const timezone = String(form.timezone || DEFAULT_SERVER.timezone).trim();
  if (!validTimezone(timezone)) errors.push('That time zone isn\'t recognised. Try one like America/Chicago.');
  const channelId = String(form.channelId || '');
  if (!channels.includes(channelId)) errors.push('Pick a channel the bot can post in.');
  const color = /^#[0-9a-f]{6}$/i.test(form.color || '') ? form.color : DEFAULT_SERVER.color;
  const picked = [].concat(form.sections || []);
  const sections = Object.keys(SECTIONS).filter((id) => picked.includes(id));
  if (!sections.length) errors.push('Pick at least one thing to show.');
  const leveling = { ...DEFAULT_SERVER.leveling, top: int(form.top, 1, 50, 25) };
  return {
    errors,
    value: {
      enabled: form.enabled === 'on' || form.enabled === true,
      publicPage: form.publicPage === 'on' || form.publicPage === true,
      guildName, guildSlug, region, timezone, channelId, color, sections, leveling,
      locale: DEFAULT_SERVER.locale,
    },
  };
}

export function effectiveSlug(server) {
  return server.guildSlug || slugify(server.guildName);
}
