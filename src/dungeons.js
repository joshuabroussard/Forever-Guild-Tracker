// Dungeon first clears: who has finished each dungeon, and who still needs it.
//
// Forever's /encounters/dungeons answers with nothing, so clears come from
// the achievement statistics instead: under "Dungeons & Raids" > "Boss
// Kills" Blizzard counts kills of each dungeon's end boss, named like
// "Edwin VanCleef Kills (Deadmines)". A kill there is a clear. Only bosses a
// character has killed are listed; the full dungeon list comes from
// DUNGEONS below. The older encounters shape is still read
// in case Blizzard starts filling it in.

// Every dungeon in WoW Forever, in level order, with its suggested level
// range. The nine Forever-only dungeons use Blizzard's own ranges (news post
// "Explore the New Dungeons of World of Warcraft: Forever"); the Classic ones
// use Warcraft Tavern's Forever dungeon guide. `aliases` are other names the
// boss kill statistics might use for the same place.
export const DUNGEONS = [
  { name: 'Ragefire Chasm', levels: [13, 18] },
  { name: 'Hall of Thanes', levels: [13, 18], forever: true },
  { name: 'Ruins of Lordaeron', levels: [15, 20], forever: true },
  { name: 'Wailing Caverns', levels: [15, 24] },
  { name: 'Deadmines', levels: [17, 26], aliases: ['the deadmines'] },
  { name: 'Shadowfang Keep', levels: [20, 30] },
  { name: 'Blackfathom Deeps', levels: [24, 32] },
  { name: 'The Stockade', levels: [24, 32], aliases: ['stockade', 'stormwind stockade', 'the stockades'] },
  { name: 'Excavation Site', levels: [24, 29], forever: true, aliases: ['excavation site wetlands'] },
  { name: 'City of Dalaran', levels: [28, 33], forever: true, aliases: ['dalaran'] },
  { name: 'Razorfen Kraul', levels: [29, 38] },
  { name: 'Gnomeregan', levels: [29, 38] },
  { name: 'Scarlet Monastery Graveyard', short: 'SM Graveyard', levels: [30, 38], bosses: ['bloodmage thalnos'] },
  { name: 'Scarlet Monastery Library', short: 'SM Library', levels: [33, 41], bosses: ['arcanist doan'] },
  { name: 'The Drowned City', levels: [35, 40], forever: true, aliases: ['drowned city'] },
  { name: 'Scarlet Monastery Armory', short: 'SM Armory', levels: [36, 44], bosses: ['herod'] },
  { name: 'Razorfen Downs', levels: [37, 46] },
  { name: 'Scarlet Monastery Cathedral', short: 'SM Cathedral', levels: [38, 46], bosses: ['high inquisitor whitemane', 'scarlet commander mograine'] },
  { name: "Krol'dok Stronghold", levels: [40, 45], forever: true },
  { name: 'Uldaman', levels: [41, 51] },
  { name: "Zul'Farrak", levels: [44, 54] },
  { name: 'Maraudon', levels: [46, 55] },
  { name: 'Alcaz Prison', levels: [48, 53], forever: true, aliases: ['alcaz island prison', 'alcaz island'] },
  { name: 'Sunken Temple', levels: [50, 60], aliases: ["temple of atal'hakkar", 'the temple of atal hakkar'] },
  { name: 'Blackrock Depths', levels: [52, 60] },
  { name: 'Dire Maul East', levels: [54, 60], bosses: ['alzzin the wildshaper'] },
  { name: 'Lower Blackrock Spire', short: 'Lower BRS', levels: [55, 60], bosses: ['overlord wyrmthalak'] },
  { name: 'Blackmaw Hold', levels: [55, 60], forever: true },
  { name: 'Dire Maul West', levels: [56, 60], bosses: ['prince tortheldrin', "immol'thar"] },
  { name: 'Dire Maul North', levels: [56, 60], bosses: ['king gordok'] },
  { name: "Shaper's Terrace", levels: [58, 60], forever: true, aliases: ['shapers terrace'] },
  { name: 'Stratholme Main Gate', short: 'Strat Main Gate', levels: [58, 60], bosses: ['balnazzar'] },
  { name: 'Stratholme Service Gate', short: 'Strat Service Gate', levels: [58, 60], bosses: ['baron rivendare'] },
  { name: 'Scholomance', levels: [58, 60] },
  { name: 'Upper Blackrock Spire', short: 'Upper BRS', levels: [59, 60], bosses: ['general drakkisath'] },
];

