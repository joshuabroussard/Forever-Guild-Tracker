// Discord sign-in (OAuth2 authorization code flow) for the settings site.
const API = 'https://discord.com/api/v10';
const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

export class DiscordOAuth {
  constructor({ clientId, clientSecret, redirectUri, fetchImpl = globalThis.fetch }) {
    Object.assign(this, { clientId, clientSecret, redirectUri });
    this.fetch = fetchImpl;
  }

  authorizeUrl(state) {
    const q = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: 'identify guilds',
      state,
      prompt: 'none',
    });
    return `https://discord.com/oauth2/authorize?${q}`;
  }

  // Link that adds the bot to one server, with that server already picked.
  inviteUrl(serverId, permissions) {
    const q = new URLSearchParams({
      client_id: this.clientId,
      scope: 'bot applications.commands',
      permissions: String(permissions),
      guild_id: serverId,
      disable_guild_select: 'true',
    });
    return `https://discord.com/oauth2/authorize?${q}`;
  }

  async exchange(code) {
    const res = await this.fetch(`${API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });
    if (!res.ok) throw new Error(`Discord sign-in failed (${res.status}).`);
    return res.json();
  }

  async api(path, accessToken) {
    const res = await this.fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Discord API ${res.status} on ${path}`);
    return res.json();
  }

  user(accessToken) {
    return this.api('/users/@me', accessToken);
  }

  async manageableServers(accessToken) {
    const guilds = await this.api('/users/@me/guilds', accessToken);
    return guilds.filter(canManageFromList).map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
  }
}

// First pass from Discord's own server list. The bot re-checks live before
// any settings are shown or saved.
export function canManageFromList(g) {
  if (g.owner) return true;
  const p = BigInt(g.permissions || 0);
  return (p & ADMINISTRATOR) !== 0n || (p & MANAGE_GUILD) !== 0n;
}
