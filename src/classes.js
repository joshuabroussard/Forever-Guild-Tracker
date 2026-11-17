// WoW Forever's classes, keyed by Blizzard's playable-class id.
export const CLASSES = {
  1: { slug: 'warrior', name: 'Warrior', color: 0xc69b6d, fallback: '🟤' },
  2: { slug: 'paladin', name: 'Paladin', color: 0xf48cba, fallback: '🩷' },
  3: { slug: 'hunter', name: 'Hunter', color: 0xaad372, fallback: '🟢' },
  4: { slug: 'rogue', name: 'Rogue', color: 0xfff468, fallback: '🟡' },
  5: { slug: 'priest', name: 'Priest', color: 0xffffff, fallback: '⚪' },
  7: { slug: 'shaman', name: 'Shaman', color: 0x0070dd, fallback: '🔵' },
  8: { slug: 'mage', name: 'Mage', color: 0x3fc7eb, fallback: '🩵' },
  9: { slug: 'warlock', name: 'Warlock', color: 0x8788ee, fallback: '🟣' },
  11: { slug: 'druid', name: 'Druid', color: 0xff7c0a, fallback: '🟠' },
};

export function emojiName(classId) {
  return `wow_${CLASSES[classId]?.slug || 'unknown'}`;
}

// The icon for a character's class: the bot's uploaded class emoji when it
// has one, otherwise a colored circle in the class color.
export function classIcon(classId, emojis = {}) {
  return emojis[classId] || CLASSES[classId]?.fallback || '⚫';
}
