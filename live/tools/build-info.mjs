import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../../", import.meta.url));
export function buildInfo() {
  let revision = "unknown",
    dirty = false;
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirty = !!execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    /* Source archives can build without a .git directory. */
  }
  return {
    revision,
    shortRevision: revision.slice(0, 7),
    dirty,
    builtAt: new Date().toISOString(),
    environment: "stylized-low-poly",
  };
}
