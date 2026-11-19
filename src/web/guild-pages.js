import { page, esc } from './views.js';
import { CLASSES } from '../classes.js';
import { sortByLevel } from '../sections/leveling.js';
import { characterPagePath, guildPath } from '../links.js';
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

const GUILD_CSS = `
.gh{margin:4px 0 18px}.gh .gn{font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.02em;margin:0;text-transform:none;color:var(--text)}
.gh .meta{color:var(--muted);font-size:13px;margin-top:6px}
.comp{display:flex;height:6px;border-radius:3px;overflow:hidden;margin-top:12px;gap:2px}.comp span{display:block;height:100%}
.today{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;font-size:14px;margin:-6px 0 14px}.today a{text-decoration:none;font-weight:600}
.dgs input{position:absolute;opacity:0;pointer-events:none}
.pills{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin:0 -16px 14px;padding-left:16px;padding-right:16px;scrollbar-width:none}.pills::-webkit-scrollbar{display:none}
.pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;background:var(--card2);font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;user-select:none}
.pill .pc{font-size:12px;font-weight:700;background:#ffffff1c;border-radius:999px;padding:0 7px;line-height:18px}.pill .pd{font-size:12px;opacity:.7}
.panel{display:none}.dh{display:flex;align-items:baseline;gap:8px}.dh b{font-weight:700;font-size:18px}.dh .lv{color:var(--muted);font-size:13px}.dh .ct{margin-left:auto;font-size:14px;color:var(--muted)}.dh .ct b{color:var(--text);font-size:14px}
.pb{height:4px;border-radius:2px;background:var(--card2);margin:10px 0 14px;overflow:hidden}.pb span{display:block;height:100%;background:var(--accent);border-radius:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media (max-width:520px){.cols{grid-template-columns:1fr;gap:14px}}
.gt{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}.gt span{color:var(--text)}
.pr{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);text-decoration:none}.grp .pr:first-of-type{border-top:0}
.pn{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pl{color:var(--muted);font-size:13px}.px{color:var(--muted);font-size:12px;min-width:2em;text-align:right}
.none,.low{color:var(--muted);font-size:13px}.low{margin-top:14px}
table.rk{width:100%;border-collapse:collapse}table.rk td{padding:9px 4px;border-top:1px solid var(--line);vertical-align:middle}table.rk tr:first-child td{border-top:0}
table.rk td.n{color:var(--muted);width:2em;font-size:13px}table.rk td.c{width:26px}table.rk a{text-decoration:none;font-weight:600}
table.rk .bar{height:3px;border-radius:2px;background:var(--card2);margin-top:6px;overflow:hidden}table.rk .bar span{display:block;height:100%;border-radius:2px;opacity:.85}
table.rk td.lv{text-align:right;font-weight:700;font-size:17px;width:2.5em}table.rk td.g{width:2.8em;text-align:right;font-size:13px}
`;

function nameLink(server, m, extra = '') {
  return `<a${extra} href="${esc(characterPagePath(server, m.name))}" style="color:${hex(CLASSES[m.classId]?.color)}">${esc(m.name)}</a>`;
}

function slugId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function personRow(server, m, emojis, right = '') {
  return `<a class="pr" href="${esc(characterPagePath(server, m.name))}">${classIconHtml(m.classId, emojis)}<span class="pn" style="color:${hex(CLASSES[m.classId]?.color)}">${esc(m.name)}</span><span class="pl">${m.level}</span>${right}</a>`;
}

