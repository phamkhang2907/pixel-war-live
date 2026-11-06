import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => JSON.parse(readFileSync(root + p));
const hash = (p) =>
  createHash("sha256")
    .update(readFileSync(root + p))
    .digest("hex");
test("four independent Nature archives retain hashes; all 68 glTF dependencies exist unchanged", () => {
  const m = read("public/assets/3d/nature/stylized/manifest.json");
  assert.equal(m.archives.length, 4);
  assert.equal(m.models.length, 68);
  assert.equal(m.license, "CC0-1.0");
  for (const a of m.archives) {
    assert.equal(a.archiveType, "independent ZIP");
    assert.equal(hash(a.file), a.sha256);
  }
  for (const model of m.models) {
    const j = read("public/assets/3d/nature/stylized/" + model.path);
    assert.ok(model.triangles > 0);
    for (const p of model.dependencies) {
      assert.ok(existsSync(root + "public/assets/3d/nature/stylized/" + p));
      assert.equal(hash("public/assets/3d/nature/stylized/" + p), m.files[p]);
    }
    for (const b of j.buffers) {
      if (b.uri && !b.uri.startsWith("data:"))
        assert.equal(
          readFileSync(
            root +
              "public/assets/3d/nature/stylized/glTF/" +
              decodeURIComponent(b.uri),
          ).length,
          b.byteLength,
        );
    }
  }
  assert.ok(m.identicalDuplicates.includes("glTF/Flowers.png"));
});
test("Kenney originals and padded 1K sprite atlas retain provenance without Unity runtime assets", () => {
  const m = read("public/assets/3d/effects/kenney/manifest.json"),
    p = read("assets/3d/effects/derived/kenney-atlas-source.json");
  assert.equal(m.license, "CC0-1.0");
  assert.equal(m.atlas.size, 1024);
  assert.equal(Object.keys(m.atlas.tiles).length, 16);
  assert.equal(hash(m.archives[0].file), m.archives[0].sha256);
  assert.equal(
    hash("public/assets/3d/effects/kenney/atlas-1k.png"),
    p.atlasSha256,
  );
  assert.ok(Object.keys(m.files).every((f) => !f.endsWith(".unitypackage")));
  for (const t of Object.values(m.atlas.tiles))
    assert.equal(
      hash("public/assets/3d/effects/kenney/" + t.source),
      m.files[t.source],
    );
});

test("cold extraction works without Pillow and refuses an altered same-name runtime file", async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const out = mkdtempSync("/tmp/pw-visual-integrity-");
  try {
    execFileSync(
      "python3",
      ["-S", root + "tools/extract-visual-assets.py", "--output", out],
      { stdio: "pipe" },
    );
    const file = out + "/nature/stylized/glTF/CommonTree_3.gltf",
      changed = readFileSync(file, "utf8") + "\n";
    writeFileSync(file, changed);
    assert.throws(
      () =>
        execFileSync(
          "python3",
          ["-S", root + "tools/extract-visual-assets.py", "--output", out],
          { stdio: "pipe" },
        ),
      /Refusing different-content overwrite/,
    );
    assert.equal(readFileSync(file, "utf8"), changed);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
