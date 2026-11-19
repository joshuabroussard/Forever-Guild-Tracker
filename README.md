# Guild tracker

A Discord bot plus a small settings website for WoW Forever guilds. Each Discord
server links to one WoW guild, and the bot keeps a pinned embed in a chosen
channel up to date with the guild's leveling progress.

- Settings site: Discord sign-in, then pick a server you manage, add the bot,
  and set the WoW guild name, region, channel and what the embed shows.
- Bot: pulls each guild's roster from Blizzard every 15 minutes and edits its
  embed: one ranked line per character with its class icon, level and levels
  gained today. The bot uploads the class icons as its own emoji on first start.
  `/guild refresh` updates it now; `/guild settings` links the settings page.
- Public guild page: the embed's title (and its "and N more" line) opens
  `https://wow.chille.sh/g/{region}/{guild-slug}`, with the guild's stats,
  who leveled today, a class breakdown and the full ranked roster. Each name
  opens an armory-style character page: the character's render with gear
  down both sides like the official armory, item icons, quality colors, a
  full tooltip per item (hover or tap), and the character sheet stats. Turn it off per server on the settings page.
- Dungeon first clears: the guild page lists, per dungeon, who still needs a
  first clear (and who got partway), skipping characters below its entry
  level. Each character page shows their cleared and still-to-do dungeons.
  Read from `/encounters/dungeons` about once an hour; only dungeons someone
  in the guild has run are listed, since Blizzard only reports those.
- One Node process runs both, on `127.0.0.1:3000`, with nginx in front.

## Where the data comes from

Blizzard's Profile API, namespace `profile-forever-{region}`, route
`/data/wow/guild/{guild-slug}/roster`. Blizzard hasn't documented the Forever
API yet; this is what the community confirmed after launch, so it may change.
Things to know:

- Forever has no realms, so a guild is found by name (as a slug) and region.
- The slug is guessed as lowercase, apostrophes dropped, spaces to hyphens. If
  "Check guild" can't find yours, set the slug by hand on the settings page.
- Blizzard updates a character when they log out, so changes show up after that.

The roster lags behind real levels, so the roster only decides who is in the
guild and each level comes from that character's profile
(`/profile/wow/character/{name}-{surname}`), four lookups at a time. Character
pages also read `/equipment`, `/character-media` and `/statistics`, cached for
10 minutes, and only for characters on a tracked roster. Item icons come from
`/data/wow/media/item/{id}` (Forever, then Classic Era, then retail) and are
kept for a day.

If dungeons come up empty, the log says why (`journalctl -u guild-tracker`),
and `npm run probe -- --guild "Guild Name" --raw` prints Blizzard's full
dungeon answer for the guild's top character.

## Adding more to the embed later

Each part of the embed is a section in `src/sections/`. To add raids, gear or
professions, write a new file with an `id`, a `label` and a `build()` that
returns `{ lines }` (lines of Discord markdown for the embed), and register it in `src/sections/index.js`. It then shows
up as a checkbox on the settings page.

## Setup on chille

These steps assume chille runs Linux with nginx and certbot.

### 1. Discord application

1. Go to the Discord Developer Portal and create an application.
2. **Bot**: press Reset Token and copy it (`DISCORD_TOKEN`). No privileged
   intents are needed.
3. **OAuth2**: copy the Client ID and Client Secret (`DISCORD_CLIENT_ID`,
   `DISCORD_CLIENT_SECRET`), and add the redirect
   `https://wow.chille.sh/callback`.

### 2. Blizzard API client

On develop.battle.net, open API Access and create a client. Copy its ID and
secret (`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`).

### 3. DNS and ports

Point `wow.chille.sh` at chille's public IP, and forward ports 80 and 443 to
chille if it's behind a router.

### 4. Install the app

Needs Node 22 or newer.

```
git clone https://github.com/joshuabroussard/Forever-Guild-Tracker.git ~/guild-tracker
cd ~/guild-tracker
npm install --omit=dev
npm test
cp .env.example .env && chmod 600 .env
nano .env    # fill in the five keys and a SESSION_SECRET
mkdir -p data
```

### 5. nginx and HTTPS

```
sudo cp deploy/nginx-wow.chille.sh.conf /etc/nginx/sites-available/wow.chille.sh
sudo ln -s /etc/nginx/sites-available/wow.chille.sh /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d wow.chille.sh
sudo nginx -t && sudo systemctl reload nginx
```

If certbot complains that the certificate files don't exist yet, comment out
the `listen 443` server block, reload nginx, run certbot, then put it back.

### 6. Run it on boot

```
sudo cp deploy/guild-tracker.service /etc/systemd/system/
sudo nano /etc/systemd/system/guild-tracker.service   # set User, WorkingDirectory, ReadWritePaths
sudo systemctl daemon-reload
sudo systemctl enable --now guild-tracker
journalctl -u guild-tracker -f
```

Update later with `git pull && npm install --omit=dev && sudo systemctl restart guild-tracker`.

If Node came from nvm, change `ExecStart` to the full path from `which node`.

### 7. Use it

Open https://wow.chille.sh, sign in with Discord, press **Add bot** next to
your server, refresh, then **Set up**. Enter the guild name and region, press
**Check guild**, pick a channel, tick "Keep the embed updated" and save. The
embed is posted and pinned in that channel.

The bot needs View Channel, Send Messages, Embed Links, Read Message History
and Pin Messages in that channel. The add-bot link asks for all of them.

### 8. Auto-update from GitHub (optional)

A systemd timer checks GitHub every 2 minutes. When `main` has moved and the
checkout has no local edits, it fast-forwards, runs `npm install` and the
tests, and restarts the bot only if they pass. A failing commit is rolled
back and skipped until a newer one arrives, so the running bot is never
replaced by broken code.

```
sudo cp deploy/guild-tracker-update.service deploy/guild-tracker-update.timer /etc/systemd/system/
sudo nano /etc/systemd/system/guild-tracker-update.service   # APP_DIR, APP_USER, NODE_BIN_DIR, ExecStart path
sudo systemctl daemon-reload
sudo systemctl enable --now guild-tracker-update.timer
journalctl -u guild-tracker-update -n 50     # what each check did
```

`git fetch` has to work without a password prompt as APP_USER (a public repo,
or saved GitHub credentials).

## Security notes

- Only people with Manage Server in a Discord server can change its settings.
  The site checks this live through the bot on every page and save.
- Forms carry a per-session token and must come from the site itself.
- Sessions live in memory and last 24 hours; restarting signs everyone out.
- The guild and character pages are public (like Blizzard's armory) and
  marked noindex. They show only roster and armory data, never Discord details.
- Secrets live only in `.env`. Settings and tracking data live in
  `data/servers.json`.

## Development

```
npm test     # no Discord or Blizzard keys needed
npm start    # needs a filled-in .env
```
