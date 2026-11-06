import { TYPES, WORLD } from "./characters.js";
import { seeded } from "./spatial.js";
export function giftGroupPosition(
  request,
  team,
  type,
  sequence,
  slot,
  fallback,
) {
  const radius = TYPES[type].radius,
    size = Math.max(1, Math.min(16, Math.floor(16 * (13 / radius) ** 2))),
    cohort = Math.floor((sequence - request.sequenceStart) / size);
  request.groupAnchors ??= {};
  const key = String(cohort);
  if (!request.groupAnchors[key]) {
    const margin = 180,
      seed = request.sequenceStart + cohort * 771;
    request.groupAnchors[key] = {
      x:
        WORLD.castles[team] +
        (team ? -1 : 1) * (370 + (fallback.spawnBand ?? 0) * 260),
      y:
        WORLD.laneMin +
        margin +
        seeded(seed, team * 2381 + 115) *
          (WORLD.laneMax - WORLD.laneMin - 2 * margin),
      spawnBand: fallback.spawnBand ?? 0,
      radius: Math.min(
        130,
        Math.max(
          45,
          Math.sqrt(Math.min(size, request.quantity - cohort * size)) *
            radius *
            1.8,
        ),
      ),
    };
  }
  const anchor = request.groupAnchors[key],
    angle = seeded(slot + sequence, 791) * Math.PI * 2,
    distance = Math.sqrt(seeded(slot + sequence, 1471)) * anchor.radius;
  return {
    ...fallback,
    spawnBand: anchor.spawnBand,
    x: Math.max(
      WORLD.castles[0] + 260,
      Math.min(WORLD.castles[1] - 260, anchor.x + Math.cos(angle) * distance),
    ),
    y: anchor.y + Math.sin(angle) * distance,
    lane: anchor.y,
    cohort,
  };
}
