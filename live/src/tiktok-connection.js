import { TikTokIngest } from "./tiktok.js";
// The simulation never awaits this service. Generation guards discard stale connections.
export class TikTokService {
  constructor(battle, { factory, timeoutMs = 12000 } = {}) {
    this.battle = battle;
    this.factory =
      factory ||
      (async (username) => {
        const { TikTokLiveConnection } = await import("tiktok-live-connector");
        return new TikTokLiveConnection(username, {
          processInitialData: false,
          enableExtendedGiftInfo: true,
          signApiKey: process.env.EULER_API_KEY,
        });
      });
    this.timeoutMs = timeoutMs;
    this.generation = 0;
    this.mode = "demo";
    this.status = "Offline";
    this.connectionState = "disconnected";
  }
  diagnostics() {
    return {
      state: this.connectionState,
      username: this.username || "",
      message: this.status,
      hint: this.hint || "",
      lastEventAt: this.lastEventAt || null,
      received: this.received || { gifts: 0, comments: 0, likes: 0 },
      realBroadcastVerified: false,
    };
  }
  async disconnect() {
    ++this.generation;
    const previous = this.connection;
    this.connection = null;
    this.mode = "demo";
    this.status = "Offline";
    this.connectionState = "disconnected";
    this.hint = "Disconnected. Public Demo remains available separately.";
    // Some connector implementations throw during teardown; never propagate to game.
    try {
      Promise.resolve(previous?.disconnect()).catch(() => {});
    } catch {}
  }
  async connect(username) {
    if (!/^[\w.]{2,40}$/.test(username)) throw Error("Invalid TikTok username");
    await this.disconnect();
    const generation = this.generation;
    const current = () => generation === this.generation;
    this.username = username;
    this.connectionState = "connecting";
    this.hint =
      "Stream must be LIVE; some TikTok regions require a signing-service key.";
    this.received = { gifts: 0, comments: 0, likes: 0 };
    this.mode = "connecting";
    this.status = "Connecting";
    let connection,
      timer,
      failed = false;
    const fail = (error) => {
      failed = true;
      if (current()) {
        this.mode = "demo";
        this.status = "TikTok disconnected · Demo available separately";
        this.connectionState = error ? "error" : "disconnected";
        this.hint = error
          ? "Connector disconnected with an error. Check stream availability and signing access, then reconnect."
          : "LIVE connection closed. Check that the stream is still broadcasting, then reconnect.";
      }
    };
    try {
      await Promise.race([
        (async () => {
          connection = await this.factory(username);
          if (!current()) {
            try {
              await connection.disconnect();
            } catch {}
            return;
          }
          this.connection = connection;
          const ingest = new TikTokIngest(this.battle);
          connection.on("chat", (d) => {
            if (current() && this.mode === "live")
              try {
                this.received.comments++;
                this.lastEventAt = Date.now();
                ingest.chat(d);
              } catch {}
          });
          connection.on("gift", (d) => {
            if (current() && this.mode === "live")
              try {
                this.received.gifts++;
                this.lastEventAt = Date.now();
                ingest.gift(d);
              } catch {}
          });
          connection.on("like", (d) => {
            if (current() && this.mode === "live")
              try {
                this.received.likes++;
                this.lastEventAt = Date.now();
                ingest.like(d);
              } catch {}
          });
          connection.on("disconnected", fail);
          connection.on("error", fail);
          await connection.connect();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error("TikTok connection timed out")),
            this.timeoutMs,
          );
        }),
      ]);
      if (!current() || failed) throw Error("Connection cancelled");
      this.mode = "live";
      this.connectionState = "connected";
      this.hint =
        "Connected by server connector. Receipt of real gift events has not been independently verified.";
      this.status = "@" + username;
    } catch (error) {
      if (current()) {
        ++this.generation;
        this.connection = null;
        this.mode = "demo";
        this.status = "TikTok unavailable · Demo available separately";
        this.connectionState = "error";
        this.hint =
          "Check whether the stream is live, regional access, signing credentials (EULER_API_KEY), or TikTok rate limits. " +
          (/timeout|timed out/i.test(String(error?.message))
            ? "Connection timed out."
            : /offline|not live|user not found/i.test(String(error?.message))
              ? "Stream is offline or unavailable."
              : /sign|key|auth|403|401/i.test(String(error?.message))
                ? "Signing/authorization request denied."
                : "Connector or network request failed.");
        // Keep an error listener attached even during teardown.
        try {
          Promise.resolve(connection?.disconnect()).catch(() => {});
        } catch {}
      }
      throw Error("TikTok connection failed. Demo remains available.");
    } finally {
      clearTimeout(timer);
    }
  }
}
