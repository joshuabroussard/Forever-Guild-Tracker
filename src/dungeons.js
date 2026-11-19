// Dungeon first clears: who has finished each dungeon, and who still needs it.
//
// Blizzard's /encounters/dungeons only lists dungeons a character has been
// in, so the dungeon list here is every dungeon anyone in the guild has
// touched. Forever's endpoint isn't documented; this reads the same shape as
// retail (expansions > instances > modes > progress) and is defensive about it.

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
export function parseDungeons(body) {
  const out = {};
  for (const exp of body?.expansions || []) {
    for (const inst of exp.instances || []) {
      const id = inst.instance?.id ?? inst.instance?.name;
      if (id == null) continue;
      let done = false;
      let partial = false;
      let clears = 0;
      for (const mode of inst.modes || []) {
        const p = mode.progress || {};
        const bosses = p.encounters || [];
        const complete = mode.status?.type === 'COMPLETE' || (p.total_count > 0 && p.completed_count >= p.total_count);
        if (complete) {
          done = true;
          const counts = bosses.map((b) => Number(b.completed_count) || 0).filter((n) => n > 0);
          clears += counts.length ? Math.min(...counts) : 1;
        } else if (p.completed_count > 0 || bosses.some((b) => b.completed_count > 0)) {
          partial = true;
        }
      }
      if (done || partial) out[id] = { name: inst.instance?.name || String(id), status: done ? 'done' : 'partial', clears };
    }
  }
  return out;
}

// Looks up dungeon progress for characters level 10+ (Blizzard has no profile
// below that), a few at a time. A character Blizzard doesn't know yet counts
// as having done nothing; one that errors keeps its last known data.
export async function fetchDungeons(client, members, previous = {}, { concurrency = 3 } = {}) {
  const out = {};
  const todo = members.filter((m) => m.profilePath && m.level >= 10);
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const m = todo[next++];
      try {
        out[m.id] = parseDungeons(await client.getDungeons(m.profilePath));
      } catch (e) {
        if (e.status === 404) out[m.id] = {};
        else if (previous[m.id]) out[m.id] = previous[m.id];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return out;
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
      const minLevel = dungeonMinLevel(name);
      const done = [];
      const partial = [];
      const needs = [];
      for (const m of known) {
        const d = byMember[m.id][id];
        if (d?.status === 'done') done.push({ ...m, clears: d.clears });
        else if (minLevel == null || m.level >= minLevel) (d?.status === 'partial' ? partial : needs).push(m);
      }
      const byLevel = (a, b) => b.level - a.level || a.name.localeCompare(b.name);
      return { id, name, minLevel, done: done.sort(byLevel), partial: partial.sort(byLevel), needs: needs.sort(byLevel) };
    })
    .sort((a, b) => (a.minLevel ?? 999) - (b.minLevel ?? 999) || a.name.localeCompare(b.name));
}
