import { REGIONS } from '../config.js';
import { SECTIONS } from '../sections/index.js';

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const CSS = `
:root{--bg:#f5f6f8;--card:#fff;--text:#16181d;--muted:#5b6170;--line:#dfe2e8;--accent:#5865f2;--ok:#1f8a4c;--bad:#c0392b;--embed:#f2f3f5}
@media (prefers-color-scheme:dark){:root{--bg:#1e1f22;--card:#2b2d31;--text:#f2f3f5;--muted:#b5bac1;--line:#3f4147;--accent:#7983f5;--ok:#3ba55c;--bad:#ed4245;--embed:#232428}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 64px}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:24px}
h1{font-size:22px;margin:0}h2{font-size:18px;margin:0 0 12px}a{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.row{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}.row:first-of-type{border-top:0}
.row .grow{flex:1;min-width:0}.icon{width:40px;height:40px;border-radius:50%;background:var(--line);flex-shrink:0}
.muted{color:var(--muted);font-size:14px}.btn{display:inline-block;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);text-decoration:none;font:inherit;font-size:14px;cursor:pointer}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
label{display:block;font-weight:500;margin:14px 0 4px}input[type=text],select,input[type=number]{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font:inherit}
.check{display:flex;gap:8px;align-items:center;font-weight:400;margin:6px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0 16px}
.note{padding:10px 14px;border-radius:8px;margin-bottom:16px;border:1px solid var(--line)}.note.ok{border-color:var(--ok)}.note.bad{border-color:var(--bad)}
.embed{background:var(--embed);border-left:4px solid var(--accent);border-radius:4px;padding:12px 16px;font-size:14px}.embed .f{margin-top:10px}.embed .fn{font-weight:600}
.embed .inl{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0 16px}code{font-size:13px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
`;

function page(title, body, user, csrf) {
  const nav = user
    ? `<form method="post" action="/logout" style="margin:0"><input type="hidden" name="csrf" value="${esc(csrf)}"><span class="muted">${esc(user.username)}</span> <button class="btn">Sign out</button></form>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><main><header><h1><a href="/" style="color:inherit;text-decoration:none">Guild tracker</a></h1>${nav}</header>${body}</main></body></html>`;
}

function serverIcon(s) {
  return s.icon
    ? `<img class="icon" alt="" src="https://cdn.discordapp.com/icons/${esc(s.id)}/${esc(s.icon)}.png?size=64">`
    : '<div class="icon"></div>';
}

export function landingPage() {
  return page('Guild tracker', `<div class="card"><h2>Track your WoW Forever guild in Discord</h2>
<p>Sign in with Discord to pick a server, link it to your WoW guild, and choose the channel for the progress embed.</p>
<a class="btn primary" href="/login">Sign in with Discord</a></div>`);
}

export function serverListPage({ user, csrf, servers }) {
  const rows = servers.length
    ? servers.map((s) => {
        const status = !s.botPresent ? 'Bot not added yet' : s.configured ? (s.enabled ? `Tracking ${esc(s.guildName)}` : 'Set up, tracking off') : 'Not set up';
        const action = s.botPresent
          ? `<a class="btn primary" href="/servers/${esc(s.id)}">${s.configured ? 'Settings' : 'Set up'}</a>`
          : `<a class="btn" href="${esc(s.inviteUrl)}" target="_blank" rel="noopener">Add bot</a>`;
        return `<div class="row">${serverIcon(s)}<div class="grow"><div>${esc(s.name)}</div><div class="muted">${status}</div></div>${action}</div>`;
      }).join('')
    : '<p class="muted">You don\'t manage any Discord servers. You need the Manage Server permission to set one up.</p>';
  return page('Your servers', `<div class="card"><h2>Your servers</h2>${rows}</div>
<p class="muted">After adding the bot, come back and refresh this page.</p>`, user, csrf);
}

function mdLite(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
}

export function embedPreview(embed) {
  if (!embed) return '';
  const blocks = [];
  let inline = [];
  const flush = () => {
    if (inline.length) blocks.push(`<div class="inl">${inline.join('')}</div>`);
    inline = [];
  };
  for (const f of embed.fields) {
    const html = `<div class="f"><div class="fn">${mdLite(f.name)}</div><div>${mdLite(f.value)}</div></div>`;
    if (f.inline) inline.push(html);
    else {
      flush();
      blocks.push(html);
    }
  }
  flush();
  return `<div class="embed" style="border-left-color:#${embed.color.toString(16).padStart(6, '0')}"><div class="fn" style="font-size:16px">${esc(embed.title)}</div><div class="muted">${esc(embed.description)}</div>${blocks.join('')}<div class="muted" style="margin-top:10px;font-size:12px">${esc(embed.footer.text)}</div></div>`;
}

