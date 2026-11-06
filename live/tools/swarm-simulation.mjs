import { Battle } from "../src/game.js";
import { writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
const runs = [];
for (const requested of [200, 500, 1000, 2000]) {
  const b = new Battle({ maxUnits: 2000 });
  for (const team of [0, 1])
    for (let i = 0; i < requested / 2; i++)
      b.spawn(
        team,
        i % 24 === 0
          ? "mage"
          : i % 12 === 0
            ? "cavalry"
            : i % 8 === 0
              ? "archer"
              : "sword",
        1,
        "CPU fixture",
        null,
      );
  // Preserve the organic offsets while bringing both fronts into active engagement.
  for (const u of b.units) {
    u.x += u.team === 0 ? 1500 : -1500;
    u.hp = u.maxHp = 1e9; // Benchmark fixture only: hold the requested active count.
  }
  const ticks = [],
    snapshots = [];
  let bytes = 0;
  for (let i = 0; i < 220; i++) {
    const start = performance.now();
    b.tick(0.05);
    const end = performance.now();
    const snapshot = JSON.stringify(b.snapshot());
    const finish = performance.now();
    if (i >= 20) {
      ticks.push(end - start);
      snapshots.push(finish - end);
    }
    bytes = snapshot.length;
  }
  const stats = (a) => {
    a.sort((x, y) => x - y);
    return {
      p50: a[Math.floor(a.length * 0.5)],
      p95: a[Math.floor(a.length * 0.95)],
      max: a.at(-1),
    };
  };
  runs.push({
    requested,
    remaining: b.units.length,
    simulationTickMs: stats(ticks),
    snapshotSerializeMs: stats(snapshots),
    lastSnapshotBytes: bytes,
  });
}
const report = {
  device: {
    platform: os.platform(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model,
    node: process.version,
  },
  simulatedSeconds: 11,
  samplesPerRun: 200,
  note: "Isolated Battle simulation and snapshot JSON; immortal ownerless fixtures hold the requested count; excludes HTTP, Socket.IO compression, persistence worker and GPU rendering.",
  runs,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/swarm-simulation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
