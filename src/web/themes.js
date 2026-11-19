// Alternative looks for the public guild and character pages. A visitor
// picks one with ?theme=<id>; it's remembered in a cookie so it follows them
// from page to page. Each theme is plain CSS laid over the default look, so
// the markup stays the same and any theme can become the default later.
import { esc } from './views.js';

const SERIF = 'Georgia,"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",serif';
const CONDENSED = '"Bahnschrift","DIN Condensed","Arial Narrow","Roboto Condensed",system-ui,sans-serif';

export const THEMES = {
  ironforge: {
    name: 'Ironforge',
    blurb: 'Dark stone and gold, like the game\'s own menus.',
    css: `
:root{--bg:#121214;--card:#1c1b1f;--text:#ece6d6;--muted:#a59d8a;--line:#3b3528;--accent:#e2b558;--ok:#7fd36b;--bad:#e0605a;--embed:#17161a}
body{background:radial-gradient(ellipse at top,#2a2418 0%,#121214 60%) fixed;font-family:${SERIF}}
header h1{font-variant:small-caps;letter-spacing:.06em;color:#e2b558;font-size:26px}
h2{color:#e2b558;font-variant:small-caps;letter-spacing:.05em;font-weight:600;border-bottom:1px solid #4a3f28;padding-bottom:6px}
.card{border:1px solid #5a4a2a;box-shadow:inset 0 0 0 3px #1c1b1f,inset 0 0 0 4px #3b3121,0 6px 18px #0008;border-radius:6px;background:linear-gradient(#211f24,#19181c)}
.chip{border-color:#4d4230;background:#ffffff06}.stat b{color:#f3d58c;font-size:30px}
.bar{background:#2c271d;height:8px}table.rank a{color:#ece6d6}
.armory{border:1px solid #6b5a33;border-radius:6px;box-shadow:inset 0 0 0 3px #0d0f14,inset 0 0 0 4px #4a3f28}
.ahead h2{border:0;font-variant:small-caps}`,
  },
  questlog: {
    name: 'Quest log',
    blurb: 'Parchment and ink, like an old quest book.',
    css: `
:root{--bg:#d9c9a3;--card:#f1e5c6;--text:#3b2a17;--muted:#7a6342;--line:#c7b183;--accent:#8c2f1b;--ok:#3d6b21;--bad:#8c2f1b;--embed:#e8dab4}
body{background:#d9c9a3 radial-gradient(ellipse at center,#e6d8b4 0%,#cdb889 100%) fixed;font-family:${SERIF}}
header h1{font-size:28px;color:#5a1d10;letter-spacing:.02em}
h2{font-size:21px;color:#5a1d10;font-weight:700}
.card{border:1px solid #b89c66;border-radius:3px;box-shadow:0 1px 0 #fff8 inset,0 3px 10px #5a3d1a33;background:linear-gradient(#f4e9cd,#ead9b2)}
.chip{border-color:#b89c66;background:#fff6}.stat b{font-size:30px;color:#5a1d10}
table.rank td{border-top:1px dashed #c2a874}table.rank a{color:#3b2a17}
.bar{background:#d8c497}.gain{color:#3d6b21}
.armory{border:6px double #8a6a35;border-radius:4px}
.ahead h2{font-family:${SERIF}}`,
  },
  neon: {
    name: 'Neon raid',
    blurb: 'Esports dashboard: glass panels and glowing numbers.',
    css: `
:root{--bg:#07070d;--card:#ffffff0b;--text:#eef0ff;--muted:#9097b8;--line:#ffffff1c;--accent:#8b5cff;--ok:#2ef2a0;--bad:#ff4d7d;--embed:#ffffff08}
body{background:radial-gradient(circle at 15% 0%,#3b1d7a55,transparent 45%),radial-gradient(circle at 90% 20%,#0aa6c455,transparent 40%),#07070d fixed}
header h1{font-weight:800;letter-spacing:-.01em;background:linear-gradient(90deg,#b28cff,#3fd8ff);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{text-transform:uppercase;font-size:13px;letter-spacing:.14em;color:#9fa6ff}
.card{backdrop-filter:blur(10px);border-radius:16px;border:1px solid #ffffff1f;box-shadow:0 0 0 1px #8b5cff22,0 10px 30px #0008}
.stat b{font-size:34px;font-weight:800;background:linear-gradient(90deg,#c9b3ff,#5ee3ff);-webkit-background-clip:text;background-clip:text;color:transparent;font-variant-numeric:tabular-nums}
.chip{background:#ffffff0d;border-color:#ffffff22}
.bar{background:#ffffff14;height:8px}.bar span{box-shadow:0 0 10px currentColor}
table.rank td.lv{font-size:18px}.gain{color:#2ef2a0;text-shadow:0 0 8px #2ef2a066}
.armory{border-radius:20px;border:1px solid #8b5cff55;box-shadow:0 0 40px #8b5cff22}`,
  },
  discord: {
    name: 'Discord',
    blurb: 'Clean and compact, matching the Discord app.',
    css: `
:root{--bg:#313338;--card:#2b2d31;--text:#dbdee1;--muted:#949ba4;--line:#3f4147;--accent:#5865f2;--ok:#23a559;--bad:#f23f43;--embed:#2b2d31}
body{font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;font-size:15px}
main{max-width:860px}
header{background:#1e1f22;margin:-24px -16px 20px;padding:14px 16px;border-bottom:1px solid #111214}
header h1{font-size:17px;font-weight:700;color:#f2f3f5}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#949ba4;font-weight:700}
.card{border:0;border-radius:8px;background:#2b2d31;padding:14px 16px}
.chip{background:#1e1f22;border:0;border-radius:4px}.stat{background:#1e1f22;border-radius:8px;padding:10px 12px}.stat b{color:#f2f3f5}
table.rank td{border-top:1px solid #3f4147}table.rank tr:hover td{background:#2e3035}table.rank a{color:#f2f3f5}
.bar{background:#1e1f22}
.armory{border-radius:8px;border:0}`,
  },
  horde: {
    name: 'Horde',
    blurb: 'Bold crimson and black, big banner headings.',
    css: `
:root{--bg:#0e0606;--card:#180b0b;--text:#f6e9e6;--muted:#b39a96;--line:#3b1714;--accent:#e2332b;--ok:#f0c64a;--bad:#ff5a4f;--embed:#140909}
body{background:linear-gradient(180deg,#3a0b08 0px,#0e0606 360px) no-repeat,#0e0606}
header h1{font-family:${CONDENSED};text-transform:uppercase;letter-spacing:.08em;font-size:28px;font-weight:800;color:#fff}
h2{font-family:${CONDENSED};text-transform:uppercase;letter-spacing:.06em;font-size:19px;font-weight:800;color:#fff;display:inline-block;background:#b3201a;padding:2px 12px 2px 10px;clip-path:polygon(0 0,100% 0,94% 100%,0 100%)}
.card{border:1px solid #4a1612;border-left:4px solid #b3201a;border-radius:2px;background:linear-gradient(90deg,#1f0c0b,#140808)}
.stat b{font-family:${CONDENSED};font-size:38px;font-weight:800;color:#fff}.stat .muted{text-transform:uppercase;font-size:12px;letter-spacing:.06em}
.chip{border-radius:2px;border-color:#5a1c17;background:#2a0f0d}
.bar{background:#2e1210;border-radius:0}.bar span{border-radius:0}.gain{color:#f0c64a}
table.rank td.lv{font-family:${CONDENSED};font-size:20px}table.rank a{color:#f6e9e6}
.armory{border-radius:2px;border:1px solid #6b1d17;border-left:4px solid #b3201a}
.ahead h2{background:none;clip-path:none;padding:0;font-size:34px}`,
  },
};

export function themeCss(id) {
  return THEMES[id]?.css || '';
}

// A small bar for flipping between looks while choosing one.
export function themeBar(current, basePath) {
  const link = (id, label) => `<a href="${esc(basePath)}?theme=${esc(id)}"${id === current ? ' aria-current="true"' : ''}>${esc(label)}</a>`;
  const links = [link('default', 'Current'), ...Object.entries(THEMES).map(([id, t], i) => link(id, `${i + 1}. ${t.name}`))].join('');
  const blurb = THEMES[current]?.blurb || 'The look the site has now.';
  return `<style>.tbar{position:sticky;top:0;z-index:30;display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:8px 10px;margin:0 0 16px;background:#000c;color:#fff;border-radius:10px;font:13px/1.3 system-ui,sans-serif;backdrop-filter:blur(6px)}
.tbar a{color:#fff;text-decoration:none;padding:4px 9px;border-radius:999px;background:#ffffff1a}.tbar a[aria-current]{background:#fff;color:#000;font-weight:600}.tbar .b{flex-basis:100%;color:#ccc;font-size:12px}</style>
<nav class="tbar" aria-label="Pick a look">${links}<span class="b">${esc(blurb)}</span></nav>`;
}
