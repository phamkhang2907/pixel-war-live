import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { io } from "socket.io-client";
test("real server restart retains completed history, LIVE and season merit/wins/draws", async () => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const directory = await mkdtemp(join(tmpdir(), "pixel-restart-"));
  const base = `http://127.0.0.1:${port}`,
    headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer restart-test-token",
    };
  let server, socket, latest;
  const wait = async (fn) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("Restart integration timeout");
  };
  const start = async () => {
    latest = null;
    server = spawn(process.execPath, ["src/server.js"], {
      cwd: new URL("../", import.meta.url),
      env: {
        ...process.env,
        PORT: String(port),
        ADMIN_TOKEN: "restart-test-token",
        DATA_DIR: directory,
      },
      stdio: "ignore",
    });
    await wait(() =>
      fetch(base + "/health")
        .then((r) => r.ok)
        .catch(() => false),
    );
    socket = io(base);
    socket.on("state", (s) => (latest = s));
    await wait(() => latest !== null);
  };
  const stop = async () => {
    socket?.disconnect();
    if (server) {
      const closed = once(server, "exit");
      server.kill("SIGTERM");
      await closed;
      server = null;
    }
  };
  const command = async (action, data = {}) => {
    const response = await fetch(base + "/api/control", {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...data }),
    });
    assert.equal(response.status, 200, await response.text());
  };
  try {
    await start();
    await command("auto");
    await command("roundConfig", {
      config: {
        duration: 1,
        prepare: 0,
        final: 0,
        results: 3,
        countdown: 1,
        season: "integration-season",
      },
    });
    await command("newRound");
    await command("troop", {
      team: 0,
      type: "sword",
      count: 1,
      name: "Persistent Player",
      userId: "persistent",
    });
    await wait(() => latest.roundState.phase === "results");
    await command("pause");
    await wait(() => latest.paused);
    const id = latest.roundState.id,
      session = latest.roundState.sessionId;
    assert.equal(latest.roundState.result.winner, null);
    await stop();
    await start();
    assert.equal(latest.roundState.sessionId, session);
    for (const scope of ["live", "season"]) {
      const p = latest.roundState.boards[scope].find(
        (p) => p.id === "demo:0:persistent",
      );
      assert.equal(p.points, 5);
      assert.equal(p.draws, 1);
      assert.equal(p.rounds, 1);
      assert.equal(p.wins, 0);
    }
    const history = await fetch(base + "/api/history", { headers }).then((r) =>
      r.json(),
    );
    assert.equal(history.rounds.filter((r) => r.id === id).length, 1);
    console.log(
      "Actual SIGTERM -> restart: season/session merit and one completed result retained",
    );
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