export function settingsPage({ user, csrf, server, settings, channels, notice, preview, messageUrl }) {
  const v = settings;
  const opt = (value, label, current) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;
  const sectionBoxes = Object.values(SECTIONS)
    .map((s) => `<label class="check"><input type="checkbox" name="sections" value="${esc(s.id)}"${v.sections.includes(s.id) ? ' checked' : ''}> ${esc(s.label)}</label>`)
    .join('');
  const noticeHtml = notice ? `<div class="note ${notice.ok ? 'ok' : 'bad'}">${notice.html ?? esc(notice.text)}</div>` : '';
  const status = [
    v.lastRefreshAt ? `Last update: ${esc(new Date(v.lastRefreshAt).toUTCString())}` : null,
    v.lastError ? `<span style="color:var(--bad)">Problem: ${esc(v.lastError)}</span>` : null,
    messageUrl ? `<a href="${esc(messageUrl)}" target="_blank" rel="noopener">Open the embed in Discord</a>` : null,
  ].filter(Boolean).join('<br>');
  const channelOptions = channels.length
    ? `<option value="">Pick a channel</option>${channels.map((c) => opt(c.id, `#${c.name}`, v.channelId)).join('')}`
    : '<option value="">The bot can\'t post in any channel yet</option>';

  const body = `${noticeHtml}
<div class="card" style="display:flex;gap:12px;align-items:center">${serverIcon(server)}<div><h2 style="margin:0">${esc(server.name)}</h2>${status ? `<div class="muted">${status}</div>` : ''}</div></div>
<form method="post" action="/servers/${esc(server.id)}" class="card">
<input type="hidden" name="csrf" value="${esc(csrf)}">
<h2>WoW guild</h2>
<label for="guildName">Guild name</label><input type="text" id="guildName" name="guildName" maxlength="64" required value="${esc(v.guildName)}" placeholder="Ashen Oath">
<div class="grid">
<div><label for="region">Region</label><select id="region" name="region">${REGIONS.map((r) => opt(r, r.toUpperCase(), v.region)).join('')}</select></div>
<div><label for="guildSlug">Guild slug (optional)</label><input type="text" id="guildSlug" name="guildSlug" maxlength="64" value="${esc(v.guildSlug)}" placeholder="worked out from the name"></div>
</div>
<p class="muted">WoW Forever has no realms, so the name and region are enough. Use the slug only if the check can't find your guild.</p>
<h2 style="margin-top:24px">Discord</h2>
<label for="channelId">Channel for the embed</label><select id="channelId" name="channelId">${channelOptions}</select>
<label for="timezone">Time zone for "leveled today"</label><input type="text" id="timezone" name="timezone" value="${esc(v.timezone)}" placeholder="America/Chicago">
<h2 style="margin-top:24px">What to show</h2>${sectionBoxes}
<div class="grid">
<div><label for="top">Characters in the top list</label><input type="number" id="top" name="top" min="1" max="50" value="${esc(v.leveling.top)}"></div>
<div><label for="maxLevel">Max level</label><input type="number" id="maxLevel" name="maxLevel" min="1" max="120" value="${esc(v.leveling.maxLevel)}"></div>
<div><label for="showMovers">"Leveled today" rows</label><input type="number" id="showMovers" name="showMovers" min="0" max="10" value="${esc(v.leveling.showMovers)}"></div>
<div><label for="color">Embed color</label><input type="color" id="color" name="color" value="${esc(v.color)}" style="width:100%;height:38px;border:1px solid var(--line);border-radius:8px;background:var(--bg)"></div>
</div>
<label class="check" style="margin-top:20px"><input type="checkbox" name="enabled"${v.enabled ? ' checked' : ''}> Keep the embed updated in Discord</label>
<div class="actions"><button class="btn" name="action" value="check">Check guild</button><button class="btn primary" name="action" value="save">Save</button></div>
</form>
${preview ? `<div class="card"><h2>Preview</h2>${embedPreview(preview)}</div>` : ''}`;
  return page(`${server.name} settings`, body, user, csrf);
}

export function errorPage(status, text, user, csrf) {
  return page('Guild tracker', `<div class="card"><h2>${status === 404 ? 'Not found' : 'Something went wrong'}</h2><p>${esc(text)}</p><a class="btn" href="/">Back to your servers</a></div>`, user, csrf);
}
