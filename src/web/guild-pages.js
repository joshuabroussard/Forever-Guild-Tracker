import { page, esc } from './views.js';
import { CLASSES } from '../classes.js';
import { sortByLevel } from '../sections/leveling.js';
import { characterPagePath, guildPath } from '../links.js';
import { localDate } from '../state.js';
import { dungeonBoard } from '../dungeons.js';

// Public pages: a guild summary with the full ranked roster, and an
// armory-style page per character. Everything shown is already public on
// Blizzard's armory; the ranking lives here so it can grow later.

function hex(n) {
  return '#' + Number(n || 0x888888).toString(16).padStart(6, '0');
}

export function classIconHtml(classId, emojis = {}) {
  const m = String(emojis[classId] || '').match(/^<:(\w+):(\d+)>$/);
  const name = CLASSES[classId]?.name || 'Unknown class';
  if (m) return `<img class="ci" src="https://cdn.discordapp.com/emojis/${m[2]}.png?size=40" alt="${esc(name)}" title="${esc(name)}">`;
  return `<span class="ci" title="${esc(name)}" style="background:${hex(CLASSES[classId]?.color)}"></span>`;
}

// Competition ranking: equal levels share a place (1, 2, 2, 4).
export function rankMembers(members, baseline) {
  const sorted = sortByLevel(members);
  let place = 0;
  return sorted.map((m, i) => {
    if (i === 0 || m.level !== sorted[i - 1].level) place = i + 1;
    const gained = m.level - (baseline?.levels?.[m.id] ?? m.level);
    return { ...m, place, gained: gained > 0 ? gained : 0 };
  });
}

function formatTime(ts, timezone) {
  if (!ts) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(ts));
}

