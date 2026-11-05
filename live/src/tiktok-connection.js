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
  }
  async disconnect() {
    ++this.generation;
    const previous = this.connection;
    this.connection = null;
    this.mode = "demo";
    this.status = "Offline";
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
    this.mode = "connecting";
    this.status = "Connecting";
    let connection,
      timer,
      failed = false;
    const fail = () => {
      failed = true;
      if (current()) {
        this.mode = "demo";
        this.status = "TikTok unavailable · demo continues";
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
                ingest.chat(d);
              } catch {}
          });
          connection.on("gift", (d) => {
            if (current() && this.mode === "live")
              try {
                ingest.gift(d);
              } catch {}
          });
          connection.on("like", (d) => {
            if (current() && this.mode === "live")
              try {
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
      this.status = "@" + username;
    } catch (error) {
      if (current()) {
        ++this.generation;
        this.connection = null;
        this.mode = "demo";
        this.status = "TikTok unavailable · demo continues";
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
