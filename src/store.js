import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_SERVER } from './config.js';

// Settings and tracking data for every Discord server, in one JSON file.
// Shape: { servers: { [discordServerId]: { ...settings, messageId, baseline, lastLevels, lastMembers, ... } } }
export class Store {
  constructor(path) {
    this.path = path;
    this.data = { servers: {} };
    if (path && existsSync(path)) {
      try {
        this.data = JSON.parse(readFileSync(path, 'utf8'));
        this.data.servers ||= {};
      } catch (e) {
        throw new Error(`Could not read ${path}: ${e.message}`);
      }
    }
  }

  get(serverId) {
    const s = this.data.servers[serverId];
    return s ? { ...DEFAULT_SERVER, ...s, leveling: { ...DEFAULT_SERVER.leveling, ...(s.leveling || {}) } } : null;
  }

  all() {
    return Object.keys(this.data.servers).map((id) => ({ id, ...this.get(id) }));
  }

  // Saves new settings from the website. Tracking data is kept unless the WoW
  // guild or region changed, and the posted message is dropped if the channel changed.
  saveSettings(serverId, settings, userId) {
    const prev = this.data.servers[serverId] || {};
    const next = { ...prev, ...settings, updatedBy: userId, updatedAt: new Date().toISOString() };
    const sameGuild = prev.guildName === settings.guildName && prev.guildSlug === settings.guildSlug && prev.region === settings.region;
    if (!sameGuild) {
      delete next.baseline;
      delete next.lastLevels;
      delete next.lastMembers;
      delete next.wowGuildDisplayName;
      delete next.lastError;
    }
    if (prev.channelId !== settings.channelId) next.messageId = null;
    this.data.servers[serverId] = next;
    this.save();
    return this.get(serverId);
  }

  // Merges tracking data written by the bot.
  patch(serverId, fields) {
    if (!this.data.servers[serverId]) return;
    Object.assign(this.data.servers[serverId], fields);
    this.save();
  }

  remove(serverId) {
    delete this.data.servers[serverId];
    this.save();
  }

  save() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.data, null, 2));
    renameSync(this.path + '.tmp', this.path);
  }
}
