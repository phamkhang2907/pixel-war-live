type Send = (
  action: string,
  data?: Record<string, unknown>,
) => Promise<boolean>;
type Mapping = {
  key: string;
  giftId: string;
  giftName: string;
  type: string;
  count: number;
  enabled: boolean;
  minCoins?: number;
};
type Config = {
  giftMappings: Mapping[];
  giftCatalog: { giftId: string; giftName: string; coins: number | null }[];
  roundConfig: { duration: number; prepare: number; final: number };
  guardian: { reason: string };
};
const labels: Record<string, string> = {
  sword: "Small Soldier · Knight",
  cavalry: "Heavy Soldier · Barbarian",
  archer: "Archer · Ranger",
  mage: "Mage",
  boss: "Giant · enlarged Barbarian",
};
export function openAdmin(
  config: Config,
  send: Send,
  reload: () => Promise<Config>,
) {
  const root = document.getElementById("adminWorkspace")!;
  root.hidden = false;
  root.innerHTML = `<h2>3D LIVE controls</h2><form id="liveConnect"><label>TikTok username<input id="liveUsername" required pattern="[\\w.]{2,40}"></label><button>Connect LIVE</button><button type="button" id="demoMode">Demo mode</button></form><p id="liveStatus"></p>
 <h3>Round settings</h3><form id="roundSettings"><label>Round seconds<input id="roundDuration" type="number" min="1" max="7200"></label><label>Preparation<input id="roundPrepare" type="number" min="0"></label><label>Final battle<input id="roundFinal" type="number" min="0"></label><button>Save next round</button></form><p>Results: 7 seconds. The next round starts directly after results.</p>
 <div class="options"><label>Demo speed<select id="simSpeed"><option>1</option><option>2</option><option>4</option><option>8</option></select></label><button id="autoDemo">Toggle auto demo gifts</button><button id="shortRound">Test 12-second round + 7-second results</button></div>
 <h3>Spawn / gift simulator · Demo only</h3><form id="spawnUnit"><label>Team<select id="unitTeam"><option value="0">RED</option><option value="1">BLUE</option></select></label><label>Unit<select id="unitKind">${Object.entries(
   labels,
 )
   .map(([k, v]) => `<option value="${k}">${v}</option>`)
   .join(
     "",
   )}</select></label><label>Quantity<input id="unitCount" type="number" min="1" max="50" value="10"></label><button>Spawn</button></form>
 <form id="giftSimulator"><label>Team<select id="giftTeam"><option value="0">RED</option><option value="1">BLUE</option></select></label><label>Viewer<input id="giftViewer" maxlength="24" value="Demo Viewer"></label><label>Gift name<input id="demoGiftName" value="Rose" list="observedGiftNames"></label><datalist id="observedGiftNames"><option>Rose</option><option>Finger Heart</option><option>Doughnut</option><option>Perfume</option></datalist><label>Actual gift ID (optional)<input id="demoGiftId"></label><label>Coins per gift (0 = unknown/demo)<input id="demoGiftCoins" type="number" min="0" max="100000" value="0"></label><label>Streak quantity<input id="demoGiftRepeats" type="number" min="1" max="1000" value="1"></label><button>Simulate streak + completion</button></form>
 <form id="likesSimulator"><label>Team<select id="likeTeam"><option value="0">RED</option><option value="1">BLUE</option></select></label><label>New likes<input id="likeCount" type="number" min="1" max="100000" value="500"></label><button>Simulate likes / Fury</button></form>
 <h3>Gift → summon mappings</h3><p>Exact gift ID takes priority. Names are matched against connector metadata. No official prices are assumed. Configure Heavy / Giant with actual gift IDs or your chosen coin thresholds. Guardian and dragons are unavailable as gifts.</p><div id="giftMappingRows"></div><button id="addGiftMapping">Add mapping</button><button id="saveGiftMappings">Save mappings</button><button id="refreshGiftCatalog">Refresh observed gift metadata</button><pre id="giftCatalog"></pre><p id="guardianStatus"></p>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    root.querySelector("#" + id) as T;
  const value = (id: string) => el<HTMLInputElement>(id).value;
  const number = (id: string) => Number(value(id));
  const input = (name: string, value: string, type = "text") => {
    const label = document.createElement("label");
    label.textContent = name;
    const i = document.createElement("input");
    i.type = type;
    i.value = value;
    label.append(i);
    return { label, input: i };
  };
  function add(row: Mapping) {
    const wrap = document.createElement("div");
    wrap.className = "gift-mapping";
    wrap.dataset.key = row.key;
    const enabled = input("Enabled", "", "checkbox");
    enabled.input.checked = row.enabled;
    enabled.input.dataset.field = "enabled";
    const id = input("Actual Gift ID", row.giftId),
      name = input("Metadata name", row.giftName),
      count = input("Unit quantity", String(row.count), "number"),
      threshold = input(
        "Optional admin coin threshold",
        row.minCoins == null ? "" : String(row.minCoins),
        "number",
      );
    for (const [field, item] of [
      ["giftId", id],
      ["giftName", name],
      ["count", count],
      ["minCoins", threshold],
    ] as const)
      item.input.dataset.field = field;
    count.input.min = "1";
    count.input.max = "50";
    threshold.input.min = "1";
    const kind = document.createElement("select");
    kind.dataset.field = "type";
    for (const [k, v] of Object.entries(labels)) {
      const o = new Option(v, k);
      kind.add(o);
    }
    kind.value = row.type;
    kind.setAttribute("aria-label", "Summoned unit");
    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.onclick = () => wrap.remove();
    wrap.append(
      enabled.label,
      id.label,
      name.label,
      kind,
      count.label,
      threshold.label,
      remove,
    );
    el("giftMappingRows").append(wrap);
  }
  config.giftMappings.forEach(add);
  const readMappings = () =>
    [...root.querySelectorAll<HTMLElement>(".gift-mapping")].map((row) => {
      const field = (f: string) =>
        row.querySelector<HTMLInputElement>('[data-field="' + f + '"]')!;
      return {
        key: row.dataset.key!,
        giftId: field("giftId").value.trim(),
        giftName: field("giftName").value.trim(),
        type: field("type").value,
        count: Number(field("count").value),
        enabled: field("enabled").checked,
        ...(field("minCoins").value
          ? { minCoins: Number(field("minCoins").value) }
          : {}),
      };
    });
  el("addGiftMapping").onclick = () =>
    add({
      key: "custom-" + Date.now(),
      giftId: "",
      giftName: "",
      type: "sword",
      count: 1,
      enabled: false,
    });
  el("saveGiftMappings").onclick = () => {
    void send("giftMappings", { mappings: readMappings() });
  };
  const catalog = (c: Config) => {
    el("giftCatalog").textContent = c.giftCatalog.length
      ? JSON.stringify(c.giftCatalog, null, 2)
      : "No LIVE gift metadata observed yet. Demo entries are for testing only.";
  };
  catalog(config);
  el("refreshGiftCatalog").onclick = async () => {
    try {
      catalog(await reload());
    } catch {
      el("giftCatalog").textContent = "Could not refresh metadata";
    }
  };
  el("guardianStatus").textContent =
    "Castle Guardian: reserved, disabled — " + config.guardian.reason;
  for (const [id, k] of [
    ["roundDuration", "duration"],
    ["roundPrepare", "prepare"],
    ["roundFinal", "final"],
  ] as const)
    el<HTMLInputElement>(id).value = String(config.roundConfig[k]);
  el("roundSettings").onsubmit = (e) => {
    e.preventDefault();
    void send("roundConfig", {
      config: {
        duration: number("roundDuration"),
        prepare: number("roundPrepare"),
        final: number("roundFinal"),
        results: 7,
        countdown: 0,
      },
    });
  };
  el("liveConnect").onsubmit = (e) => {
    e.preventDefault();
    void send("connect", { username: value("liveUsername").replace(/^@/, "") });
  };
  el("demoMode").onclick = () => {
    void send("demo");
  };
  el("autoDemo").onclick = () => {
    void send("auto");
  };
  el("shortRound").onclick = () => {
    void send("demoCycle");
  };
  el("simSpeed").onchange = () => {
    void send("speed", { value: number("simSpeed") });
  };
  el("spawnUnit").onsubmit = (e) => {
    e.preventDefault();
    void send("troop", {
      team: number("unitTeam"),
      type: value("unitKind"),
      count: number("unitCount"),
      name: "Demo Commander",
    });
  };
  el("giftSimulator").onsubmit = async (e) => {
    e.preventDefault();
    const eventId = crypto.randomUUID(),
      p = {
        team: number("giftTeam"),
        name: value("giftViewer"),
        giftId: value("demoGiftId"),
        giftName: value("demoGiftName"),
        coins: number("demoGiftCoins"),
        count: number("demoGiftRepeats"),
        streak: true,
        groupId: eventId,
        eventId,
      };
    if (await send("demoGift", { ...p, repeatEnd: false }))
      await send("demoGift", { ...p, repeatEnd: true });
  };
  el("likesSimulator").onsubmit = (e) => {
    e.preventDefault();
    void send("likes", {
      team: number("likeTeam"),
      count: number("likeCount"),
    });
  };
}
