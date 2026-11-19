import { classIcon } from '../classes.js';

// Ranked list: class icon, level, name, and levels gained today.
export function sortByLevel(members) {
  return [...members].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export const leveling = {
  id: 'leveling',
  label: 'Leveling list (class, level, name, levels gained today)',
  build({ members, baseline, config, emojis, link }) {
    const { top } = config.leveling;
    const sorted = sortByLevel(members);
    const width = String(sorted[0]?.level ?? 0).length;
    const lines = sorted.slice(0, top).map((m) => {
      const gained = m.level - (baseline?.levels?.[m.id] ?? m.level);
      const level = String(m.level).padStart(width, ' ');
      return `${classIcon(m.classId, emojis)} \`${level}\` **${m.name}**${gained > 0 ? ` +${gained}` : ''}`;
    });
    if (sorted.length > top) {
      const more = `and ${sorted.length - top} more`;
      lines.push(`-# ${link ? `[${more}](${link})` : more}`);
    }
    return { lines, gap: true };
  },
};
