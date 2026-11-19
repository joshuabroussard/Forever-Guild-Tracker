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

// Paper-doll layout like the official armory: gear down both sides of the
// character, weapons underneath, a tooltip on each slot (hover or tap).
const LEFT = ['HEAD', 'NECK', 'SHOULDER', 'BACK', 'CHEST', 'SHIRT', 'TABARD', 'WRIST'];
const RIGHT = ['HANDS', 'WAIST', 'LEGS', 'FEET', 'FINGER_1', 'FINGER_2', 'TRINKET_1', 'TRINKET_2'];
const WEAPONS = ['MAIN_HAND', 'OFF_HAND', 'RANGED'];
const SLOT_NAMES = {
  HEAD: 'Head', NECK: 'Neck', SHOULDER: 'Shoulders', BACK: 'Back', CHEST: 'Chest', SHIRT: 'Shirt', TABARD: 'Tabard', WRIST: 'Wrist',
  HANDS: 'Hands', WAIST: 'Waist', LEGS: 'Legs', FEET: 'Feet', FINGER_1: 'Ring', FINGER_2: 'Ring', TRINKET_1: 'Trinket', TRINKET_2: 'Trinket',
  MAIN_HAND: 'Main Hand', OFF_HAND: 'Off Hand', RANGED: 'Ranged',
};

const ARMORY_CSS = `
main{max-width:1000px}
.armory{--c:#888;background:radial-gradient(ellipse at 50% 20%,color-mix(in srgb,var(--c) 35%,#0d0f14) 0%,#0d0f14 70%);color:#f2f3f5;border-radius:14px;padding:20px;margin-bottom:16px;border:1px solid #2a2d35}
.armory .muted{color:#a9aebb}.armory a{color:#e6c35c}
.ahead h2{font-size:28px;margin:0;color:var(--c)}.ahead .sub{font-size:16px;margin-top:2px}
.badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.badge{background:#ffffff14;border:1px solid #ffffff22;border-radius:999px;padding:3px 10px;font-size:13px}
.badge b{color:#e6c35c}
.doll{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,300px) minmax(0,1fr);gap:8px;margin-top:16px;align-items:start}
.col{display:flex;flex-direction:column;gap:6px;min-width:0}.col.r .slot{flex-direction:row-reverse;text-align:right}.col.r .tip{left:auto;right:0}
.fig{display:flex;align-items:flex-end;justify-content:center;min-height:360px}.fig img{max-width:100%;max-height:520px;object-fit:contain}
.weap{display:flex;justify-content:center;gap:12px;margin-top:8px;flex-wrap:wrap}.weap .slot{width:240px}
.slot{position:relative;display:flex;align-items:center;gap:8px;padding:4px;border-radius:8px;outline:none;cursor:default;min-width:0}
.slot:hover,.slot:focus{background:#ffffff10}
.slot .ic{width:44px;height:44px;flex-shrink:0;border-radius:6px;border:2px solid var(--q);background:#1b1e25 center/cover no-repeat;box-shadow:0 0 6px color-mix(in srgb,var(--q) 40%,transparent)}
.slot.empty .ic{border-color:#3a3d46;box-shadow:none;opacity:.6}
.slot .nm{min-width:0;flex:1;font-size:14px;line-height:1.25}.slot .nm b{display:block;color:var(--q);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.slot .nm span{font-size:12px;color:#a9aebb}
.tip{display:none;position:absolute;z-index:20;top:100%;left:0;margin-top:4px;width:300px;max-width:86vw;background:#070a10f2;border:1px solid #6b6f7a;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.45;text-align:left;color:#fff;box-shadow:0 8px 24px #000a}
.slot:hover .tip,.slot:focus .tip{display:block}
.tip .t{font-size:15px;font-weight:600;color:var(--q)}.tip .y{color:#ffd100}.tip .g{color:#1eff00}.tip .d{color:#ffd100;font-style:italic}.tip .s{color:#9d9d9d}
.tip .two{display:flex;justify-content:space-between;gap:12px}
.qPOOR{--q:#9d9d9d}.qCOMMON{--q:#ffffff}.qUNCOMMON{--q:#1eff00}.qRARE{--q:#0070dd}.qEPIC{--q:#a335ee}.qLEGENDARY{--q:#ff8000}.qARTIFACT{--q:#e6cc80}.qHEIRLOOM{--q:#00ccff}
.sheet{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:16px}
.sheet .grp{background:#ffffff0a;border:1px solid #ffffff18;border-radius:8px;padding:8px 12px}.sheet h3{margin:0 0 4px;font-size:13px;color:#e6c35c;text-transform:uppercase;letter-spacing:.04em}
.sheet .kv{display:flex;justify-content:space-between;font-size:14px;padding:2px 0}.sheet .kv span:last-child{font-variant-numeric:tabular-nums;font-weight:600}
@media (max-width:700px){.armory{padding:14px 12px}.ahead h2{font-size:24px}
.doll{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 6px}.fig{grid-column:1/3;order:-1;min-height:0;align-items:center}.fig img{max-height:240px}
.col.r .slot{flex-direction:row;text-align:left}
.slot{gap:6px;padding:3px}.slot .ic{width:36px;height:36px}
.slot .nm{font-size:13px}.slot .nm b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.weap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 6px}.weap .slot{width:auto}
.tip{position:fixed;left:8px!important;right:8px!important;top:auto;bottom:8px;width:auto;max-width:none;margin:0}
.sheet{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.sheet .kv{font-size:13px}}
`;

