// Shows which of Blizzard's character endpoints answer for WoW Forever, with a
// short summary of each, so we can see what data is really there.
// Usage: npm run probe -- "Character Name" [region]
//        npm run probe -- --guild "Guild Name" [region]   (probes the top character)
import { loadEnv, slugify } from '../src/config.js';
import { BlizzardClient, parseRoster } from '../src/blizzard.js';

const args = process.argv.slice(2);
const byGuild = args[0] === '--guild';
const name = byGuild ? args[1] : args[0];
const region = (byGuild ? args[2] : args[1]) || 'us';
if (!name) {
  console.log('Usage: npm run probe -- "Character Name" [region]   or   npm run probe -- --guild "Guild Name" [region]');
  process.exit(1);
}
const env = loadEnv();
const client = new BlizzardClient({ clientId: env.blizzardClientId, clientSecret: env.blizzardClientSecret, region });

let path;
if (byGuild) {
  const { members } = parseRoster(await client.getRoster(slugify(name)));
  const top = [...members].sort((a, b) => b.level - a.level)[0];
  if (!top) throw new Error('Guild has no members');
  console.log(`Top character: ${top.name} (level ${top.level})`);
  path = top.profilePath;
} else {
  path = `/profile/wow/character/${encodeURIComponent(name.trim().toLowerCase().replace(/\s+/g, '-'))}`;
}

function summarize(v, depth = 0) {
  if (Array.isArray(v)) return `[${v.length}]${v.length && depth < 2 ? ' ' + summarize(v[0], depth + 1) : ''}`;
  if (v && typeof v === 'object') {
    if (depth >= 2) return '{…}';
    return '{ ' + Object.entries(v).filter(([k]) => k !== '_links').map(([k, x]) => `${k}: ${summarize(x, depth + 1)}`).join(', ') + ' }';
  }
  return JSON.stringify(v)?.slice(0, 40);
}

const subs = ['', '/encounters', '/encounters/dungeons', '/encounters/raids', '/statistics', '/achievements', '/achievements/statistics',
  '/professions', '/reputations', '/quests/completed', '/collections/mounts', '/collections/pets', '/titles', '/pvp-summary', '/specializations', '/equipment', '/character-media'];
for (const sub of subs) {
  try {
    const body = await client.get(path + sub, 'profile');
    console.log(`\nOK   ${sub || '(profile)'}\n     ${summarize(body).slice(0, 600)}`);
  } catch (e) {
    console.log(`\n--   ${sub || '(profile)'}: ${e.status === 404 ? 'not found' : e.message}`);
  }
}

// Guild-level extras.
if (byGuild) {
  for (const sub of ['', '/activity', '/achievements']) {
    try {
      const body = await client.get(`/data/wow/guild/${encodeURIComponent(slugify(name))}${sub}`, 'profile');
      console.log(`\nOK   guild${sub}\n     ${summarize(body).slice(0, 600)}`);
    } catch (e) {
      console.log(`\n--   guild${sub}: ${e.status === 404 ? 'not found' : e.message}`);
    }
  }
}
