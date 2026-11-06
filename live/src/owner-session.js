import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import express from "express";
const hash = (s) => createHash("sha256").update(String(s)).digest();
const equal = (a, b) => timingSafeEqual(hash(a), hash(b));
export function ownerSessions(app, { password }) {
  const sessions = new Map(),
    rates = new Map(),
    ttl = 8 * 3600e3;
  const cookie = (req) =>
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("pw_owner="))
      ?.slice(9);
  const authenticated = (req) => {
    const id = cookie(req);
    if (!id) return false;
    const key = hash(id).toString("hex"),
      until = sessions.get(key);
    if (!until || until < Date.now()) {
      sessions.delete(key);
      return false;
    }
    return true;
  };
  const originOK = (req) => {
    const origin = req.get("origin");
    return (
      !origin ||
      origin ===
        `${req.get("x-forwarded-proto")?.split(",")[0] || req.protocol}://${req.get("host")}`
    );
  };
  const setCookie = (req, res, id, age) =>
    res.setHeader(
      "Set-Cookie",
      `pw_owner=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${req.secure || req.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`,
    );
  app.get("/owner/login", (_, res) =>
    res
      .set({
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      })
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PIXEL WAR Owner sign in</title><style>body{font:18px system-ui;background:#101b16;color:#eee;max-width:380px;margin:10vh auto;padding:24px}input,button{display:block;padding:14px;width:100%;box-sizing:border-box;margin:16px 0}</style><h1>Owner sign in</h1><p>Private access to LIVE, battle controls and configuration.</p><form method="post" action="/owner/login"><label>Owner password<input id="ownerPassword" name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Sign in</button></form><a href="/3d/?demo=1">Public Demo — no password</a></html>`,
      ),
  );
  app.post(
    "/owner/login",
    express.urlencoded({ extended: false, limit: "2kb" }),
    (req, res) => {
      res.set("Cache-Control", "no-store");
      if (!originOK(req)) return res.sendStatus(403);
      const now = Date.now(),
        key = req.ip;
      for (const [k, v] of rates) if (now - v.at > 60000) rates.delete(k);
      let rate = rates.get(key);
      if (!rate) rates.set(key, (rate = { at: now, n: 0 }));
      if (++rate.n > 8)
        return res.status(429).send("Too many attempts. Retry in one minute.");
      if (!equal(req.body?.password || "", password))
        return res.status(401).send("Sign in failed. Return to /owner/login.");
      const previous = cookie(req);
      if (previous) sessions.delete(hash(previous).toString("hex"));
      for (const [k, until] of sessions) if (until < now) sessions.delete(k);
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
      const id = randomBytes(32).toString("base64url");
      sessions.set(hash(id).toString("hex"), now + ttl);
      setCookie(req, res, id, ttl / 1000);
      res.redirect(303, "/3d/?admin=1&live=1");
    },
  );
  app.get("/api/owner/session", (req, res) =>
    res.set("Cache-Control", "no-store").json({ owner: authenticated(req) }),
  );
  app.post("/owner/logout", (req, res) => {
    if (!originOK(req)) return res.sendStatus(403);
    const id = cookie(req);
    if (id) sessions.delete(hash(id).toString("hex"));
    setCookie(req, res, "", 0);
    res.sendStatus(204);
  });
  return { authenticated, originOK };
}
