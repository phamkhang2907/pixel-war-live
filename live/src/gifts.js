// Names are fallbacks from connector metadata; no unverified official IDs/prices.
export const SUMMONABLE = [
  "sword",
  "cavalry",
  "archer",
  "mage",
  "boss",
  "frostDragon",
  "fireDragon",
];
export const DEFAULT_GIFT_MAPPINGS = [
  {
    key: "rose",
    giftId: "",
    giftName: "Rose",
    type: "sword",
    count: 5,
    enabled: true,
  },
  {
    key: "finger-heart",
    giftId: "",
    giftName: "Finger Heart",
    type: "sword",
    count: 5,
    enabled: true,
  },
  {
    key: "doughnut",
    giftId: "",
    giftName: "Doughnut",
    type: "archer",
    count: 3,
    enabled: true,
  },
  {
    key: "perfume",
    giftId: "",
    giftName: "Perfume",
    type: "mage",
    count: 2,
    enabled: true,
  },
  {
    key: "heavy-tier",
    giftId: "",
    giftName: "",
    type: "cavalry",
    count: 1,
    enabled: false,
  },
  {
    key: "giant-tier",
    giftId: "",
    giftName: "",
    type: "boss",
    count: 1,
    enabled: false,
  },
  {
    key: "lion-frost",
    giftId: "",
    giftName: "Lion",
    type: "frostDragon",
    count: 1,
    enabled: false,
  },
  {
    key: "dragon-fire",
    giftId: "13604",
    giftName: "Rồng lửa",
    pendingVerification: true,
    type: "fireDragon",
    count: 1,
    enabled: false,
  },
  {
    key: "dragon-flame",
    giftId: "7610",
    giftName: "Dragon Flame",
    type: "fireDragon",
    count: 1,
    enabled: false,
    pendingVerification: true,
  },
  {
    key: "ice-summon",
    giftId: "6646",
    giftName: "Triệu hồi rồng băng",
    type: "frostDragon",
    count: 1,
    enabled: false,
    pendingVerification: true,
  },
];
export const CASTLE_GUARDIAN = Object.freeze({
  enabled: false,
  approvedModel: null,
  perCastle: 1,
  reason: "Approved Guardian mesh/rig/animations not supplied",
});
export const normalizeGiftName = (name) =>
  String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^donut$/, "doughnut");
export const isDragon = (type) =>
  type === "frostDragon" || type === "fireDragon";
export function verifiedDragonGift(row, catalog) {
  const observed = catalog?.get(String(row.giftId));
  return !!(
    row.giftId &&
    observed?.source === "live" &&
    normalizeGiftName(observed.giftName) === normalizeGiftName(row.giftName)
  );
}
export function validateGiftMappings(input, catalog = new Map()) {
  if (!Array.isArray(input) || input.length > 40)
    throw Error("Use at most 40 gift mappings");
  const keys = new Set(),
    ids = new Set(),
    names = new Set();
  return input.map((row) => {
    const key = String(row.key || "");
    const giftId = String(row.giftId || "").trim();
    const giftName = String(row.giftName || "").trim();
    const minCoins =
      row.minCoins == null || row.minCoins === "" ? null : Number(row.minCoins);
    if (
      !/^[\w-]{1,48}$/.test(key) ||
      keys.has(key) ||
      !SUMMONABLE.includes(row.type) ||
      !Number.isInteger(row.count) ||
      row.count < 1 ||
      row.count > 50 ||
      typeof row.enabled !== "boolean" ||
      giftName.length > 80 ||
      (giftId !== "" && !/^[1-9]\d{0,23}$/.test(giftId)) ||
      (minCoins !== null &&
        (!Number.isInteger(minCoins) || minCoins < 1 || minCoins > 100000))
    )
      throw Error(
        "Invalid mapping: automatic castle defenders cannot be gift summons",
      );
    if (
      row.enabled &&
      isDragon(row.type) &&
      (row.count !== 1 ||
        minCoins !== null ||
        !verifiedDragonGift(row, catalog))
    )
      throw Error(
        "Dragon LIVE mappings require an exact ID/name observed by the LIVE connector, count 1, and no coin threshold. Demo metadata cannot verify IDs.",
      );
    if (
      row.enabled &&
      !giftId &&
      !normalizeGiftName(giftName) &&
      minCoins === null
    )
      throw Error(
        "An enabled mapping needs an actual gift ID, metadata name or an admin-chosen coin threshold",
      );
    const name = normalizeGiftName(giftName);
    if (
      row.enabled &&
      ((giftId && ids.has(giftId)) || (name && !giftId && names.has(name)))
    )
      throw Error("Duplicate gift ID/name");
    keys.add(key);
    if (row.enabled) {
      if (giftId) ids.add(giftId);
      if (name && !giftId) names.add(name);
    }
    return {
      key,
      giftId,
      giftName,
      type: row.type,
      count: row.count,
      enabled: row.enabled,
      ...(!row.enabled && row.pendingVerification === true
        ? { pendingVerification: true }
        : {}),
      ...(minCoins !== null ? { minCoins } : {}),
    };
  });
}
export function resolveGift(mappings, { giftId, giftName, coins }) {
  const rows = mappings.filter((r) => r.enabled);
  return (
    rows.find((r) => r.giftId && r.giftId === String(giftId)) ||
    rows.find(
      (r) =>
        !r.giftId &&
        normalizeGiftName(r.giftName) &&
        normalizeGiftName(r.giftName) === normalizeGiftName(giftName),
    ) ||
    rows
      .filter((r) => r.minCoins != null && Number(coins) >= r.minCoins)
      .sort((a, b) => b.minCoins - a.minCoins)[0]
  );
}
