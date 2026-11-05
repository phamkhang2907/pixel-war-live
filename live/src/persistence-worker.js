import { parentPort, workerData } from "node:worker_threads";
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from "node:fs";
import { join } from "node:path";
// Serialization, atomic file replacement and fsync run off the simulation thread.
parentPort.on("message", data => {
  try {
    mkdirSync(workerData, {recursive:true});
    const tmp=join(workerData,"league.worker.tmp"), path=join(workerData,"league.json");
    const fd=openSync(tmp,"w",0o600);
    try { writeFileSync(fd,JSON.stringify(data)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp,path);
    const dir=openSync(workerData,"r"); try { fsyncSync(dir); } finally { closeSync(dir); }
    parentPort.postMessage({ok:true});
  } catch(error) { parentPort.postMessage({error:error.message}); }
});
