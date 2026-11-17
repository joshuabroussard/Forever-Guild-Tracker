import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Sessions, parseCookies, cookie, safeEqual } from './session.js';
import { landingPage, serverListPage, settingsPage, errorPage, esc } from './views.js';
import { DEFAULT_SERVER, normalizeServerForm } from '../config.js';
import { checkGuild } from '../tracker.js';
import { buildEmbed } from '../embed.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https://cdn.discordapp.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
const GUILD_LIST_TTL = 30_000;

// bot: { botPresent(id), postableChannels(id), canManage(id, userId), publish(id), botPermissions }
export function createWebServer({ env, store, bot, pool, oauth, secureCookies = true }) {
  const sessions = new Sessions(env.sessionSecret);
  const origin = new URL(env.publicUrl).origin;

  function send(res, status, html, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
    res.end(html);
  }
  function redirect(res, location, headers = {}) {
    res.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers });
    res.end();
  }

  async function readForm(req) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 16_384) throw Object.assign(new Error('Form too large'), { status: 413 });
    }
    const params = new URLSearchParams(body);
    const form = {};
    for (const key of new Set(params.keys())) {
      const all = params.getAll(key);
      form[key] = all.length > 1 ? all : all[0];
    }
    return form;
  }

  // POSTs must come from our own pages and carry the session's CSRF token.
  function checkPost(req, session, form) {
    const o = req.headers.origin;
    if (o && o !== origin) return false;
    return safeEqual(form.csrf, session.csrf);
  }

  async function refreshGuildList(session) {
    if (Date.now() - (session.guildsAt || 0) < GUILD_LIST_TTL) return;
    try {
      session.guilds = await oauth.manageableServers(session.accessToken);
      session.guildsAt = Date.now();
    } catch (e) {
      console.error('Could not refresh server list:', e.message);
    }
  }

  function settingsFor(serverId) {
    return store.get(serverId) || { ...DEFAULT_SERVER };
  }

  function previewFor(settings) {
    if (!settings.lastMembers?.length) return null;
    return buildEmbed({
      members: settings.lastMembers,
      baseline: settings.baseline,
      config: { ...settings, refreshMinutes: env.refreshMinutes },
      guildName: settings.wowGuildDisplayName || settings.guildName,
      emojis: bot.classEmojis ? bot.classEmojis() : {},
    });
  }

  function messageUrl(serverId, s) {
    return s.channelId && s.messageId ? `https://discord.com/channels/${serverId}/${s.channelId}/${s.messageId}` : null;
  }

  async function handle(req, res) {
    const url = new URL(req.url, origin);
    const cookies = parseCookies(req.headers.cookie);
    const session = sessions.get(cookies.sid);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    if (req.method === 'GET' && path === '/login') {
      const state = randomBytes(18).toString('base64url');
      return redirect(res, oauth.authorizeUrl(state), {
        'Set-Cookie': cookie('oauth_state', sessions.sign(state), { maxAge: 600, secure: secureCookies }),
      });
    }

    if (req.method === 'GET' && path === '/callback') {
      const expected = sessions.unsign(cookies.oauth_state);
      const clear = cookie('oauth_state', '', { maxAge: 0, secure: secureCookies });
      if (url.searchParams.get('error')) return redirect(res, '/', { 'Set-Cookie': clear });
      if (!expected || !safeEqual(expected, url.searchParams.get('state'))) {
        return send(res, 400, errorPage(400, 'Sign-in expired or was started somewhere else. Try again.'), { 'Set-Cookie': clear });
      }
      const token = await oauth.exchange(url.searchParams.get('code') || '');
      const user = await oauth.user(token.access_token);
      const sid = sessions.create({
        user: { id: user.id, username: user.global_name || user.username },
        accessToken: token.access_token,
        guilds: [],
        guildsAt: 0,
      });
      return redirect(res, '/', {
        'Set-Cookie': [clear, cookie('sid', sid, { maxAge: 86400, secure: secureCookies })],
      });
    }

    if (!session) {
      if (req.method === 'GET' && path === '/') return send(res, 200, landingPage());
      return redirect(res, '/login');
    }
    const { user, csrf } = session;

    if (req.method === 'POST' && path === '/logout') {
      const form = await readForm(req);
      if (!checkPost(req, session, form)) return send(res, 403, errorPage(403, 'That form expired. Go back and try again.', user, csrf));
      sessions.destroy(cookies.sid);
      return redirect(res, '/', { 'Set-Cookie': cookie('sid', '', { maxAge: 0, secure: secureCookies }) });
    }

    if (req.method === 'GET' && path === '/') {
      await refreshGuildList(session);
      const servers = (session.guilds || []).map((g) => {
        const s = store.get(g.id);
        return {
          ...g,
          botPresent: bot.botPresent(g.id),
          configured: !!s?.guildName,
          enabled: !!s?.enabled,
          guildName: s?.guildName,
          inviteUrl: oauth.inviteUrl(g.id, bot.botPermissions),
        };
      });
      servers.sort((a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name));
      return send(res, 200, serverListPage({ user, csrf, servers }));
    }

    const m = path.match(/^\/servers\/(\d{15,22})$/);
    if (m) {
      const serverId = m[1];
      if (!bot.botPresent(serverId)) {
        return send(res, 404, errorPage(404, 'The bot isn\'t in that server yet. Add it from your server list first.', user, csrf));
      }
      if (!(await bot.canManage(serverId, user.id))) {
        return send(res, 403, errorPage(403, 'You need the Manage Server permission in that server.', user, csrf));
      }
      const listed = (session.guilds || []).find((g) => g.id === serverId);
      const server = { id: serverId, name: bot.serverName(serverId) || listed?.name || 'Server', icon: listed?.icon };
      const channels = bot.postableChannels(serverId);

      if (req.method === 'GET') {
        const settings = settingsFor(serverId);
        const notice = url.searchParams.get('saved')
          ? { ok: true, text: settings.enabled ? 'Saved. The embed will update in Discord in a moment.' : 'Saved. Tracking is off, so nothing is posted.' }
          : null;
        return send(res, 200, settingsPage({ user, csrf, server, settings, channels, notice, preview: previewFor(settings), messageUrl: messageUrl(serverId, settings) }));
      }

      if (req.method === 'POST') {
        const form = await readForm(req);
        if (!checkPost(req, session, form)) return send(res, 403, errorPage(403, 'That form expired. Go back and try again.', user, csrf));
        const current = settingsFor(serverId);

        if (form.action === 'check') {
          const { value } = normalizeServerForm(form, channels.map((c) => c.id));
          const shown = { ...current, ...value };
          const result = value.guildName ? await checkGuild(pool, value) : { ok: false, error: 'enter a guild name first' };
          const notice = result.ok
            ? { ok: true, html: `Found <b>${esc(result.name)}</b> with ${result.count} characters (slug <code>${esc(result.slug)}</code>). Save to start tracking.` }
            : { ok: false, text: `Couldn't find it: ${result.error}.` };
          return send(res, 200, settingsPage({ user, csrf, server, settings: shown, channels, notice, preview: previewFor(current), messageUrl: messageUrl(serverId, current) }));
        }

        const { errors, value } = normalizeServerForm(form, channels.map((c) => c.id));
        if (errors.length) {
          const notice = { ok: false, html: errors.map(esc).join('<br>') };
          return send(res, 422, settingsPage({ user, csrf, server, settings: { ...current, ...value }, channels, notice, preview: previewFor(current), messageUrl: messageUrl(serverId, current) }));
        }
        store.saveSettings(serverId, value, user.id);
        if (value.enabled) bot.publish(serverId).catch((e) => console.error(e));
        return redirect(res, `/servers/${serverId}?saved=1`);
      }
    }

    return send(res, 404, errorPage(404, 'That page doesn\'t exist.', user, csrf));
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, e.status || 500, errorPage(e.status || 500, e.status === 413 ? 'That form was too large.' : 'Please try again.'));
      else res.end();
    });
  });
}