// Dungeon picker: tap a dungeon to see who has and hasn't cleared it. Pure
// CSS (radio buttons), since the site runs no scripts.
function dungeonsCard(server, members, emojis) {
  if (!server.dungeons || !Object.keys(server.dungeons).length) return '';
  const board = dungeonBoard(members, server.dungeons);
  if (!board.length) return '';
  const first = board.find((d) => d.needs.length) || board[0];
  const ids = board.map((d) => `dg-${slugId(d.id)}`);
  const radios = board.map((d, i) => `<input type="radio" name="dg" id="${ids[i]}"${d === first ? ' checked' : ''}>`).join('');
  const pills = board.map((d, i) => {
    const todo = d.needs.length + d.partial.length;
    return `<label for="${ids[i]}" class="pill">${esc(d.name)}${todo ? `<span class="pc">${todo}</span>` : '<span class="pd">✓</span>'}</label>`;
  }).join('');
  const panels = board.map((d, i) => {
    const total = d.done.length + d.partial.length + d.needs.length;
    const pct = total ? Math.round((d.done.length / total) * 100) : 0;
    const level = d.minLevel ? `<span class="lv">${d.estimated ? '~' : ''}${d.minLevel}+</span>` : '';
    const notYet = [...d.needs, ...d.partial];
    const list = (title, people, fmt = (m) => personRow(server, m, emojis)) => people.length
      ? `<div class="grp"><div class="gt">${title} <span>${people.length}</span></div>${people.map(fmt).join('')}</div>` : '';
    return `<div class="panel" id="p-${ids[i]}"><div class="dh"><b>${esc(d.name)}</b>${level}<span class="ct"><b>${d.done.length}</b>/${total}</span></div>
<div class="pb"><span style="width:${pct}%"></span></div>
<div class="cols">${list('Not yet', notYet, (m) => personRow(server, m, emojis, d.partial.includes(m) ? '<span class="px">partway</span>' : '')) || '<div class="grp"><div class="gt">Not yet <span>0</span></div><div class="none">Everyone\'s done it</div></div>'}
${list('Done', d.done, (m) => personRow(server, m, emojis, m.clears > 1 ? `<span class="px">×${m.clears}</span>` : ''))}</div>
${d.low.length ? `<div class="low">Too low: ${d.low.map((m) => esc(m.name)).join(', ')}</div>` : ''}</div>`;
  }).join('');
  const show = ids.map((id) => `#${id}:checked~.pills label[for="${id}"]{background:var(--accent);color:#14110a}#${id}:checked~.panels #p-${id}{display:block}`).join('');
  return `<div class="card dgs" id="dungeons"><h2>Dungeons</h2><style>${show}</style>${radios}<div class="pills">${pills}</div><div class="panels">${panels}</div></div>`;
}

function shortTime(ts, timezone) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(ts));
}

export function guildPage({ server, members, emojis = {}, user, csrf }) {
  const name = server.wowGuildDisplayName || server.guildName;
  const ranked = rankMembers(members, server.baseline);
  const max = server.leveling?.maxLevel || 60;
  const avg = members.length ? Math.round(members.reduce((s, m) => s + m.level, 0) / members.length) : 0;

  const counts = {};
  for (const m of members) counts[m.classId] = (counts[m.classId] || 0) + 1;
  const comp = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `<span title="${esc(CLASSES[id]?.name || 'Other')} ${n}" style="flex:${n};background:${hex(CLASSES[id]?.color)}"></span>`)
    .join('');

  const movers = ranked.filter((m) => m.gained > 0).sort((a, b) => b.gained - a.gained).slice(0, 4);
  const today = movers.length
    ? `<div class="today"><span class="muted">Today</span>${movers.map((m, i) => `<span>${i === 0 ? '👑 ' : ''}${nameLink(server, m)} <span class="gain">+${m.gained}</span></span>`).join('')}</div>`
    : '';

  const rows = ranked.map((m) => {
    const color = hex(CLASSES[m.classId]?.color);
    const pct = Math.min(100, Math.round((m.level / max) * 100));
    return `<tr><td class="n">${m.place}</td><td class="c">${classIconHtml(m.classId, emojis)}</td>
<td>${nameLink(server, m)}<div class="bar"><span style="width:${pct}%;background:${color}"></span></div></td>
<td class="lv">${m.level}</td><td class="g">${m.gained ? `<span class="gain">+${m.gained}</span>` : ''}</td></tr>`;
  }).join('');

  const updated = shortTime(server.lastRefreshAt, server.timezone);
  const body = `<style>${GUILD_CSS}</style>
<section class="gh"><h2 class="gn">${esc(name)}</h2>
<div class="meta">${members.length} members · avg ${avg}${updated ? ` · ${esc(updated)}` : ''}</div>
<div class="comp">${comp}</div></section>
${today}
${dungeonsCard(server, members, emojis)}
<div class="card"><h2>Roster</h2><table class="rk">${rows}</table></div>`;
  return page(`${name} · guild`, body, user, csrf);
}

function noDungeonsText(status) {
  if (status === 'notfound') return 'No Blizzard record yet';
  if (status === 'error') return 'Couldn\'t reach Blizzard';
  return 'No clears yet';
}

