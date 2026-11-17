export const server = {
  enabled: true, guildName: "Ashen Oath's Watch", guildSlug: '', region: 'us', locale: 'en_US',
  timezone: 'America/Chicago', channelId: '222', color: '#3b82f6', sections: ['summary', 'leveling'],
  leveling: { maxLevel: 60, top: 25 },
};

export function roster(levels, guildName = "Ashen Oath's Watch") {
  return {
    guild: { name: guildName },
    members: Object.entries(levels).map(([name, level], i) => ({
      character: { id: i + 1, name, level, playable_class: { id: (i % 9) + 1 } },
      rank: i === 0 ? 0 : 3,
    })),
  };
}

// Fake fetch for Blizzard: token, class index, and roster (via getBody()).
export function blizzardFetch(getBody, status = 200) {
  const fn = async (url) => {
    fn.calls.push(url);
    if (url.startsWith('https://oauth.battle.net')) return { ok: true, status: 200, json: async () => ({ access_token: 't', expires_in: 86399 }) };
    if (url.includes('playable-class')) return { ok: true, status: 200, json: async () => ({ classes: [{ id: 1, name: 'Warrior' }, { id: 2, name: 'Paladin' }] }) };
    const s = typeof status === 'function' ? status(url) : status;
    return { ok: s === 200, status: s, json: async () => getBody(url) };
  };
  fn.calls = [];
  return fn;
}
