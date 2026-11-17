// Guild-wide numbers at the top of the embed.
export const summary = {
  id: 'summary',
  label: 'Guild summary (members, at max level, average level)',
  build({ members, config }) {
    const max = config.leveling.maxLevel;
    const atMax = members.filter((m) => m.level >= max).length;
    const avg = members.length ? members.reduce((s, m) => s + m.level, 0) / members.length : 0;
    return {
      fields: [
        { name: 'Members', value: `${members.length}`, inline: true },
        { name: `At level ${max}`, value: `${atMax}`, inline: true },
        { name: 'Average level', value: avg.toFixed(1), inline: true },
      ],
    };
  },
};
