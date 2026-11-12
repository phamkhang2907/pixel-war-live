import { readFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url),
  source = new URL("assets/audio/", root),
  dest = new URL("public/assets/audio/", root);
const manifest = JSON.parse(
  await readFile(new URL("uploaded-manifest.json", source), "utf8"),
);
await mkdir(dest, { recursive: true });
for (const row of manifest.sounds) {
  const path = new URL(row.file, source),
    data = await readFile(path);
  if (createHash("sha256").update(data).digest("hex") !== row.sha256)
    throw Error("Original uploaded audio changed: " + row.file);
  await copyFile(path, new URL(row.file, dest));
}
for (const name of ["uploaded-manifest.json", "LICENSE-SOURCES.md"])
  await copyFile(new URL(name, source), new URL(name, dest));
console.log(
  "Copied three checksum-verified original MP3s and their license provenance.",
);
