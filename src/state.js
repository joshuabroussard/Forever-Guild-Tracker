export function localDate(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Keeps each character's level from the start of the day, so the embed can
// show who gained levels today. At local midnight the baseline becomes the
// levels seen on the last refresh. A character seen for the first time starts
// from their current level, so they don't show a fake jump.
// Takes and returns plain data: { baseline, lastLevels }.
export function updateBaseline({ baseline, lastLevels }, members, timezone, now = new Date()) {
  const today = localDate(timezone, now);
  if (!baseline || baseline.date !== today) baseline = { date: today, levels: { ...(lastLevels || {}) } };
  else baseline = { date: baseline.date, levels: { ...baseline.levels } };
  for (const m of members) if (!(m.id in baseline.levels)) baseline.levels[m.id] = m.level;
  return { baseline, lastLevels: Object.fromEntries(members.map((m) => [m.id, m.level])) };
}