function lastSeen(ts, timezone, now = new Date()) {
  if (!ts) return null;
  const days = Math.round((Date.parse(localDate(timezone, now)) - Date.parse(localDate(timezone, new Date(ts)))) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function personChip(server, m, emojis, extra = '') {
  return `<a class="chip" style="color:inherit;text-decoration:none" href="${esc(characterPagePath(server, m.name))}">${classIconHtml(m.classId, emojis)} ${esc(m.name)} <span class="muted">${m.level}</span>${extra}</a>`;
}

// One card per dungeon: who still needs a first clear, and who got partway.
// Dungeons nobody needs fold into one line at the end.
function dungeonsCard(server, members, emojis) {
  if (!server.dungeons || !Object.keys(server.dungeons).length) return '';
  const board = dungeonBoard(members, server.dungeons);
  if (!board.length) return '';
  const open = board.filter((d) => d.needs.length || d.partial.length);
  const cleared = board.filter((d) => !d.needs.length && !d.partial.length && d.done.length);
  const rows = open.map((d) => {
    const level = d.minLevel ? `<span class="muted">${d.minLevel}+</span>` : '';
    const total = d.done.length + d.partial.length + d.needs.length;
    const needs = d.needs.map((m) => personChip(server, m, emojis)).join('');
    const partial = d.partial.map((m) => personChip(server, m, emojis, ' <span class="muted">partway</span>')).join('');
    return `<div class="row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(d.name)} ${level}</b><span class="muted">${d.done.length} of ${total} cleared</span></div>
<div class="chips" style="margin-top:6px">${needs}${partial}</div></div>`;
  }).join('');
  const clearedLine = cleared.length
    ? `<p class="muted" style="margin:12px 0 0">Everyone high enough has cleared ${cleared.map((d) => esc(d.name)).join(', ')}.</p>`
    : '';
  const when = server.dungeonsAt ? formatTime(server.dungeonsAt, server.timezone) : null;
  return `<div class="card"><h2>Who still needs a first clear</h2>
<p class="muted" style="margin-top:-6px">Dungeons anyone in the guild has run. Characters below a dungeon's entry level aren't listed.${when ? ` Checked ${esc(when)}.` : ''}</p>
${rows || '<p>Everyone high enough has cleared every dungeon the guild has run.</p>'}${clearedLine}</div>`;
}

export function guildPage({ server, members, emojis = {}, user, csrf }) {
  const name = server.wowGuildDisplayName || server.guildName;
  const ranked = rankMembers(members, server.baseline);
  const max = server.leveling?.maxLevel || 60;
  const avg = members.length ? Math.round(members.reduce((s, m) => s + m.level, 0) / members.length) : 0;
  const atMax = members.filter((m) => m.level >= max).length;
  const gainedToday = ranked.reduce((s, m) => s + m.gained, 0);

  const counts = {};
  for (const m of members) counts[m.classId] = (counts[m.classId] || 0) + 1;
  const chips = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<span class="chip">${classIconHtml(id, emojis)} ${esc(CLASSES[id]?.name || 'Other')} <b>${n}</b></span>`)
    .join('');

  const movers = ranked.filter((m) => m.gained > 0).sort((a, b) => b.gained - a.gained).slice(0, 3);
  const moversHtml = movers.length
    ? `<div class="card"><h2>Leveled up today</h2><div class="chips">${movers.map((m, i) => `<a class="chip" style="color:inherit;text-decoration:none" href="${esc(characterPagePath(server, m.name))}">${i === 0 ? '👑 ' : ''}${classIconHtml(m.classId, emojis)} ${esc(m.name)} <span class="gain">+${m.gained}</span></a>`).join('')}</div></div>`
    : '';

  const rows = ranked.map((m) => {
    const color = hex(CLASSES[m.classId]?.color);
    const pct = Math.min(100, Math.round((m.level / max) * 100));
    return `<tr><td class="n">${m.place}</td><td>${classIconHtml(m.classId, emojis)}</td>
<td><a href="${esc(characterPagePath(server, m.name))}">${esc(m.name)}</a><div class="muted wide">${esc(m.className || CLASSES[m.classId]?.name || '')}</div></td>
<td class="wide" style="width:30%"><div class="bar"><span style="width:${pct}%;background:${color}"></span></div></td>
<td class="lv">${m.level}</td><td style="width:3em">${m.gained ? `<span class="gain">+${m.gained}</span>` : ''}</td></tr>`;
  }).join('');

  const updated = formatTime(server.lastRefreshAt, server.timezone);
  const body = `<div class="card"><h2 style="font-size:24px;margin-bottom:4px">${esc(name)}</h2>
<div class="muted">WoW Forever · ${esc(server.region.toUpperCase())}${updated ? ` · updated ${esc(updated)}` : ''}</div>
<div class="stats" style="margin-top:16px">
<div class="stat"><b>${members.length}</b><span class="muted">characters</span></div>
<div class="stat"><b>${avg}</b><span class="muted">average level</span></div>
<div class="stat"><b>${atMax}</b><span class="muted">at level ${max}</span></div>
<div class="stat"><b>${gainedToday}</b><span class="muted">levels gained today</span></div>
</div></div>
${moversHtml}
${dungeonsCard(server, members, emojis)}
<div class="card"><h2>Classes</h2><div class="chips">${chips || '<span class="muted">No characters yet.</span>'}</div></div>
<div class="card"><h2>Ranking</h2><table class="rank">${rows}</table></div>`;
  return page(`${name} · guild`, body, user, csrf);
}

function noDungeonsText(status, name) {
  if (status === 'notfound') return `Blizzard has no dungeon record for ${name} yet.`;
  if (status === 'empty') return `Blizzard's dungeon record for ${name} came back in a form this site can't read yet.`;
  if (status === 'error') return 'Couldn\'t reach Blizzard for dungeon data on the last check.';
  return 'No dungeon runs yet.';
}

function characterDungeons(server, member) {
  const mine = server.dungeons?.[member.id];
  if (!mine) return '';
  const board = dungeonBoard([member], server.dungeons);
  const todo = board.filter((d) => d.needs.length);
  const partway = board.filter((d) => d.partial.length);
  const done = board.filter((d) => d.done.length);
  const list = (items, fmt) => items.map(fmt).join('');
  const line = (label, items) => items ? `<div style="margin-top:8px"><span class="muted">${label}</span><div class="chips" style="margin-top:4px">${items}</div></div>` : '';
  return `<div class="card"><h2>Dungeons</h2>
${line('Still needs a first clear', list(todo, (d) => `<span class="chip">${esc(d.name)}${d.minLevel ? ` <span class="muted">${d.minLevel}+</span>` : ''}</span>`))}
${line('Partway', list(partway, (d) => `<span class="chip">${esc(d.name)}</span>`))}
${line('Cleared', list(done, (d) => `<span class="chip">✓ ${esc(d.name)}${d.done[0].clears > 1 ? ` <span class="muted">×${d.done[0].clears}</span>` : ''}</span>`))}
${!todo.length && !partway.length && !done.length ? `<p class="muted">${esc(noDungeonsText(server.dungeonStatus?.[member.id], member.name))}</p>` : ''}</div>`;
}

export function characterPage({ server, member, ranked, armory, emojis = {}, user, csrf, now = new Date() }) {
  const guildName = server.wowGuildDisplayName || server.guildName;
  const me = ranked.find((m) => m.id === member.id) || { place: '?', gained: 0 };
  const a = armory?.found ? armory : null;
  const level = Math.max(member.level, a?.level || 0);
  const className = a?.className || member.className || CLASSES[member.classId]?.name || '';
  const subtitle = [`Level ${level}`, a?.race, className].filter(Boolean).join(' ');
  const image = a?.image
    ? `<img src="${esc(a.image)}" alt="">`
    : `<div style="width:96px;height:96px;border-radius:12px;background:${hex(CLASSES[member.classId]?.color)};display:flex;align-items:center;justify-content:center">${classIconHtml(member.classId, emojis).replace('class="ci"', 'class="ci" style="width:48px;height:48px"')}</div>`;

  const facts = [
    ['Guild rank', `#${me.place} of ${ranked.length} by level`],
    me.gained ? ['Today', `<span class="gain">+${me.gained} level${me.gained === 1 ? '' : 's'}</span>`] : null,
    a?.itemLevel ? ['Item level', esc(a.itemLevel)] : null,
    a?.faction ? ['Faction', esc(a.faction)] : null,
    a?.lastLogin ? ['Last online', esc(lastSeen(a.lastLogin, server.timezone, now))] : null,
  ].filter(Boolean);
  const factsHtml = `<div class="stats" style="margin-top:16px">${facts.map(([k, v]) => `<div class="stat"><span class="muted">${esc(k)}</span><div style="font-weight:600">${v}</div></div>`).join('')}</div>`;

  let gear = '';
  if (a?.items?.length) {
    gear = `<div class="card"><h2>Equipment</h2><table class="items">${a.items.map((i) => `<tr><td class="s">${esc(i.slot)}</td><td class="q-${esc(i.quality)}">${esc(i.name)}</td><td class="il">${i.itemLevel ? esc(i.itemLevel) : ''}</td></tr>`).join('')}</table></div>`;
  } else if (armory && !armory.found && !armory.error) {
    gear = `<div class="card"><p class="muted" style="margin:0">Blizzard hasn't published the armory page for ${esc(member.name)} yet. That happens once they're level 10 and have logged out once.</p></div>`;
  } else if (armory?.error) {
    gear = `<div class="card"><p class="muted" style="margin:0">Couldn't reach Blizzard's armory just now, so gear isn't shown. Try again in a few minutes.</p></div>`;
  }

  const dungeonsHtml = characterDungeons(server, member);
  const body = `<p style="margin:0 0 12px"><a href="${esc(guildPath(server))}">← ${esc(guildName)}</a></p>
<div class="card"><div class="hero">${image}<div><h2 style="font-size:24px;margin:0">${esc(member.name)}</h2>
${a?.title ? `<div class="muted">${esc(a.title.replace('{name}', member.name))}</div>` : ''}
<div>${esc(subtitle)}</div></div></div>${factsHtml}</div>${dungeonsHtml}${gear}`;
  return page(`${member.name} · ${guildName}`, body, user, csrf);
}
