import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const file of [
  "game.js",
  "league.js",
  "rounds.js",
  "characters.js",
  "server.js",
  "tiktok.js",
  "tiktok-connection.js",
])
  execFileSync(process.execPath, ["--check", root + "src/" + file]);
for (const team of ["red", "blue"])
  for (const type of [
    "sword",
    "archer",
    "cavalry",
    "mage",
    "guardian",
    "boss",
  ]) {
    const png = await readFile(root + `public/assets/${team}-${type}.png`);
    if (png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512)
      throw Error("Invalid sprite sheet");
  }
await rm(root + "dist", { recursive: true, force: true });
await mkdir(root + "dist/public", { recursive: true });
await cp(root + "public", root + "dist/public", {
  recursive: true,
  filter: (path) =>
    !path.includes("preview-") &&
    !path.endsWith("app.js") &&
    !path.endsWith("arena.js"),
});
await build({
  entryPoints: [root + "public/app.js"],
  outfile: root + "dist/public/app.js",
  bundle: true,
  minify: true,
  target: ["safari15", "chrome100"],
  legalComments: "eof",
});
await writeFile(
  root + "dist/build.json",
  JSON.stringify({
    builtAt: new Date().toISOString(),
    target: "Safari 15+",
    sprites: 12,
  }),
);
console.log(
  "Built dist/public: bundled Phaser + Socket.IO, 12 animated sheets, Safari 15+ target.",
);
