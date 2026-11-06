interface BuildInfo {
  revision: string;
  shortRevision: string;
  dirty: boolean;
  builtAt: string;
  environment: string;
}
declare const __PW_BUILD_INFO__: BuildInfo;
export const clientBuild = __PW_BUILD_INFO__;

// Preview controls only; the livestream HUD/capture composition is unchanged.
export function showBuildVersion() {
  const label = document.getElementById("buildVersion")!;
  const status = document.getElementById("buildStatus")!;
  label.textContent = `LIVE UPGRADE · ${clientBuild.shortRevision}${clientBuild.dirty ? " (dev)" : ""}`;
  label.title = `Built ${clientBuild.builtAt}`;
  const refresh = document.getElementById("refreshBuild")!;
  refresh.addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("build", Date.now().toString());
    location.replace(url);
  });
  if (import.meta.env.DEV) {
    status.textContent = "Vite development preview";
    return () => {};
  }
  const check = async () => {
    try {
      const response = await fetch("/version.json", { cache: "no-store" });
      if (!response.ok) throw Error(String(response.status));
      const served = (await response.json()) as BuildInfo;
      const changed =
        served.revision !== clientBuild.revision ||
        served.builtAt !== clientBuild.builtAt;
      status.textContent = changed
        ? "Có bản mới trên server — bấm Tải lại bản game."
        : "Đang dùng đúng bản build trên server.";
      refresh.hidden = !changed;
      status.dataset.state = changed ? "outdated" : "current";
    } catch {
      status.textContent = "Chưa kiểm tra được phiên bản server.";
      status.dataset.state = "unavailable";
    }
  };
  void check();
  const visible = () => {
    if (!document.hidden) void check();
  };
  const restored = (event: PageTransitionEvent) => {
    if (event.persisted) void check();
  };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("pageshow", restored);
  return () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("pageshow", restored);
  };
}