function tooltip(i) {
  const lines = [`<div class="t">${esc(i.name)}</div>`];
  if (i.itemLevel) lines.push(`<div class="y">Item Level ${esc(i.itemLevel)}</div>`);
  if (i.binding) lines.push(`<div>${esc(i.binding)}</div>`);
  if (i.inventoryType || i.subclass) lines.push(`<div class="two"><span>${esc(i.inventoryType || '')}</span><span>${esc(i.subclass || '')}</span></div>`);
  if (i.weapon?.damage || i.weapon?.speed) lines.push(`<div class="two"><span>${esc(i.weapon.damage || '')}</span><span>${esc(i.weapon.speed || '')}</span></div>`);
  if (i.weapon?.dps) lines.push(`<div>${esc(i.weapon.dps)}</div>`);
  if (i.armor) lines.push(`<div>${esc(i.armor)}</div>`);
  for (const st of i.stats.filter((x) => !x.equip)) lines.push(`<div${st.color ? ` style="color:${st.color}"` : ''}>${esc(st.text)}</div>`);
  for (const e of i.enchantments) lines.push(`<div class="g">${esc(e)}</div>`);
  if (i.durability) lines.push(`<div>${esc(i.durability)}</div>`);
  if (i.requirement) lines.push(`<div>${esc(i.requirement)}</div>`);
  for (const st of i.stats.filter((x) => x.equip)) lines.push(`<div class="g">${esc(st.text)}</div>`);
  for (const sp of i.spells) lines.push(`<div class="g">${esc(sp)}</div>`);
  if (i.set?.name) {
    lines.push(`<div class="y" style="margin-top:6px">${esc(i.set.name)}</div>`);
    for (const e of i.set.effects) lines.push(`<div class="${e.active ? 'g' : 's'}">${esc(e.text)}</div>`);
  }
  if (i.description) lines.push(`<div class="d">"${esc(i.description)}"</div>`);
  return `<div class="tip" role="tooltip">${lines.join('')}</div>`;
}

