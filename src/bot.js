import {
  Client, GatewayIntentBits, Events, MessageFlags, ChannelType,
  PermissionFlagsBits, SlashCommandBuilder,
} from 'discord.js';
import { refreshServer } from './tracker.js';
import { CLASSES, emojiName } from './classes.js';

// What the bot needs in the channel it posts to.
export const BOT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.PinMessages;

const NEEDED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
];

const COMMANDS = [
  new SlashCommandBuilder()
    .setName('guild')
    .setDescription('WoW guild progress')
    .addSubcommand((s) => s.setName('refresh').setDescription('Update the progress embed now'))
    .addSubcommand((s) => s.setName('settings').setDescription('Get the link to this server\'s settings page'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
];

export function createBot({ env, store, pool }) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const busy = new Set();
  // classId -> '<:wow_druid:123>' once the class icons are uploaded.
  const classEmojis = {};

  // Uploads Blizzard's class icons as the bot's own application emoji (once),
  // so the embed can show them in any server without Manage Emojis.
  async function ensureClassEmojis() {
    try {
      const existing = await client.application.emojis.fetch();
      const blizzard = pool.for('us');
      for (const [id] of Object.entries(CLASSES)) {
        const name = emojiName(id);
        let emoji = existing.find((e) => e.name === name);
        if (!emoji) {
          const url = await blizzard.getClassIconUrl(id).catch(() => null);
          if (!url) continue;
          emoji = await client.application.emojis.create({ attachment: url, name }).catch((e) => {
            console.error(`Could not upload ${name}:`, e.message);
            return null;
          });
        }
        if (emoji) classEmojis[id] = `<:${emoji.name}:${emoji.id}>`;
      }
      console.log(`Class icons ready: ${Object.keys(classEmojis).length} of ${Object.keys(CLASSES).length}.`);
    } catch (e) {
      console.error('Class icons unavailable, using colored dots:', e.message);
    }
  }

  // Posts the embed the first time, then keeps editing that same message.
  async function publish(serverId) {
    if (busy.has(serverId)) return { ok: false, reason: 'An update is already running.' };
    const server = store.get(serverId);
    if (!server?.enabled || !server.channelId) return { ok: false, reason: 'Tracking is off or no channel is set.' };
    busy.add(serverId);
    try {
      const { embed, patch, error } = await refreshServer(pool, server, { refreshMinutes: env.refreshMinutes, emojis: classEmojis });
      store.patch(serverId, patch);
      const channel = await client.channels.fetch(server.channelId).catch(() => null);
      if (!channel?.isTextBased()) {
        store.patch(serverId, { lastError: 'The bot can\'t see the chosen channel any more.' });
        return { ok: false, reason: 'I can\'t see that channel any more. Pick another on the settings page.' };
      }
      let message = server.messageId ? await channel.messages.fetch(server.messageId).catch(() => null) : null;
      if (message) {
        await message.edit({ embeds: [embed] });
      } else {
        message = await channel.send({ embeds: [embed] });
        store.patch(serverId, { messageId: message.id });
        await message.pin().catch(() => store.patch(serverId, { lastError: 'Posted, but the bot can\'t pin. Give it Pin Messages or pin it yourself.' }));
      }
      return { ok: !error, reason: error };
    } catch (e) {
      console.error(`[${serverId}] publish failed:`, e.message);
      store.patch(serverId, { lastError: e.message });
      return { ok: false, reason: e.message };
    } finally {
      busy.delete(serverId);
    }
  }

  async function publishAll() {
    for (const { id } of store.all()) {
      if (!client.guilds.cache.has(id)) continue;
      await publish(id);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // Text channels in a server where the bot can post the embed.
  function postableChannels(serverId) {
    const guild = client.guilds.cache.get(serverId);
    if (!guild) return [];
    const me = guild.members.me;
    return guild.channels.cache
      .filter((c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && me && c.permissionsFor(me).has(NEEDED))
      .sort((a, b) => a.rawPosition - b.rawPosition)
      .map((c) => ({ id: c.id, name: c.name }));
  }

  // True when this Discord user can manage the server, checked live through
  // the bot so the website never trusts a stale list.
  async function canManage(serverId, userId) {
    const guild = client.guilds.cache.get(serverId);
    if (!guild) return false;
    const member = await guild.members.fetch(userId).catch(() => null);
    return !!member && member.permissions.has(PermissionFlagsBits.ManageGuild);
  }

  client.once(Events.ClientReady, async (c) => {
    console.log(`Bot logged in as ${c.user.tag}, in ${c.guilds.cache.size} servers.`);
    await ensureClassEmojis();
    await c.application.commands.set(COMMANDS).catch((e) => console.error('Could not register commands:', e.message));
    await publishAll();
    setInterval(publishAll, env.refreshMinutes * 60_000);
  });

  client.on(Events.GuildDelete, (guild) => {
    // Bot was removed from a server; stop tracking it but keep settings.
    if (store.get(guild.id)) store.patch(guild.id, { messageId: null });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'guild') return;
    const sub = interaction.options.getSubcommand();
    const link = `${env.publicUrl}/servers/${interaction.guildId}`;
    if (sub === 'settings') {
      return interaction.reply({ content: `Settings for this server: ${link}`, flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await publish(interaction.guildId);
    await interaction.editReply(result.ok ? 'Updated.' : `${result.reason} Settings: ${link}`);
  });

  return {
    client,
    publish,
    postableChannels,
    canManage,
    botPermissions: BOT_PERMISSIONS,
    classEmojis: () => classEmojis,
    ensureClassEmojis,
    botPresent: (id) => client.guilds.cache.has(id),
    serverName: (id) => client.guilds.cache.get(id)?.name,
    start: () => client.login(env.discordToken),
  };
}
