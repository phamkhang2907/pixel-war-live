// Fixed-world numeric cell keys avoid temporary string keys and all-pairs scans.
export class SpatialGrid {
  constructor(size = 100) {
    this.size = size;
    this.cells = new Map();
  }
  key(x, y) {
    return (
      (Math.floor(x / this.size) + 128) * 512 + Math.floor(y / this.size) + 128
    );
  }
  add(u) {
    const k = this.key(u.x, u.y);
    let a = this.cells.get(k);
    if (!a) this.cells.set(k, (a = []));
    a.push(u);
  }
  build(units) {
    this.cells.clear();
    for (const u of units) if (u.hp > 0) this.add(u);
    return this;
  }
  query(x, y, r, visit, budget = Infinity, offset = 0) {
    const s = this.size,
      cx = Math.floor(x / s),
      cy = Math.floor(y / s),
      n = Math.ceil(r / s);
    let seen = 0;
    for (let ring = 0; ring <= n; ring++)
      for (let dx = -ring; dx <= ring; dx++)
        for (let dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const a = this.cells.get((cx + dx + 128) * 512 + cy + dy + 128);
          if (!a) continue;
          for (let i = 0; i < a.length; i++) {
            if (visit(a[(i + offset) % a.length]) === false) return;
            if (++seen >= budget) return;
          }
        }
  }
}
export function seeded(id, salt = 0) {
  let x = (id ^ salt) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
