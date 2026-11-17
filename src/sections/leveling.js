// Leveling leaderboard, level brackets and today's biggest movers.
const FIELD_MAX = 1024;

function clip(lines, limit = FIELD_MAX) {
  const out = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > limit - 20) {
      out.push(`…and ${lines.length - out.length} more`);
      break;
    }
    out.push(line);
    len += line.length + 1;
  }
  return out.join('\n') || '​';
}

export function sortByLevel(members) {
  return [...members].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export const leveling = {
  id: 'leveling',
  label: 'Leveling (top list, level brackets, leveled today)',
  build({ members, baseline, config }) {
    const { top, brackets, showMovers, maxLevel } = config.leveling;
    const sorted = sortByLevel(members);
    const gain = (m) => m.level - (baseline?.levels?.[m.id] ?? m.level);

    const topLines = sorted.slice(0, top).map((m, i) => {
      const g = gain(m);
      const tag = m.level >= maxLevel ? ' ★' : g > 0 ? ` (+${g} today)` : '';
      return `\`${String(i + 1).padStart(2)}\` **${m.name}** · ${m.className} · ${m.level}${tag}`;
    });
    if (sorted.length > top) topLines.push(`…and ${sorted.length - top} more`);

    const bracketLines = brackets.map((low, i) => {
      const high = i === 0 ? Infinity : brackets[i - 1] - 1;
      const count = members.filter((m) => m.level >= low && m.level <= high).length;
      const label = i === 0 ? `${low}` : low === high ? `${low}` : `${low}–${high}`;
      return `${label}: ${count}`;
    });

    const fields = [
      { name: 'Top levels', value: clip(topLines), inline: false },
      { name: 'By level', value: clip(bracketLines), inline: true },
    ];

    if (showMovers > 0) {
      const movers = sorted
        .map((m) => ({ m, g: gain(m) }))
        .filter((x) => x.g > 0)
        .sort((a, b) => b.g - a.g || b.m.level - a.m.level)
        .slice(0, showMovers)
        .map(({ m, g }) => `**${m.name}** +${g} (now ${m.level})`);
      fields.push({ name: 'Leveled today', value: movers.length ? clip(movers) : 'Nobody yet', inline: true });
    }
    return { fields };
  },
};
