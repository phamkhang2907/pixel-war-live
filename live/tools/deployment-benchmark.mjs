import { Battle } from "../src/game.js";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
const runs = [];
for (const batch of [8, 64, 128]) {
  const game = new Battle({ spawnBatch: batch, spawnBudgetMs: 6 });
  game.enqueue(0, "sword", 500);
  game.enqueue(1, "sword", 500);
  let ticks = 0;
  const times = [];
  while (game.summonQueue.length && ticks < 1000) {
    const t = performance.now();
    game.drainSummons();
    times.push(performance.now() - t);
    ticks++;
  }
  times.sort((a, b) => a - b);
  runs.push({
    batch,
    softBudgetMs: 6,
    units: game.units.length,
    ticks,
    at20HzSeconds: ticks * 0.05,
    deployedPerLogicalSecond: game.units.length / (ticks * 0.05),
    cpuTotalMs: times.reduce((a, b) => a + b, 0),
    cpuP95Ms: times[Math.floor(times.length * 0.95)],
    cpuMaxMs: times.at(-1),
    pending: game.summonQueue.reduce((n, q) => n + q.remaining, 0),
  });
}
const report = {
  node: process.version,
  cpu: os.cpus()[0]?.model,
  note: "Same new band placement in all runs, isolating old/new batch limits. 20Hz time is derived tick cadence; CPU times measured. Excludes rendering/networking. Active cap1000.",
  runs,
};
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/deployment-throughput.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
