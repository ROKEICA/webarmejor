/**
 * Pipas Mega RA — seguimiento cuadro a cuadro (flujo óptico).
 *
 * MindAR calcula la pose de la bolsa solo unas pocas veces por segundo (cada cálculo es pesado). Si la bolsa se mueve
 * entre un cálculo y otro, el contenido queda atrás y MindAR la pierde. Este módulo sigue la bolsa en CADA cuadro de
 * la cámara (30–60 por segundo) con un método mucho más liviano:
 *
 *   1. Cada cuadro de video se reduce a ~240 px de ancho en gris (con su pirámide de 3 tamaños).
 *   2. Dentro de la bolsa se eligen ~80 puntos con textura (esquinas) y se siguen de un cuadro al siguiente con
 *      Lucas-Kanade piramidal (busca dónde quedó cada pequeño parche de imagen).
 *   3. Cada vez que MindAR entrega una pose firme, se "calibra": se sabe dónde está cada punto SOBRE la bolsa
 *      (coordenadas del marcador). Con eso, en cada cuadro se calcula la homografía bolsa → imagen (RANSAC, descarta
 *      puntos que se fueron a la mano o al fondo) y de ella la pose 3D completa.
 *
 * Resultado: una pose nueva por cada cuadro de la cámara. La app la usa para dibujar el contenido (va pegado a la
 * bolsa al moverla), y MindAR la usa como punto de partida para su propio rastreo (no se le escapa la bolsa).
 * Si los puntos se pierden (la bolsa salió, se tapó o el movimiento es demasiado brusco), `ok` pasa a false de
 * inmediato y el contenido se quita.
 */

const LEVELS = 3;          // pirámide: 240 → 120 → 60 px
const WIN = 4;             // ventana de 9×9 px
const ITERS = 8;
const MAXP = 130;          // puntos simultáneos (hasta 90 en la bolsa + hasta 40 en la pared alrededor)
const MAXB = 90;
const MAXW = 40;
const MINP = 45;           // por debajo de esto se siembran puntos nuevos
const RING = 24;           // cuadros guardados (~0.4–0.8 s) para alinear con la pose de MindAR
const RANSAC_IT = 60;
const RANSAC_THR = 2.2;    // px (en la imagen reducida)
const MIN_INLIERS = 12;

