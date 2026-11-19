// Dungeon first clears: who has finished each dungeon, and who still needs it.
//
// Forever's /encounters/dungeons answers with nothing, so clears come from
// the achievement statistics instead: under "Dungeons & Raids" > "Boss
// Kills" Blizzard counts kills of each dungeon's end boss, named like
// "Edwin VanCleef Kills (Deadmines)". A kill there is a clear. Only bosses a
// character has killed are listed, so the dungeon list is every dungeon
// anyone in the guild has cleared. The older encounters shape is still read
// in case Blizzard starts filling it in.

// Lowest level to enter, from Classic. Used to hide characters who are too
// low to need a dungeon yet. Forever may have moved these; unknown names show
// for everyone.
const MIN_LEVELS = {
  'ragefire chasm': 13, 'wailing caverns': 17, deadmines: 17, 'shadowfang keep': 22,
  'blackfathom deeps': 24, stockade: 24, 'stormwind stockade': 24, gnomeregan: 29, 'razorfen kraul': 29,
  'scarlet monastery': 26, 'scarlet monastery graveyard': 26, 'scarlet monastery library': 29,
  'scarlet monastery armory': 32, 'scarlet monastery cathedral': 35, 'razorfen downs': 37, uldaman: 41,
  "zul'farrak": 44, maraudon: 46, 'sunken temple': 50, 'temple of atal\'hakkar': 50, 'blackrock depths': 52,
  'lower blackrock spire': 55, 'upper blackrock spire': 55, 'blackrock spire': 55, 'dire maul': 55,
  scholomance: 58, stratholme: 58,
};

export function dungeonMinLevel(name) {
  const key = String(name || '').toLowerCase().replace(/^the\s+/, '').replace(/[:\-–]/g, ' ').replace(/\s+/g, ' ').trim();
  return MIN_LEVELS[key] ?? null;
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
          const name = m[2].trim();
          const id = name.toLowerCase();
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

// Per dungeon: who has cleared it, who got partway, and who still needs a
// first clear (only characters we have data for and who are high enough).
// Sorted by entry level, then name.
export function dungeonBoard(members, byMember = {}) {
  const dungeons = new Map();
  for (const per of Object.values(byMember)) {
    for (const [id, d] of Object.entries(per)) if (!dungeons.has(id)) dungeons.set(id, d.name);
  }
  const known = members.filter((m) => byMember[m.id]);
  return [...dungeons.entries()]
    .map(([id, name]) => {
      // Forever's own dungeons (Ruins of Lordaeron, City of Dalaran) have no
      // known entry level, so guess it as the lowest level of anyone who
      // has cleared it.
      let minLevel = dungeonMinLevel(name);
      let estimated = false;
      if (minLevel == null) {
        const clearers = known.filter((m) => byMember[m.id][id]?.status === 'done').map((m) => m.level);
        if (clearers.length) { minLevel = Math.min(...clearers); estimated = true; }
      }
      const done = [];
      const partial = [];
      const needs = [];
      const low = [];
      for (const m of known) {
        const d = byMember[m.id][id];
        if (d?.status === 'done') done.push({ ...m, clears: d.clears });
        else if (minLevel == null || m.level >= minLevel) (d?.status === 'partial' ? partial : needs).push(m);
        else low.push(m);
      }
      const byLevel = (a, b) => b.level - a.level || a.name.localeCompare(b.name);
      return { id, name, minLevel, estimated, done: done.sort(byLevel), partial: partial.sort(byLevel), needs: needs.sort(byLevel), low: low.sort(byLevel) };
    })
    .sort((a, b) => (a.minLevel ?? 999) - (b.minLevel ?? 999) || a.name.localeCompare(b.name));
}