function characterDungeons(server, member) {
  const mine = server.dungeons?.[member.id];
  if (!mine) return '';
  const board = dungeonBoard([member], server.dungeons);
  const todo = board.filter((d) => d.needs.length || d.partial.length);
  const done = board.filter((d) => d.done.length);
  const chips = (items, fmt) => `<div class="chips">${items.map(fmt).join('')}</div>`;
  const parts = [];
  if (todo.length) parts.push(`<h2>Needs</h2>${chips(todo, (d) => `<span class="chip">${esc(d.name)}</span>`)}`);
  if (done.length) parts.push(`<h2${todo.length ? ' style="margin-top:16px"' : ''}>Cleared</h2>${chips(done, (d) => `<span class="chip">${esc(d.name)}${d.done[0].clears > 1 ? ` <span class="muted">×${d.done[0].clears}</span>` : ''}</span>`)}`);
  return `<div class="card">${parts.join('') || `<h2>Dungeons</h2><span class="muted">${esc(noDungeonsText(server.dungeonStatus?.[member.id]))}</span>`}</div>`;
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
.armory{--c:#888;background:radial-gradient(ellipse at 50% 18%,color-mix(in srgb,var(--c) 28%,#0f1218) 0%,#0f1218 65%);color:var(--text);border-radius:14px;padding:18px;margin-bottom:12px;border:1px solid var(--line)}
.armory a{color:var(--accent)}
.ahead h2{font-size:30px;line-height:1.1;margin:0;color:var(--c);font-weight:800;letter-spacing:-.02em;text-transform:none}.ahead .sub{font-size:14px;margin-top:4px;color:var(--muted)}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.badge{background:#ffffff10;border-radius:8px;padding:4px 10px;font-size:13px;color:var(--muted)}
.badge b{color:var(--text);font-weight:700}
.doll{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,300px) minmax(0,1fr);gap:8px;margin-top:16px;align-items:start}
.col{display:flex;flex-direction:column;gap:6px;min-width:0}.col.r .slot{flex-direction:row-reverse;text-align:right}.col.r .tip{left:auto;right:0}
.fig{height:440px;overflow:hidden}.fig img{width:100%;height:100%;object-fit:contain;transform:scale(1.5);transform-origin:50% 62%}
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
.sheet .grp{background:#ffffff08;border-radius:10px;padding:10px 12px}.sheet h3{margin:0 0 6px;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-weight:700}
.sheet .kv{display:flex;justify-content:space-between;font-size:14px;padding:2px 0}.sheet .kv span:last-child{font-variant-numeric:tabular-nums;font-weight:600}
@media (max-width:700px){.armory{padding:14px 12px}.ahead h2{font-size:24px}
.doll{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 6px}.fig{grid-column:1/3;order:-1;height:250px}.fig img{transform:scale(2);transform-origin:50% 70%}
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

export function characterPage({ server, member, ranked, armory, emojis = {}, user, csrf }) {
  const guildName = server.wowGuildDisplayName || server.guildName;
  const me = ranked.find((m) => m.id === member.id) || { place: '?', gained: 0 };
  const a = armory?.found ? armory : null;
  const level = Math.max(member.level, a?.level || 0);
  const className = a?.className || member.className || CLASSES[member.classId]?.name || '';
  const subtitle = [level, a?.race, className].filter(Boolean).join(' ');
  const classColor = hex(CLASSES[member.classId]?.color);

  const badges = [
    a?.itemLevel ? `<span class="badge"><b>${esc(a.itemLevel)}</b> ilvl</span>` : '',
    `<span class="badge"><b>#${esc(me.place)}</b> in guild</span>`,
    me.gained ? `<span class="badge"><b>+${me.gained}</b> today</span>` : '',
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
    doll = '<p class="muted" style="margin-top:16px">No armory yet (level 10 and a logout needed)</p>';
  } else if (armory?.error) {
    doll = '<p class="muted" style="margin-top:16px">Couldn\'t reach Blizzard, try again shortly</p>';
  }

  const sheet = a?.stats?.length
    ? `<div class="sheet">${a.stats.map((g) => `<div class="grp"><h3>${esc(g.title)}</h3>${g.rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`).join('')}</div>`
    : '';

  const body = `<style>${ARMORY_CSS}</style>
<p style="margin:0 0 12px;font-size:14px"><a href="${esc(guildPath(server))}" style="text-decoration:none">← ${esc(guildName)}</a></p>
<section class="armory" style="--c:${classColor}">
<div class="ahead"><h2>${esc(member.name)}</h2>
<div class="sub">${esc(subtitle)}${a?.title ? ` · ${esc(a.title.replace('{name}', member.name))}` : ''}</div></div>
<div class="badges">${badges}</div>
${doll}${sheet}
</section>
${characterDungeons(server, member)}`;
  return page(`${member.name} · ${guildName}`, body, user, csrf);
}
