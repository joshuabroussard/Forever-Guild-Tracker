import { SECTIONS } from './sections/index.js';

const MAX_FIELDS = 25;
const MAX_TOTAL = 6000;

export function buildEmbed({ members, baseline, config, guildName, now = new Date(), error = null }) {
  const fields = [];
  for (const id of config.sections) {
    const section = SECTIONS[id];
    if (!section) continue;
    fields.push(...section.build({ members, baseline, config }).fields);
  }

  const embed = {
    title: `${guildName || config.guildName} progress`,
    description: `WoW Forever · ${config.region.toUpperCase()}`,
    color: parseInt(String(config.color).replace('#', ''), 16) || 0x3b82f6,
    fields: fields.slice(0, MAX_FIELDS),
    footer: {
      text: error
        ? `Last update failed: ${error}. Showing the last good data.`
        : `Updates every ${config.refreshMinutes} min · characters appear at level 10 after logging out`,
    },
    timestamp: now.toISOString(),
  };

  // Discord rejects embeds over 6000 characters in total; drop fields from
  // the end until it fits.
  while (embedLength(embed) > MAX_TOTAL && embed.fields.length > 1) embed.fields.pop();
  return embed;
}

export function embedLength(e) {
  return (
    (e.title?.length || 0) +
    (e.description?.length || 0) +
    (e.footer?.text?.length || 0) +
    (e.fields || []).reduce((s, f) => s + f.name.length + f.value.length, 0)
  );
}
