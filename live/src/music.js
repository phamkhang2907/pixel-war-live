import express from "express";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  unlink,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export const MUSIC_LIMIT = 12 * 1024 * 1024;
export function audioFormat(b) {
  if (!Buffer.isBuffer(b) || b.length < 32 || b.length > MUSIC_LIMIT)
    return null;
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WAVE"
  )
    return { ext: "wav", mime: "audio/wav" };
  if (
    b.toString("ascii", 0, 3) === "ID3" ||
    (b[0] === 255 && (b[1] & 0xe0) === 0xe0)
  )
    return { ext: "mp3", mime: "audio/mpeg" };
  if (b.toString("ascii", 4, 8) === "ftyp")
    return { ext: "m4a", mime: "audio/mp4" };
  if (b.toString("ascii", 0, 4) === "OggS")
    return { ext: "ogg", mime: "audio/ogg" };
  return null;
}
export async function mountMusic(app, { auth, directory, changed = () => {} }) {
  const root = resolve(directory, "music"),
    meta = join(root, "active.json");
  let track = null,
    busy = false;
  try {
    track = JSON.parse(await readFile(meta, "utf8"));
    if (track && !/^[a-f0-9-]{36}\.(mp3|wav|m4a|ogg)$/.test(track.file))
      throw Error("Invalid saved music filename");
    if (track) await stat(join(root, track.file));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    track = null;
  }
  const manifest = () => ({
    track: track
      ? {
          id: track.id,
          name: track.name,
          url: "/media/music/" + track.file,
          mime: track.mime,
          bytes: track.bytes,
          uploadedAt: track.uploadedAt,
        }
      : null,
  });
  app.get("/api/music", (_, res) =>
    res.set("Cache-Control", "no-store").json(manifest()),
  );
  app.get("/media/music/:file", (req, res) => {
    if (!/^[a-f0-9-]{36}\.(mp3|wav|m4a|ogg)$/.test(req.params.file))
      return res.sendStatus(404);
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(
      req.params.file,
      { root, maxAge: "1y", immutable: true },
      (e) => {
        if (e && !res.headersSent) res.sendStatus(404);
      },
    );
  });
  const lock = (req, res, next) => {
    if (busy)
      return res
        .status(429)
        .json({ error: "Another music upload is in progress" });
    busy = true;
    let released = false;
    const done = () => {
      if (!released) {
        released = true;
        busy = false;
      }
    };
    res.once("finish", done);
    res.once("close", done);
    next();
  };
  app.post(
    "/api/admin/music",
    auth,
    lock,
    express.raw({ type: () => true, limit: MUSIC_LIMIT }),
    async (req, res) => {
      const format = audioFormat(req.body);
      if (!format)
        return res.status(400).json({
          error: "Use a valid MP3, WAV, M4A or OGG file, up to 12 MiB",
        });
      let name = "Background music";
      try {
        name = decodeURIComponent(req.get("X-Filename") || name)
          .replace(/[/\\<>\x00-\x1f]/g, "_")
          .slice(0, 100);
      } catch {
        return res.status(400).json({ error: "Invalid filename" });
      }
      const id = randomUUID(),
        file = id + "." + format.ext;
      await mkdir(root, { recursive: true });
      try {
        const next = {
          id,
          file,
          name,
          mime: format.mime,
          bytes: req.body.length,
          uploadedAt: new Date().toISOString(),
        };
        await writeFile(join(root, file + ".tmp"), req.body, { mode: 0o600 });
        await rename(join(root, file + ".tmp"), join(root, file));
        await writeFile(meta + ".tmp", JSON.stringify(next), { mode: 0o600 });
        await rename(meta + ".tmp", meta);
        track = next;
        changed(manifest());
        // Keep one previous upload for in-flight range requests; storage remains bounded.
        const files = (
          await Promise.all(
            (await readdir(root))
              .filter((f) => /^[a-f0-9-]{36}\.(mp3|wav|m4a|ogg)$/.test(f))
              .map(async (f) => ({
                f,
                at: (await stat(join(root, f))).mtimeMs,
              })),
          )
        ).sort((a, b) => b.at - a.at);
        for (const old of files.slice(2)) await unlink(join(root, old.f));
        res.status(201).json(manifest());
      } catch (e) {
        res.status(500).json({ error: "Could not save background music" });
      }
    },
  );
  app.delete("/api/admin/music", auth, lock, async (_, res) => {
    try {
      await mkdir(root, { recursive: true });
      await writeFile(meta + ".tmp", "null", { mode: 0o600 });
      await rename(meta + ".tmp", meta);
      track = null;
      changed(manifest());
      res.json(manifest());
    } catch {
      res.status(500).json({ error: "Could not restore default music" });
    }
  });
  app.use("/api/admin/music", (error, req, res, next) => {
    if (error?.type === "entity.too.large")
      return res.status(413).json({ error: "Maximum music size is 12 MiB" });
    next(error);
  });
  return { manifest };
}
