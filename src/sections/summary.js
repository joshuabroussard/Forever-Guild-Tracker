// One short line under the title: how many characters, average and highest level.
export const summary = {
  id: 'summary',
  label: 'Guild summary line (characters, average and highest level)',
  build({ members }) {
    if (!members.length) return { lines: ['No characters found yet.'] };
    const avg = Math.round(members.reduce((s, m) => s + m.level, 0) / members.length);
    const highest = Math.max(...members.map((m) => m.level));
    const n = members.length;
    return { lines: [`-# ${n} character${n === 1 ? '' : 's'} · average level ${avg} · highest ${highest}`] };
  },
};