const norm = (s) => String(s || '').toLowerCase().replace(/[:\-–()]/g, ' ').replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
const BY_NAME = new Map();
const BY_BOSS = new Map();
for (const d of DUNGEONS) {
  d.id = norm(d.name);
  for (const n of [d.name, ...(d.aliases || [])]) {
    BY_NAME.set(norm(n), d);
    BY_NAME.set(norm(n).replace(/^the /, ''), d);
  }
  for (const b of d.bosses || []) BY_BOSS.set(norm(b), d);
}

// The list entry for a dungeon (or boss) name from Blizzard, if known.
export function findDungeon(name, boss) {
  return BY_BOSS.get(norm(boss)) || BY_NAME.get(norm(name)) || BY_NAME.get(norm(name).replace(/^the /, '')) || null;
}

export function dungeonMinLevel(name) {
  return findDungeon(name)?.levels[0] ?? null;
}

// { [instanceId]: { name, status: 'done' | 'partial', clears } }
// Retail nests dungeons as expansions > instances > modes > progress >
// encounters. Forever's shape isn't documented, so this walks the whole
// response and takes anything that looks like a dungeon entry: an object
// naming an instance (or dungeon) with modes, progress or boss encounters.
export function parseDungeons(body) {
  if (Array.isArray(body?.categories)) return parseBossKills(body);
  const out = {};
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) return node.forEach(walk);
    const inst = node.instance || node.dungeon;
    if (inst && typeof inst === 'object' && (node.modes || node.progress || node.encounters || node.status)) {
      addInstance(out, inst, node);
      return;
    }
    for (const [k, v] of Object.entries(node)) if (k !== '_links' && k !== 'character') walk(v);
  };
  walk(body);
  return out;
}

const BOSS_KILL = /^(.+?)\s+kills\s*\((.+)\)\s*$/i;

// From achievement statistics: { [dungeon name]: { name, status: 'done', clears } }
// where clears is the end boss's kill count (the most-killed boss when a
// dungeon lists more than one).
export function parseBossKills(body) {
  const out = {};
  const walk = (cats, inDungeons) => {
    for (const c of cats || []) {
      const here = inDungeons || /dungeon/i.test(c.name || '');
      if (here) {
        for (const st of c.statistics || []) {
          const m = BOSS_KILL.exec(st.name || '');
          const n = Number(st.quantity) || 0;
          if (!m || n <= 0) continue;
          const known = findDungeon(m[2], m[1]);
          const name = known?.name || m[2].trim();
          const id = known?.id || norm(name);
          out[id] = { name, status: 'done', clears: Math.max(out[id]?.clears || 0, n) };
        }
      }
      walk(c.sub_categories, here);
    }
  };
  walk(body.categories, false);
  return out;
}

function addInstance(out, inst, node) {
  const id = inst.id ?? inst.name;
  if (id == null) return;
  let done = false;
  let partial = false;
  let clears = 0;
  for (const mode of node.modes || [node]) {
    const p = mode.progress || mode;
    const bosses = p.encounters || mode.encounters || [];
    const kills = bosses.map((b) => Number(b.completed_count ?? b.count) || 0);
    const total = Number(p.total_count) || bosses.length;
    const completed = Number(p.completed_count ?? kills.filter((n) => n > 0).length) || 0;
    const complete = mode.status?.type === 'COMPLETE' || (total > 0 && completed >= total);
    if (complete) {
      done = true;
      const counts = kills.filter((n) => n > 0);
      clears += counts.length ? Math.min(...counts) : 1;
    } else if (completed > 0 || kills.some((n) => n > 0)) {
      partial = true;
    }
  }
  if (done || partial) {
    const prev = out[id];
    out[id] = {
      name: inst.name || prev?.name || String(id),
      status: done || prev?.status === 'done' ? 'done' : 'partial',
      clears: (prev?.clears || 0) + clears,
    };
  }
}

