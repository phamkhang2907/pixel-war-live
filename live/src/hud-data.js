// Read-only presentation of existing scores/history. No gameplay decisions here.
export function safeAvatar(value) {
  if (typeof value !== "string" || value.length > 2048) return "";
  if (value.startsWith("/assets/") && !value.includes("..")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function calendarBoard(league, period, now = Date.now()) {
  const date = new Date(now),
    start = new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        period === "monthly" ? 1 : date.getUTCDate(),
      ),
    );
  if (period === "weekly")
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const totals = new Map();
  const records = [...league.data.history];
  if (league.data.active && !league.data.active.finished)
    records.push(league.data.active);
  const seen = new Set();
  for (const record of records) {
    const time = Date.parse(record.endedAt || new Date(now).toISOString());
    if (record.aborted || seen.has(record.id) || time < +start || time > now)
      continue;
    seen.add(record.id);
    for (const p of Object.values(record.players || {})) {
      const old = totals.get(p.id) || { ...p, points: 0 };
      totals.set(p.id, {
        ...old,
        name: p.name,
        team: p.team,
        points: old.points + p.points,
      });
    }
  }
  return {
    label: `${start.toISOString().slice(0, 10)} onward · UTC · current round included`,
    players: [...totals.values()]
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
      .slice(0, 10),
  };
}
export function hudSnapshot(game, league, now = Date.now()) {
  const profile = (p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    points: p.points,
    avatar: safeAvatar(league.data.profiles?.[p.id]?.avatar),
  });
  const weekly = calendarBoard(league, "weekly", now),
    monthly = calendarBoard(league, "monthly", now);
  const players = Object.values(league.data.active.players).sort(
    (a, b) => b.points - a.points || a.id.localeCompare(b.id),
  );
  return {
    boards: {
      round: players.slice(0, 10).map(profile),
      weekly: weekly.players.map(profile),
      monthly: monthly.players.map(profile),
    },
    teams: [0, 1].map((team) =>
      players
        .filter((p) => p.team === team)
        .slice(0, 3)
        .map(profile),
    ),
    periodLabels: { weekly: weekly.label, monthly: monthly.label },
  };
}
