import { loadEnv } from './config.js';
import { Store } from './store.js';
import { BlizzardPool } from './tracker.js';
import { createBot } from './bot.js';
import { DiscordOAuth } from './web/discord-oauth.js';
import { createWebServer } from './web/server.js';

const env = loadEnv();
const store = new Store(env.dataFile);
const pool = new BlizzardPool({ clientId: env.blizzardClientId, clientSecret: env.blizzardClientSecret });
const bot = createBot({ env, store, pool });
const oauth = new DiscordOAuth({
  clientId: env.discordClientId,
  clientSecret: env.discordClientSecret,
  redirectUri: `${env.publicUrl}/callback`,
});
const web = createWebServer({ env, store, bot, pool, oauth, secureCookies: env.publicUrl.startsWith('https://') });

web.listen(env.port, env.host, () => console.log(`Settings site listening on http://${env.host}:${env.port} (public: ${env.publicUrl})`));
bot.start().catch((e) => {
  console.error(`Discord login failed: ${e.message}. Check DISCORD_TOKEN in .env.`);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('Shutting down.');
    web.close();
    bot.client.destroy();
    process.exit(0);
  });
}
