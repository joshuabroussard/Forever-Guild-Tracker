import { SECTIONS } from './sections/index.js';

const MAX_DESCRIPTION = 4096;

// Builds the Discord embed. Sections return lines that go into the
// description; a section with `gap` gets a blank line before it.
export function buildEmbed({ members, baseline, config, guildName, emojis = {}, now = new Date(), error = null }) {
  const blocks = [];
  for (const id of config.sections) {
    const section = SECTIONS[id];
    if (!section) continue;
    const out = section.build({ members, baseline, config, emojis });
    if (out.lines?.length) blocks.push({ lines: out.lines, gap: out.gap });
  }

  let description = '';
  for (const b of blocks) {
    const sep = description ? (b.gap ? '\n\n' : '\n') : '';
    for (let i = 0; i < b.lines.length; i++) {
      const piece = (i === 0 ? sep : '\n') + b.lines[i];
      if (description.length + piece.length > MAX_DESCRIPTION - 40) {
        description += `\n-# list cut short, too long for Discord`;
        break;
      }
      description += piece;
    }
  }

  const embed = {
    title: `${guildName || config.guildName} · leveling`,
    description: description || 'Nothing to show yet.',
    color: parseInt(String(config.color).replace('#', ''), 16) || 0x3b82f6,
    timestamp: now.toISOString(),
  };
  if (error) embed.footer = { text: `Last update failed: ${error}. Showing the last good data.` };
  return embed;
}

export function embedLength(e) {
  return (e.title?.length || 0) + (e.description?.length || 0) + (e.footer?.text?.length || 0);
}
