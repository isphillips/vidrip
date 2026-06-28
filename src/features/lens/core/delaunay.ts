// Tiny dependency-free Delaunay triangulation (Bowyer–Watson). Used by the faceted mesh lenses to
// turn the face landmark cloud into filled triangles. We run it ONCE (on the first dense frame) over a
// subsampled set of mesh points; the index topology is then reused every frame as the face moves (the
// vertices animate, the connectivity stays). Returns a flat triangle index list [a,b,c, a,b,c, …].

type P = { x: number; y: number };

export function delaunay(pts: P[]): number[] {
  const n = pts.length;
  if (n < 3) { return []; }

  // Bounds → a super-triangle that encloses everything.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) { minX = p.x; } if (p.y < minY) { minY = p.y; }
    if (p.x > maxX) { maxX = p.x; } if (p.y > maxY) { maxY = p.y; }
  }
  const dmax = Math.max(maxX - minX, maxY - minY) || 1;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const P2 = pts.slice();
  P2.push({ x: mx - 20 * dmax, y: my - dmax });   // n
  P2.push({ x: mx, y: my + 20 * dmax });          // n+1
  P2.push({ x: mx + 20 * dmax, y: my - dmax });   // n+2

  type Tri = { a: number; b: number; c: number };
  let tris: Tri[] = [{ a: n, b: n + 1, c: n + 2 }];

  // Is p strictly inside triangle t's circumcircle?
  const inCircum = (t: Tri, p: P): boolean => {
    const ax = P2[t.a].x, ay = P2[t.a].y, bx = P2[t.b].x, by = P2[t.b].y, cx = P2[t.c].x, cy = P2[t.c].y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-9) { return false; }
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
    const dd = (p.x - ux) * (p.x - ux) + (p.y - uy) * (p.y - uy);
    return dd <= r2;
  };

  for (let i = 0; i < n; i++) {
    const p = P2[i];
    const bad: Tri[] = [];
    for (const t of tris) { if (inCircum(t, p)) { bad.push(t); } }
    // Cavity boundary = edges that belong to exactly ONE bad triangle (count via a map).
    const counts = new Map<string, [number, number]>();
    const seen = new Map<string, number>();
    for (const t of bad) {
      const es: [number, number][] = [[t.a, t.b], [t.b, t.c], [t.c, t.a]];
      for (const e of es) {
        const k = e[0] < e[1] ? `${e[0]}_${e[1]}` : `${e[1]}_${e[0]}`;
        seen.set(k, (seen.get(k) ?? 0) + 1);
        counts.set(k, e);
      }
    }
    const badSet = new Set(bad);
    tris = tris.filter(t => !badSet.has(t));
    for (const [k, e] of counts) { if (seen.get(k) === 1) { tris.push({ a: e[0], b: e[1], c: i }); } }
  }

  const out: number[] = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) { continue; } // drop super-triangle remnants
    out.push(t.a, t.b, t.c);
  }
  return out;
}
