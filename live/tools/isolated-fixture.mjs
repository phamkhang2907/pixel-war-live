import { League } from "../src/league.js";
// Geometry, camera and legacy control regression tests explicitly disable the
// new free armies. warfare-check.mjs separately verifies all production defaults.
// Legacy monster inspection uses a 20s pass; warfare-check verifies the 9s default.
// These are saved owner settings, not a test authentication bypass.
export function isolatedFixture(data) {
  const l = new League(data);
  l.data.warfare = {
    ...l.data.warfare,
    initialPerTeam: 0,
    baselineEnabled: false,
    castleHp: 10000,
    teamSwitchCooldown: 0,
    flybySeconds: 20,
  };
  l.data.config = { ...l.data.config, duration: 300, prepare: 30 };
  l.flush();
}