function slotHtml(type, item) {
  if (!item) {
    return `<div class="slot empty"><span class="ic"></span><span class="nm"><span>${esc(SLOT_NAMES[type] || type)}</span></span></div>`;
  }
  const icon = item.icon ? ` style="background-image:url('${esc(item.icon)}')"` : '';
  return `<div class="slot q${esc(item.quality)}" tabindex="0" aria-label="${esc(item.name)}"><span class="ic"${icon}></span>
<span class="nm"><b>${esc(item.name)}</b><span>${esc(SLOT_NAMES[type] || item.slot)}${item.itemLevel ? ` · ${esc(item.itemLevel)}` : ''}</span></span>${tooltip(item)}</div>`;
}

export function characterPage({ server, member, ranked, armory, emojis = {}, user, csrf, now = new Date() }) {
  const guildName = server.wowGuildDisplayName || server.guildName;
  const me = ranked.find((m) => m.id === member.id) || { place: '?', gained: 0 };
  const a = armory?.found ? armory : null;
  const level = Math.max(member.level, a?.level || 0);
  const className = a?.className || member.className || CLASSES[member.classId]?.name || '';
  const subtitle = [`Level ${level}`, a?.race, className].filter(Boolean).join(' ');
  const classColor = hex(CLASSES[member.classId]?.color);

  const badges = [
    a?.itemLevel ? `<span class="badge">Item level <b>${esc(a.itemLevel)}</b></span>` : '',
    `<span class="badge">Guild rank <b>#${esc(me.place)}</b> of ${ranked.length}</span>`,
    me.gained ? `<span class="badge">Today <b>+${me.gained}</b></span>` : '',
    a?.faction ? `<span class="badge">${esc(a.faction)}</span>` : '',
    a?.lastLogin ? `<span class="badge">Online ${esc(lastSeen(a.lastLogin, server.timezone, now))}</span>` : '',
  ].join('');

  let doll = '';
  if (a?.items?.length) {
    const bySlot = Object.fromEntries(a.items.filter((i) => i.slotType).map((i) => [i.slotType, i]));
    const placed = new Set([...LEFT, ...RIGHT, ...WEAPONS]);
    const extra = a.items.filter((i) => !i.slotType || !placed.has(i.slotType));
    const figure = a.render || a.image;
    doll = `<div class="doll">
<div class="col l">${LEFT.map((t) => slotHtml(t, bySlot[t])).join('')}</div>
<div class="fig">${figure ? `<img src="${esc(figure)}" alt="${esc(member.name)}">` : ''}</div>
<div class="col r">${RIGHT.map((t) => slotHtml(t, bySlot[t])).join('')}</div>
</div>
<div class="weap">${WEAPONS.filter((t) => bySlot[t] || t !== 'OFF_HAND').map((t) => slotHtml(t, bySlot[t])).join('')}${extra.map((i) => slotHtml(i.slotType, i)).join('')}</div>`;
  } else if (armory && !armory.found && !armory.error) {
    doll = `<p class="muted" style="margin-top:16px">Blizzard hasn't published the armory page for ${esc(member.name)} yet. That happens once they're level 10 and have logged out once.</p>`;
  } else if (armory?.error) {
    doll = `<p class="muted" style="margin-top:16px">Couldn't reach Blizzard's armory just now, so gear isn't shown. Try again in a few minutes.</p>`;
  }

  const sheet = a?.stats?.length
    ? `<div class="sheet">${a.stats.map((g) => `<div class="grp"><h3>${esc(g.title)}</h3>${g.rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`).join('')}</div>`
    : '';

  const body = `<style>${ARMORY_CSS}</style>
<p style="margin:0 0 12px"><a href="${esc(guildPath(server))}">← ${esc(guildName)}</a></p>
<section class="armory" style="--c:${classColor}">
<div class="ahead"><h2>${esc(member.name)}</h2>
${a?.title ? `<div class="muted">${esc(a.title.replace('{name}', member.name))}</div>` : ''}
<div class="sub">${esc(subtitle)}</div><div class="muted">&lt;${esc(guildName)}&gt;</div></div>
<div class="badges">${badges}</div>
${doll}${sheet}
</section>
${characterDungeons(server, member)}`;
  return page(`${member.name} · ${guildName}`, body, user, csrf);
}