// Looks up dungeon progress for characters level 10+ (Blizzard has no profile
// below that), a few at a time. Returns { dungeons, status } where status
// says, per character, whether Blizzard had data ('ok'), had nothing for them
// ('notfound'), answered with nothing we could read ('empty') or failed
// ('error', last known data kept). A short summary goes to the log.
export async function fetchDungeons(client, members, previous = {}, { concurrency = 3, log = console.log } = {}) {
  const dungeons = {};
  const status = {};
  let shapeLogged = false;
  const todo = members.filter((m) => m.profilePath && m.level >= 10);
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const m = todo[next++];
      try {
        const body = await client.getDungeons(m.profilePath);
        dungeons[m.id] = parseDungeons(body);
        status[m.id] = Object.keys(dungeons[m.id]).length || Array.isArray(body?.categories) ? 'ok' : 'empty';
        if (status[m.id] === 'empty' && !shapeLogged && body && Object.keys(body).some((k) => !['_links', 'character'].includes(k))) {
          shapeLogged = true;
          log(`Dungeons: couldn't read the answer for ${m.name}; it starts ${JSON.stringify(body).slice(0, 400)}`);
        }
      } catch (e) {
        if (e.status === 404) {
          dungeons[m.id] = {};
          status[m.id] = 'notfound';
        } else {
          if (previous[m.id]) dungeons[m.id] = previous[m.id];
          status[m.id] = 'error';
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  const counts = Object.values(status).reduce((c, s) => ({ ...c, [s]: (c[s] || 0) + 1 }), {});
  log(`Dungeons: checked ${todo.length} characters: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}.`);
  return { dungeons, status };
}

// Per dungeon: who has cleared it, who got partway, and who hasn't yet.
// Covers every dungeon in DUNGEONS plus any other the statistics name, in
// level order. Everyone in `members` is listed, whatever their level;
// characters Blizzard has no dungeon data for count as not done yet.
export function dungeonBoard(members, byMember = {}) {
  // Line stored entries up with the list (older data may be keyed by an
  // instance id or a slightly different name).
  const extra = new Map();
  const mine = {};
  for (const [mid, per] of Object.entries(byMember)) {
    mine[mid] = {};
    for (const [id, d] of Object.entries(per || {})) {
      const key = (DUNGEONS.find((x) => x.id === id) || findDungeon(d.name))?.id || id;
      if (!DUNGEONS.some((x) => x.id === key) && !extra.has(key)) extra.set(key, d.name);
      const prev = mine[mid][key];
      mine[mid][key] = prev?.status === 'done' && d.status !== 'done' ? prev : d;
    }
  }
  const list = [
    ...DUNGEONS.map((d) => ({ id: d.id, name: d.name, short: d.short, levels: d.levels, forever: !!d.forever })),
    ...[...extra.entries()].map(([id, name]) => ({ id, name, levels: null, forever: false })),
  ];
  const byLevel = (a, b) => b.level - a.level || a.name.localeCompare(b.name);
  return list.map(({ id, name, short, levels, forever }) => {
    const done = [];
    const partial = [];
    const needs = [];
    for (const m of members) {
      const d = mine[m.id]?.[id];
      if (d?.status === 'done') done.push({ ...m, clears: d.clears });
      else (d?.status === 'partial' ? partial : needs).push(m);
    }
    return { id, name, short: short || name, levels, minLevel: levels?.[0] ?? null, forever, done: done.sort(byLevel), partial: partial.sort(byLevel), needs: needs.sort(byLevel) };
  });
}