export function createFlow(controller, video, opts = {}) {
  const FW = opts.width || 240;
  let FH = 0, scale = 1;              // scale: px de la entrada de MindAR por px de la imagen reducida
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  // puntos (ranuras fijas: la historia de posiciones se guarda por ranura)
  const alive = new Uint8Array(MAXP), px = new Float32Array(MAXP), py = new Float32Array(MAXP);
  const mx = new Float32Array(MAXP).fill(NaN), my = new Float32Array(MAXP).fill(NaN);
  const bad = new Uint8Array(MAXP);
  // Puntos de la PARED alrededor de la bolsa: la bolsa está pegada a la pared (mismo plano), así que esos puntos
  // siguen el giro y el desplazamiento del celular aunque la bolsa salga de la imagen → el contenido queda en su sitio.
  const wall = new Uint8Array(MAXP);
  // Cuadros que lleva vivo cada punto: un punto de pared recién sembrado siempre "coincide" con la bolsa (todavía no
  // tuvo tiempo de separarse), así que solo cuentan para decidir "bolsa pegada a la pared" los que llevan WALL_AGE.
  const age = new Uint16Array(MAXP);
  const WALL_AGE = 8;
  // Y solo cuenta si la bolsa se MOVIÓ en la imagen mientras el fondo coincidía (bolsa y celular quietos = no dice
  // nada: también coincide con la bolsa en la mano).
  let wallAgreeT = 0, wallSeedN = 0, agreeMove = 0;
  const ring = [];                    // { t, pyr, xs, ys, al }
  let calIdx = -1, calT = 0;          // marcador con el que se calibró y cuándo
  const out = { ok: false, idx: -1, mvt: null, t: 0, inliers: 0, frames: 0, ms: 0, wall: false, wallPts: 0, vis: 1, wallSince: 0, fixed: false };
  const poses = [];                   // historial { t, idx, mvt } para predecir a MindAR
  let running = false, lastVT = -1;

  /* ------------------------------------------------------------------ imagen */
  function grab() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    if (!FH) { FH = Math.round(FW * vh / vw); cv.width = FW; cv.height = FH; scale = (controller.inputWidth || vw) / FW; }
    cx.drawImage(video, 0, 0, FW, FH);
    const d = cx.getImageData(0, 0, FW, FH).data, g = new Uint8Array(FW * FH);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return buildPyr(g);
  }
  function buildPyr(g) {
    const pyr = [{ w: FW, h: FH, d: g }];
    for (let l = 1; l < LEVELS; l++) {
      const p = pyr[l - 1], w = p.w >> 1, h = p.h >> 1, n = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = (2 * y) * p.w + 2 * x;
        n[y * w + x] = (p.d[a] + p.d[a + 1] + p.d[a + p.w] + p.d[a + p.w + 1] + 2) >> 2;
      }
      pyr.push({ w, h, d: n });
    }
    return pyr;
  }
  function samp(im, x, y) {           // bilineal, con bordes
    if (x < 0) x = 0; else if (x > im.w - 1.001) x = im.w - 1.001;
    if (y < 0) y = 0; else if (y > im.h - 1.001) y = im.h - 1.001;
    const x0 = x | 0, y0 = y | 0, ax = x - x0, ay = y - y0, i = y0 * im.w + x0, d = im.d;
    return (d[i] * (1 - ax) + d[i + 1] * ax) * (1 - ay) + (d[i + im.w] * (1 - ax) + d[i + im.w + 1] * ax) * ay;
  }

  /* ------------------------------------------------------------------ Lucas-Kanade piramidal */
  const N = (2 * WIN + 1) * (2 * WIN + 1);
  const Iv = new Float32Array(N), Ix = new Float32Array(N), Iy = new Float32Array(N);
  // Sigue un punto de A a B. Devuelve [x, y, error] o null.
  function lk(A, B, x, y) {
    let gx = 0, gy = 0;
    for (let L = LEVELS - 1; L >= 0; L--) {
      const I = A[L], J = B[L], s = 1 / (1 << L), ux = x * s, uy = y * s;
      if (ux < WIN + 1 || uy < WIN + 1 || ux > I.w - WIN - 2 || uy > I.h - WIN - 2) return null;
      let gxx = 0, gxy = 0, gyy = 0, k = 0;
      for (let j = -WIN; j <= WIN; j++) for (let i = -WIN; i <= WIN; i++, k++) {
        const X = ux + i, Y = uy + j;
        Iv[k] = samp(I, X, Y);
        const dx = (samp(I, X + 1, Y) - samp(I, X - 1, Y)) * 0.5, dy = (samp(I, X, Y + 1) - samp(I, X, Y - 1)) * 0.5;
        Ix[k] = dx; Iy[k] = dy; gxx += dx * dx; gxy += dx * dy; gyy += dy * dy;
      }
      const det = gxx * gyy - gxy * gxy;
      const minEig = (gxx + gyy - Math.sqrt((gxx - gyy) * (gxx - gyy) + 4 * gxy * gxy)) / 2 / N;
      if (det < 1e-6 || minEig < 0.6) return null;               // sin textura: no se puede seguir
      let vx = 0, vy = 0;
      for (let it = 0; it < ITERS; it++) {
        let bx = 0, by = 0; k = 0;
        const ox = ux + gx + vx, oy = uy + gy + vy;
        for (let j = -WIN; j <= WIN; j++) for (let i = -WIN; i <= WIN; i++, k++) {
          const e = Iv[k] - samp(J, ox + i, oy + j);
          bx += e * Ix[k]; by += e * Iy[k];
        }
        const dx = (gyy * bx - gxy * by) / det, dy = (gxx * by - gxy * bx) / det;
        vx += dx; vy += dy;
        if (dx * dx + dy * dy < 0.0009) break;
      }
      if (L > 0) { gx = 2 * (gx + vx); gy = 2 * (gy + vy); } else { gx += vx; gy += vy; }
    }
    const nx = x + gx, ny = y + gy;
    if (nx < 1 || ny < 1 || nx > FW - 2 || ny > FH - 2) return null;
    // error medio del parche (nivel 0): si el parche cambió mucho (se tapó, reflejo) se descarta
    const I = A[0], J = B[0]; let err = 0;
    for (let j = -WIN; j <= WIN; j += 2) for (let i = -WIN; i <= WIN; i += 2) err += Math.abs(samp(I, x + i, y + j) - samp(J, nx + i, ny + j));
    err /= 25;
    if (err > 28) return null;
    return [nx, ny, err];
  }

  /* ------------------------------------------------------------------ homografía y pose */
  function solve(A, b, n) {           // Gauss con pivoteo (A n×n, filas)
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
    return x;
  }
  function norm(xs, ys, ids) {        // normalización de Hartley
    let sx = 0, sy = 0; for (const i of ids) { sx += xs[i]; sy += ys[i]; }
    sx /= ids.length; sy /= ids.length;
    let d = 0; for (const i of ids) d += Math.hypot(xs[i] - sx, ys[i] - sy);
    const s = Math.SQRT2 / Math.max(1e-9, d / ids.length);
    return [s, sx, sy];
  }
  // H (3×3, filas) que lleva (mx,my) → (px,py) usando los puntos ids
  function homography(ids) {
    const [s1, ax, ay] = norm(mx, my, ids), [s2, bx, by] = norm(px, py, ids);
    const A = Array.from({ length: 8 }, () => new Array(8).fill(0)), b = new Array(8).fill(0);
    const row = new Array(8);
    for (const i of ids) {
      const x = (mx[i] - ax) * s1, y = (my[i] - ay) * s1, u = (px[i] - bx) * s2, v = (py[i] - by) * s2;
      for (const [r, rhs] of [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]]) {
        for (let a = 0; a < 8; a++) { row[a] = r[a]; b[a] += r[a] * rhs; for (let c = 0; c < 8; c++) A[a][c] += r[a] * r[c]; }
      }
    }
    const h = solve(A, b, 8);
    if (!h) return null;
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const T1 = [[s1, 0, -s1 * ax], [0, s1, -s1 * ay], [0, 0, 1]];
    const T2i = [[1 / s2, 0, bx], [0, 1 / s2, by], [0, 0, 1]];
    return mul(T2i, mul(Hn, T1));
  }
  function mul(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]; return C; }
  function inv(M) {
    const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function apply(H, x, y) { const w = H[2][0] * x + H[2][1] * y + H[2][2]; return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w, w]; }
  const K = () => controller.projectionTransform;
  // pose de MindAR (3×4) → homografía marcador → imagen reducida
  function mvtToH(m) {
    const k = K(); const P = [[m[0][0], m[0][1], m[0][3]], [m[1][0], m[1][1], m[1][3]], [m[2][0], m[2][1], m[2][3]]];
    const H = mul(k, P), S = [[1 / scale, 0, 0], [0, 1 / scale, 0], [0, 0, 1]];
    return mul(S, H);
  }
  // homografía (imagen reducida) → pose 3×4 en ejes de MindAR
  function hToMvt(H) {
    const Ki = inv(K()); if (!Ki) return null;
    const S = [[scale, 0, 0], [0, scale, 0], [0, 0, 1]];
    const A = mul(Ki, mul(S, H));
    const c0 = [A[0][0], A[1][0], A[2][0]], c1 = [A[0][1], A[1][1], A[2][1]], c2 = [A[0][2], A[1][2], A[2][2]];
    const n0 = Math.hypot(...c0), n1 = Math.hypot(...c1);
    let lam = 2 / (n0 + n1); if (c2[2] * lam < 0) lam = -lam;   // la bolsa siempre delante de la cámara
    const r1 = c0.map(v => v * lam), r2 = c1.map(v => v * lam), t = c2.map(v => v * lam);
    const n1v = Math.hypot(...r1), u1 = r1.map(v => v / n1v);
    const dp = u1[0] * r2[0] + u1[1] * r2[1] + u1[2] * r2[2];
    let u2 = [r2[0] - dp * u1[0], r2[1] - dp * u1[1], r2[2] - dp * u1[2]];
    const n2v = Math.hypot(...u2); u2 = u2.map(v => v / n2v);
    const u3 = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
    return [[u1[0], u2[0], u3[0], t[0]], [u1[1], u2[1], u3[1], t[1]], [u1[2], u2[2], u3[2], t[2]]];
  }
  function quad(H, idx) {             // esquinas de la bolsa en la imagen reducida
    const d = controller.markerDimensions && controller.markerDimensions[idx];
    if (!d) return null;
    return [[0, 0], [d[0], 0], [d[0], d[1]], [0, d[1]]].map(([x, y]) => apply(H, x, y));
  }
  function inside(q, x, y) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) & 3], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
    }
    return true;
  }

  /* ------------------------------------------------------------------ puntos nuevos */
  function seed(pyr, H0, idx, frameNo) {
    const q = quad(H0, idx); if (!q) return [];
    const Hi = inv(H0); if (!Hi) return [];
    // la bolsa se encoge un 6 % hacia el centro (los bordes mezclan bolsa y fondo)
    const c = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    const qi = q.map(p => [c[0] + (p[0] - c[0]) * 0.94, c[1] + (p[1] - c[1]) * 0.94]);
    let x0 = FW, y0 = FH, x1 = 0, y1 = 0;
    for (const p of qi) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(WIN + 3, x0 | 0); y0 = Math.max(WIN + 3, y0 | 0); x1 = Math.min(FW - WIN - 4, x1 | 0); y1 = Math.min(FH - WIN - 4, y1 | 0);
    if (x1 - x0 < 12 || y1 - y0 < 12) return [];
    const im = pyr[0], d = im.d, w = im.w;
    const cell = Math.max(7, Math.round(Math.sqrt((x1 - x0) * (y1 - y0) / 110)));
    const found = [];
    for (let cy = y0; cy < y1; cy += cell) for (let cxx = x0; cxx < x1; cxx += cell) {
      let best = 0, bx = 0, by = 0;
      for (let y = cy; y < Math.min(y1, cy + cell); y += 1) for (let x = cxx; x < Math.min(x1, cxx + cell); x += 1) {
        // Shi-Tomasi 3×3
        let a = 0, b = 0, cc = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const k = (y + j) * w + x + i, gx = d[k + 1] - d[k - 1], gy = d[k + w] - d[k - w];
          a += gx * gx; b += gx * gy; cc += gy * gy;
        }
        const s = (a + cc - Math.sqrt((a - cc) * (a - cc) + 4 * b * b)) / 2;
        if (s > best) { best = s; bx = x; by = y; }
      }
      if (best > 400 && inside(qi, bx, by)) found.push([best, bx, by]);
    }
    found.sort((p, q2) => q2[0] - p[0]);
    const res = [];
    for (const [, x, y] of found) {
      let near = false;
      for (let i = 0; i < MAXP && !near; i++) if (alive[i] && Math.abs(px[i] - x) < 4 && Math.abs(py[i] - y) < 4) near = true;
      if (near) continue;
      const m = apply(Hi, x, y);
      res.push([x, y, m[0], m[1]]);
      if (res.length >= MAXB) break;
    }
    return res;
  }

  // puntos con textura en la pared alrededor de la bolsa (fuera de ella, hasta ~1.5 bolsas de distancia)
  function seedWall(pyr, H0, idx, thr = 120) {
    const q = quad(H0, idx); if (!q) return [];
    const Hi = inv(H0); if (!Hi) return [];
    const c = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    const qo = q.map(p => [c[0] + (p[0] - c[0]) * 1.12, c[1] + (p[1] - c[1]) * 1.12]);   // fuera del borde de la bolsa
    const qb = q.map(p => [c[0] + (p[0] - c[0]) * 5, c[1] + (p[1] - c[1]) * 5]);         // zona de pared (casi toda la imagen)
    let x0 = FW, y0 = FH, x1 = 0, y1 = 0;
    for (const p of qb) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.max(WIN + 3, x0 | 0); y0 = Math.max(WIN + 3, y0 | 0); x1 = Math.min(FW - WIN - 4, x1 | 0); y1 = Math.min(FH - WIN - 4, y1 | 0);
    if (x1 - x0 < 12 || y1 - y0 < 12) return [];
    const im = pyr[0], d = im.d, w = im.w, cell = 9, found = [];
    for (let cy = y0; cy < y1; cy += cell) for (let cxx = x0; cxx < x1; cxx += cell) {
      let best = 0, bx = 0, by = 0;
      for (let y = cy; y < Math.min(y1, cy + cell); y += 1) for (let x = cxx; x < Math.min(x1, cxx + cell); x += 1) {
        let a = 0, b = 0, cc = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const k = (y + j) * w + x + i, gx = d[k + 1] - d[k - 1], gy = d[k + w] - d[k - w];
          a += gx * gx; b += gx * gy; cc += gy * gy;
        }
        const s = (a + cc - Math.sqrt((a - cc) * (a - cc) + 4 * b * b)) / 2;
        if (s > best) { best = s; bx = x; by = y; }
      }
      if (best > thr && !inside(qo, bx, by) && inside(qb, bx, by)) found.push([best, bx, by]);
    }
    found.sort((p, q2) => q2[0] - p[0]);
    const res = [];
    for (const [, x, y] of found) {
      let near = false;
      for (let i = 0; i < MAXP && !near; i++) if (alive[i] && Math.abs(px[i] - x) < 5 && Math.abs(py[i] - y) < 5) near = true;
      if (near) continue;
      const m = apply(Hi, x, y); if (!(m[2] > 0)) continue;
      res.push([x, y, m[0], m[1]]);
      if (res.length >= MAXW) break;
    }
    return res;
  }
  function addWall(pyr, H, thr) {
    let nw = 0; for (let i = 0; i < MAXP; i++) nw += alive[i] && wall[i];
    if (nw >= MAXW * 0.6) return;
    const last = ring[ring.length - 1];
    for (const [x, y, m0, m1] of seedWall(pyr, H, calIdx, thr)) {
      if (nw >= MAXW) break;
      let slot = -1; for (let i = MAXP - 1; i >= 0; i--) if (!alive[i]) { slot = i; break; }
      if (slot < 0) break;
      alive[slot] = 1; wall[slot] = 1; px[slot] = x; py[slot] = y; mx[slot] = m0; my[slot] = m1; bad[slot] = 0; age[slot] = 0; nw++;
      if (last) { last.xs[slot] = x; last.ys[slot] = y; last.al[slot] = 1; }
    }
  }
  // fracción de la bolsa que se ve en la imagen (0 = fuera de cuadro)
  function visFrac(H, idx) {
    const dm = controller.markerDimensions && controller.markerDimensions[idx]; if (!dm) return 1;
    let n = 0;
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const p = apply(H, dm[0] * (i + 0.5) / 5, dm[1] * (j + 0.5) / 5);
      if (p[2] > 0 && p[0] >= 0 && p[1] >= 0 && p[0] < FW && p[1] < FH) n++;
    }
    return n / 25;
  }

  /* ------------------------------------------------------------------ calibración con MindAR */
  // MindAR entregó una pose firme del marcador idx para el cuadro de la cámara tomado en el instante t
  function calibrate(idx, mvt, t) {
    if (!ring.length || !mvt) return;
    let k = ring.length - 1, bestDt = Infinity;
    for (let i = ring.length - 1; i >= 0; i--) { const dt = Math.abs(ring[i].t - t); if (dt < bestDt) { bestDt = dt; k = i; } }
    out.calTry = (out.calTry || 0) + 1;
    if (bestDt > 120) { out.calOld = (out.calOld || 0) + 1; return; }   // no hay un cuadro de ese momento
    const H0 = mvtToH(mvt), Hi = inv(H0);
    if (!Hi) return;
    if (idx !== calIdx) { alive.fill(0); wall.fill(0); mx.fill(NaN); my.fill(NaN); wallAgreeT = 0; }   // otro marcador / otra bolsa
    calIdx = idx; calT = performance.now(); out.cal = (out.cal || 0) + 1;
    const fr = ring[k];
    // puntos que ya se seguían: se les asigna (o corrige) su lugar sobre la bolsa según la pose de MindAR
    for (let i = 0; i < MAXP; i++) {
      if (!alive[i] || !fr.al[i]) continue;
      const m = apply(Hi, fr.xs[i], fr.ys[i]);
      const d = controller.markerDimensions[idx];
      const lo = wall[i] ? -1.6 : -0.05, hi = wall[i] ? 2.6 : 1.05;
      if (m[0] < lo * d[0] || m[1] < lo * d[1] || m[0] > hi * d[0] || m[1] > hi * d[1]) { alive[i] = 0; continue; }
      mx[i] = m[0]; my[i] = m[1]; bad[i] = 0;
    }
    let n = 0; for (let i = 0; i < MAXP; i++) n += alive[i] && !wall[i];
    if (n >= MINP) return;
    // pocos puntos: se siembran nuevos en ese cuadro y se llevan hasta el cuadro actual
    const seeds = seed(fr.pyr, H0, idx);
    for (const [x0, y0, m0, m1] of seeds) {
      let slot = -1; for (let i = 0; i < MAXB; i++) if (!alive[i]) { slot = i; break; }
      if (slot < 0) break;
      wall[slot] = 0;
      let x = x0, y = y0, okp = true;
      fr.xs[slot] = x; fr.ys[slot] = y; fr.al[slot] = 1;
      for (let j = k + 1; j < ring.length; j++) {
        const r = lk(ring[j - 1].pyr, ring[j].pyr, x, y);
        if (!r) { okp = false; break; }
        x = r[0]; y = r[1]; ring[j].xs[slot] = x; ring[j].ys[slot] = y; ring[j].al[slot] = 1;
      }
      if (!okp) { for (let j = k; j < ring.length; j++) ring[j].al[slot] = 0; continue; }
      alive[slot] = 1; px[slot] = x; py[slot] = y; mx[slot] = m0; my[slot] = m1; bad[slot] = 0;
    }
  }

  /* ------------------------------------------------------------------ cada cuadro */
  let rnd = 12345; const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  function step(t, pyrIn) {
    const t0 = performance.now();
    const pyr = pyrIn || grab(); if (!pyr) return;
    const prev = ring.length ? ring[ring.length - 1] : null;
    if (prev) {
      for (let i = 0; i < MAXP; i++) {
        if (!alive[i]) continue;
        const r = lk(prev.pyr, pyr, px[i], py[i]);
        if (!r) { alive[i] = 0; continue; }
        px[i] = r[0]; py[i] = r[1]; if (age[i] < 60000) age[i]++;
      }
    }
    ring.push({ t, pyr, xs: Float32Array.from(px), ys: Float32Array.from(py), al: Uint8Array.from(alive) });
    if (ring.length > RING) ring.shift();
    out.frames++;
    // homografía: (1) con los puntos de la BOLSA si hay suficientes (lo normal; la pared se revisa contra ella);
    // (2) si la bolsa salió de la imagen (o casi), con la PARED + lo que quede de bolsa: mismo plano → misma pose.
    const bagIds = [], allIds = [];
    for (let i = 0; i < MAXP; i++) if (alive[i] && !isNaN(mx[i])) { allIds.push(i); if (!wall[i]) bagIds.push(i); }
    let ok = false, usedWall = false;
    const ransac = (ids, minIn = MIN_INLIERS) => {
      let best = null, bestIn = [];
      for (let it = 0; it < RANSAC_IT; it++) {
        const s = new Set(); while (s.size < 4) s.add(ids[(rand() * ids.length) | 0]);
        const H = homography([...s]); if (!H) continue;
        const inl = [];
        for (const i of ids) { const p = apply(H, mx[i], my[i]); if (p[2] > 0 && Math.hypot(p[0] - px[i], p[1] - py[i]) < RANSAC_THR) inl.push(i); }
        if (inl.length > bestIn.length) { bestIn = inl; best = H; if (inl.length > ids.length * 0.9) break; }
      }
      return best && bestIn.length >= minIn && bestIn.length >= ids.length * 0.5 ? { H: homography(bestIn) || best, inl: bestIn } : null;
    };
    let R = null;
    if (calIdx >= 0 && bagIds.length >= MIN_INLIERS) R = ransac(bagIds);
    // la pared solo puede sostener la pose si hace poco se comprobó que es el mismo plano que la bolsa (bolsa pegada
    // a la pared, no en la mano) y por pocos segundos
    const wallTrusted = wallAgreeT && t - wallAgreeT < 6000;
    if (!R && calIdx >= 0 && wallTrusted && allIds.length >= 7) { R = ransac(allIds, 7); usedWall = !!R; }
    if (R) {
      const H = R.H, inSet = new Set(R.inl);
      // los que no encajan dos cuadros seguidos se descartan (se fueron a la mano o al fondo); la pared, a los 3
      let wIn = 0, wN = 0;
      for (const i of allIds) {
        let fits = inSet.has(i);
        if (!fits && wall[i] && !usedWall) { const p = apply(H, mx[i], my[i]); fits = p[2] > 0 && Math.hypot(p[0] - px[i], p[1] - py[i]) < RANSAC_THR * 1.5; }
        if (wall[i] && age[i] >= WALL_AGE) { wN++; if (fits) wIn++; }
        if (fits) bad[i] = 0; else if (++bad[i] >= (wall[i] ? 3 : 2)) alive[i] = 0;
      }
      // ¿la pared se mueve igual que la bolsa? → la bolsa está pegada a la pared. Solo vale si la bolsa se movió en la
      // imagen (≥ 6 px de la imagen reducida, ~2.5 % del ancho) mientras el fondo coincidía.
      if (!usedWall) {
        const q0 = quad(H, calIdx), cq = q0 ? [(q0[0][0] + q0[2][0]) / 2, (q0[0][1] + q0[2][1]) / 2] : null;
        const dm = cq && out._ac ? Math.hypot(cq[0] - out._ac[0], cq[1] - out._ac[1]) : 0; out._ac = cq;
        if (wN >= 6 && wIn >= wN * 0.7) { agreeMove += dm; if (agreeMove >= 6 && (!wallAgreeT || t - wallAgreeT > 300)) wallAgreeT = t; }
        else if (wN >= 6 && wIn < wN * 0.4) { wallAgreeT = 0; agreeMove = 0; }
      }
      // ¿bolsa FIJA en una superficie (pared o mesa)? = el fondo se mueve igual que la bolsa. Si no, está en la mano.
      out.fixed = usedWall || !!(wallAgreeT && t - wallAgreeT < 700);
      const mvt = hToMvt(H), q = quad(H, calIdx);
      if (mvt && q && sane(q)) {
        ok = true; out.mvt = mvt; out.idx = calIdx; out.t = t; out.inliers = R.inl.length;
        // movimiento rápido de la bolsa en la imagen (>6 px por cuadro en la imagen reducida): lo usa la app para no
        // soltar el contenido por la imagen borrosa
        { const cxq = (q[0][0] + q[2][0]) / 2, cyq = (q[0][1] + q[2][1]) / 2;
          if (out._pc && Math.hypot(cxq - out._pc[0], cyq - out._pc[1]) > 6) out.fastT = t; out._pc = [cxq, cyq]; }
        out.vis = visFrac(H, calIdx); out.wallPts = wN;
        if (usedWall) { if (!out.wall) out.wallSince = t; out.wall = true; } else out.wall = false;
        if (!usedWall) estimateFocal(H);
        poses.push({ t, idx: calIdx, mvt }); if (poses.length > RING) poses.shift();
        // Se van perdiendo puntos (reflejos, la mano, desenfoque): se siembran nuevos sobre la bolsa con la pose
        // actual, sin esperar a MindAR (MindAR los corrige en su próxima pose firme).
        let n = 0; for (let i = 0; i < MAXB; i++) n += alive[i] && !wall[i];
        if (n < MINP && out.vis > 0.3) {
          const last = ring[ring.length - 1];
          for (const [x, y, m0, m1] of seed(pyr, H, calIdx)) {
            let slot = -1; for (let i = 0; i < MAXB; i++) if (!alive[i]) { slot = i; break; }
            if (slot < 0) break;
            alive[slot] = 1; wall[slot] = 0; px[slot] = x; py[slot] = y; mx[slot] = m0; my[slot] = m1; bad[slot] = 0;
            last.xs[slot] = x; last.ys[slot] = y; last.al[slot] = 1;
          }
        }
        // puntos de pared: se siembran cada ~6 cuadros si faltan
        // (con la bolsa fuera de cuadro, la pared es lo único que queda: se siembra más seguido y con menos textura)
        if ((++wallSeedN % (usedWall ? 2 : 6)) === 0) addWall(pyr, H, usedWall ? 50 : 120);
      }
    }
    if (!ok) { out.wall = false; out.fixed = false; }
    out.ok = ok;
    out.ms = out.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  function sane(q) {                  // la bolsa en pantalla: convexa y de tamaño razonable
    let s = 0, area = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) & 3], c = q[(i + 2) & 3];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (s === 0) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false;
      area += a[0] * b[1] - b[0] * a[1];
    }
    area = Math.abs(area) / 2;
    return area > FW * FH * 0.004 && area < FW * FH * 3;
  }

  /* ------------------------------------------------------------------ campo de visión real de la cámara */
  // De la homografía de un rectángulo de medidas conocidas (la bolsa) visto INCLINADO se puede despejar la distancia
  // focal de la cámara (los dos ejes de la bolsa son perpendiculares y del mismo largo por unidad). Se juntan muchas
  // estimaciones con la bolsa inclinada y se usa la mediana. Con la bolsa de frente no se puede (no hay perspectiva).
  const focals = [];
  function estimateFocal(H) {
    const cxp = FW / 2, cyp = FH / 2;
    // centrar en el punto principal
    const h = [[H[0][0] - cxp * H[2][0], H[0][1] - cxp * H[2][1]], [H[1][0] - cyp * H[2][0], H[1][1] - cyp * H[2][1]], [H[2][0], H[2][1]]];
    // cuánta perspectiva hay: variación de la "w" entre las esquinas de la bolsa
    const dm = controller.markerDimensions && controller.markerDimensions[calIdx];
    if (!dm) return;
    const ws = [[0, 0], [dm[0], 0], [dm[0], dm[1]], [0, dm[1]]].map(([x, y]) => H[2][0] * x + H[2][1] * y + H[2][2]);
    const wmean = ws.reduce((a, b) => a + b) / 4, persp = (Math.max(...ws) - Math.min(...ws)) / Math.abs(wmean);
    if (!(persp > 0.12)) return;                            // casi de frente: no sirve
    const est = [];
    const d1 = h[2][0] * h[2][1];
    if (Math.abs(d1) > 1e-12) { const f2 = -(h[0][0] * h[0][1] + h[1][0] * h[1][1]) / d1; if (f2 > 0) est.push(Math.sqrt(f2)); }
    const d2 = h[2][0] * h[2][0] - h[2][1] * h[2][1];
    if (Math.abs(d2) > 1e-12) { const f2 = -(h[0][0] * h[0][0] + h[1][0] * h[1][0] - h[0][1] * h[0][1] - h[1][1] * h[1][1]) / d2; if (f2 > 0) est.push(Math.sqrt(f2)); }
    for (const f of est) {
      const fovy = 2 * Math.atan(FH / 2 / f) * 180 / Math.PI;
      if (fovy > 40 && fovy < 90) { focals.push(fovy); if (focals.length > 400) focals.shift(); }
    }
    if (focals.length >= 60) {
      const s = focals.slice().sort((a, b) => a - b), med = s[s.length >> 1], iqr = s[(s.length * 0.75) | 0] - s[(s.length * 0.25) | 0];
      out.fovy = Math.round(med * 10) / 10; out.fovSpread = Math.round(iqr * 10) / 10; out.fovN = focals.length;
      if (iqr < 12 && opts.onFov) opts.onFov(out.fovy, focals.length);
    }
  }

  /* ------------------------------------------------------------------ bucle */
  // En celulares lentos (si cada cuadro cuesta >25 ms) se procesa 1 de cada 2 cuadros para no frenar a MindAR
  let skip = 0, idleN = 0;
  function tick() {
    // Mientras se busca la bolsa (nada en pantalla) no se gasta tiempo aquí: todo el celular queda para reconocerla.
    // Se guardan solo los últimos cuadros (baratos) para poder calibrar apenas MindAR la encuentre.
    if (opts.isActive && !opts.isActive() && !out.ok) {
      if (++idleN % 3) return;
      const pyr = grab(); if (!pyr) return;
      ring.push({ t: performance.now(), pyr, xs: Float32Array.from(px), ys: Float32Array.from(py), al: new Uint8Array(MAXP) });
      if (ring.length > 4) ring.splice(0, ring.length - 4);
      return;
    }
    if (out.ms > 25 && (skip++ & 1)) return;
    try { step(performance.now()); } catch (e) { console.warn('[flujo]', e); }
  }
  function loop() {
    if (!running) return;
    if (video.requestVideoFrameCallback) {
      video.requestVideoFrameCallback(() => { tick(); loop(); });
    } else {
      requestAnimationFrame(() => {
        if (video.currentTime !== lastVT) { lastVT = video.currentTime; tick(); }
        loop();
      });
    }
  }
  return {
    out,
    start() { if (!running) { running = true; loop(); } },
    stop() { running = false; },
    calibrate,
    /** Pose del marcador idx para el instante t (la del cuadro más cercano, si es reciente). */
    poseAt(idx, t, maxDt = 60) {
      for (let i = poses.length - 1; i >= 0; i--) {
        const p = poses[i];
        if (p.idx === idx && Math.abs(p.t - t) <= maxDt) return p.mvt;
        if (p.t < t - maxDt) break;
      }
      return null;
    },
    reset() { alive.fill(0); wall.fill(0); mx.fill(NaN); my.fill(NaN); calIdx = -1; out.ok = false; out.wall = false; out.fixed = false; wallAgreeT = 0; agreeMove = 0; },
    get calibratedAgo() { return calT ? performance.now() - calT : Infinity; },
    // solo para pruebas
    _test: { setSize(w, h, sc) { FH = h; scale = sc; }, buildPyr: (g) => buildPyr(g), step, hToMvt, mvtToH, alive: () => alive.reduce((a, b) => a + b, 0) },
  };
}
