import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../",import.meta.url));
for(const file of await readdir(root+"src")) if(file.endsWith(".js")) execFileSync(process.execPath,["--check",root+"src/"+file]);
await rm(root+"dist",{recursive:true,force:true});
await mkdir(root+"dist/public",{recursive:true});
await cp(root+"public",root+"dist/public",{recursive:true});
console.log("Prepared 3D-only public assets; backend syntax checks passed.");
