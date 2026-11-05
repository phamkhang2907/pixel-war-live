import * as T from "three";
import { buildFortresses } from "./fortresses";
import { buildForest } from "./forest-environment";
import type { GroundContacts } from "./ground-contacts";

export async function loadKaykitWorld(
  scene: T.Scene,
  contacts: GroundContacts,
) {
  const [fortresses, forest] = await Promise.all([
    buildFortresses(scene),
    buildForest(scene),
  ]);
  contacts.addStatic(forest.contacts);
  return fortresses;
}
