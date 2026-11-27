/**
 * Pipas Mega RA — verificación de sabor por color + ganchos sobre el Controller de MindAR 1.2.5.
 *
 * Los 4 empaques comparten casi todo el diseño. La identificación se decide por PUNTOS CLAVE:
 *   - Al detectar: se comparan las 4 bolsas y los 4 logos "MEGA + sabor"; si se ve un logo, el logo decide
 *     el sabor. El color solo desempata cuando dos sabores quedan casi iguales (nunca veta).
 *   - Al rastrear: cada ~12 cuadros se vuelve a comparar contra los 4 empaques; si otro sabor gana
 *     claramente (p. ej. se cambió la bolsa), se suelta el rastreo y se detecta el nuevo.
 */

// Índices de targets.mind: 0 Pica Limón, 1 Acid, 2 Maraculimón, 3 Verde
export function classifyColors(data, W = 64, H = 48) {
  // Paso A: centro del empaque (excluye madera, piel y fondos neutros)
  let sx = 0, sy = 0, sw = 0;
  for (let py = 2; py < H - 2; py++) {
    for (let px = 2; px < W - 2; px++) {
      const i = (py * W + px) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const [h, s, v] = hsv(r, g, b);
      if (v < 0.08 || s < 0.18 || (s < 0.20 && v > 0.85)) continue;
      if (h >= 8 && h <= 45 && r >= g && g >= b * 0.95 && !(v > 0.62 && s > 0.62 && h >= 36)) continue;
      const pk = ((h <= 12 || h >= 348) && s >= 0.34 && v >= 0.18 && r > g * 1.55 && b < r * 0.38) ||
                 (h >= 248 && h <= 345 && s >= 0.18 && v >= 0.12) ||
                 (h >= 36 && h <= 165 && s >= 0.20 && v >= 0.14);
      if (pk) { const wt = s * s * (0.3 + v); sx += (px + 0.5) / W * wt; sy += (py + 0.5) / H * wt; sw += wt; }
    }
  }
  const bx = sw > 3.5 ? clamp(sx / sw, 0.08, 0.92) : 0.5;
  const by = sw > 3.5 ? clamp(sy / sw, 0.08, 0.92) : 0.5;

  // Paso B: conteo de colores alrededor del empaque
  const x0 = Math.max(1, Math.floor((bx - 0.24) * W)), x1 = Math.min(W - 1, Math.ceil((bx + 0.24) * W));
  const y0 = Math.max(1, Math.floor((by - 0.32) * H)), y1 = Math.min(H - 1, Math.ceil((by + 0.32) * H));
  let red = 0, yel = 0, gr = 0, mag = 0, tot = 0;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = (py * W + px) * 4;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const [h, s, v] = hsv(r, g, b);
      if (v < 0.08 || (s < 0.12 && v > 0.86)) continue;
      if (h >= 8 && h <= 44 && r >= g && g >= b * 0.95 && !(v > 0.60 && s > 0.58 && h >= 35)) continue;
      const isMag = (h >= 248 && h <= 344 && s >= 0.16 && v >= 0.12) ||
                    (h > 344 && h <= 357 && s >= 0.2 && v >= 0.14 && r > g * 1.24 && b > g * 1.08 && b > r * 0.5) ||
                    (r > g * 1.14 && b > g * 1.04 && s >= 0.16 && v >= 0.16 && b > r * 0.55);
      const isRed = !isMag && ((h >= 0 && h <= 12) || h >= 348) && s >= 0.32 && v >= 0.18 && r > g * 1.55 && (b < r * 0.36 || g >= b);
      if (isMag) { mag++; tot++; }
      else if (isRed) { red++; tot++; }
      else if (h >= 34 && h <= 62 && s >= 0.18 && v >= 0.18) { yel++; tot++; }
      else if (h > 62 && h <= 165 && s >= 0.14 && v >= 0.12) { gr++; tot++; }
    }
  }
  let dominant = -1;
  if (tot >= 14) {
    const rR = red / tot, yR = yel / tot, gR = gr / tot, mR = mag / tot;
    if (rR > 0.18 && red > yel * 0.45 && red > mag * 2.2 && red >= 24) dominant = 0;
    else if (mag >= 12 && mR >= 0.03 && (gR + yR) > 0.22) dominant = 1;
    else if (yR > 0.32 && yel > gr * 1.2 && mag < 5 && rR < 0.14) dominant = 2;
    else if (gR > 0.42 && yR < 0.28 && red < 12 && mag < 4) dominant = 3;
  }
  return { dominant, total: tot, red, yellow: yel, green: gr, magenta: mag };
}

function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const s = mx === 0 ? 0 : d / mx;
  let h = 0;
  if (d !== 0) {
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, mx];
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/**
 * Instala la verificación de color en el Controller de MindAR (llamar después de mindarThree.start()).
 * @param controller  mindarThree.controller
 * @param video       elemento <video> de la cámara
 */
export function installColorVerification(controller, video, opts = {}) {
  const useColor = opts.useColor !== false;
  const NF = opts.nFlavors || 4;           // targets >= NF son los logos "MEGA + sabor" (NF + k = logo del sabor k)
  const flavorOf = (i) => (i < 0 ? -1 : i % NF);
  controller.pipasFlavorOf = flavorOf;
  if (!controller || controller.__pipasColor) return;
  controller.__pipasColor = true;
  // Instante del cuadro de cámara del que salió cada pose (para corregirla con el giroscopio en js/app.js)
  controller.__poseT = [];
  if (typeof controller.onUpdate === 'function') {
    const ou = controller.onUpdate;
    controller.onUpdate = function (d) {
      if (d && d.type === 'updateMatrix' && d.worldMatrix) {
        controller.__poseT[d.targetIndex] = controller.__inputT || performance.now();
        { const st0 = controller.trackingStates && controller.trackingStates[d.targetIndex]; if (st0 && st0.isTracking && controller.__firmT) controller.__firmT[flavorOf(d.targetIndex)] = performance.now(); }
        // Pose firme de MindAR en este cuadro → se calibra el seguimiento cuadro a cuadro (js/flow.js)
        const F = window.__pipasFlow, st = controller.trackingStates && controller.trackingStates[d.targetIndex];
        const ts = controller.__trackStrong, strong = ts && ts.length ? ts[ts.length - 1] : 0;
        if (F && st && st.isTracking && st.currentModelViewTransform && (strong >= 10 || controller.__detIdx === d.targetIndex)) {
          try { F.calibrate(d.targetIndex, st.currentModelViewTransform, controller.__inputT); } catch (e) { /* sin calibrar */ }
        }
      }
      return ou.apply(this, arguments);
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 48;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let frame = 0, sigFrame = -1, sig = { dominant: -1, total: 0 };

  // Ajuste automático de luz: con poca luz, reflejos o imagen lavada se estira el contraste del cuadro
  // ANTES de buscar puntos clave (filtro del lienzo interno de MindAR, sin costo extra).
  const autoContrast = opts.autoContrast !== false;
  const il = controller.inputLoader;
  const ictx = il && il.context;
  const canFilter = !!ictx && typeof ictx.filter === 'string';
  const lumaHist = new Uint32Array(64);
  controller.__enhance = { filter: 'none', lo: 0, hi: 1, mean: 0.5 };
  function updateEnhance(src) {
    try {
      ctx.drawImage(src, 0, 0, 64, 48);
      const d = ctx.getImageData(0, 0, 64, 48).data;
      lumaHist.fill(0); let sum = 0; const n = 64 * 48;
      for (let i = 0; i < d.length; i += 4) {
        const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        lumaHist[Math.min(63, (y * 64) | 0)]++; sum += y;
      }
      const pct = (p) => { let acc = 0; const k = n * p; for (let b = 0; b < 64; b++) { acc += lumaHist[b]; if (acc >= k) return (b + 0.5) / 64; } return 1; };
      const lo = pct(0.03), hi = pct(0.97), mean = sum / n;
      let f = 'none';
      if (hi - lo < 0.62 || mean < 0.36) {
        const b = Math.max(1, Math.min(2.2, 1 / Math.max(0.2, lo + hi)));
        const c = Math.max(1, Math.min(2.0, 0.9 / Math.max(0.05, (hi - lo) * b)));
        if (b > 1.04 || c > 1.04) f = `brightness(${b.toFixed(2)}) contrast(${c.toFixed(2)})`;
      }
      controller.__enhance = { filter: f, lo, hi, mean };
      ictx.filter = f;
    } catch (e) { /* video aún sin cuadros */ }
  }
  const origLoad = il.loadInput.bind(il);
  // Gracia en TIEMPO: MindAR espera `missTolerance` CUADROS sin ver la bolsa antes de quitar el contenido. Mientras
  // busca, el celular procesa ~2 cuadros/s y 6 cuadros eran ~3 s de objetos flotando. Se mide el tiempo real por
  // cuadro y se ajusta para que la espera sea ~0.6 s (mínimo 2 cuadros).
  let lastLoadT = 0;
  il.loadInput = function (src) {
    frame++;
    const tNow = performance.now();
    if (lastLoadT) {
      const dt = Math.min(2000, tNow - lastLoadT);
      controller.__frameMs = controller.__frameMs ? controller.__frameMs * 0.85 + dt * 0.15 : dt;
      // Espera corta (~0.6 s, mínimo 2 cuadros) SOLO si la bolsa sigue donde estaba: si ya no está, la
      // "comprobación de presencia" de abajo quita el contenido en ese mismo cuadro.
      // Con el celular girando rápido (cuadros borrosos) se espera un poco más: el giroscopio mantiene el contenido
      // pegado a la bolsa mientras llega un cuadro nítido (si la bolsa ya no está, la comprobación de color lo quita).
      const G = window.__pipasGyro, fast = G && G.state.ok && G.state.rate > 70;
      const graceMs = Math.max(fast ? 1000 : 600, controller.pipasGraceMs || 250);
      controller.missTolerance = Math.max(2, Math.min(40, Math.round(graceMs / controller.__frameMs)));
    }
    lastLoadT = tNow;
    controller.__prevInputT = controller.__inputT || 0;
    controller.__inputT = tNow;
    controller.__detIdx = -1;   // marcador encontrado por detección EN este cuadro (su pose ya es de este cuadro)
    if (autoContrast && canFilter && (frame % 8 === 1)) updateEnhance(src);
    return origLoad(src);
  };

  function signature() {
    if (sigFrame !== frame) {
      sigFrame = frame;
      try {
        ctx.drawImage(video, 0, 0, 64, 48);
        sig = classifyColors(ctx.getImageData(0, 0, 64, 48).data);
      } catch (e) { sig = { dominant: -1, total: 0 }; }
    }
    return sig;
  }
  controller.getColorSignature = signature;

  // Detección: el worker parcheado elige el sabor con MÁS puntos coincidentes.
  // El color solo se envía como desempate (cuando dos sabores tienen casi los mismos puntos).
  controller._workerMatch = function (featurePoints, targetIndexes) {
    const s = signature();
    controller.__sig = { t: performance.now(), total: s.total || 0, n: featurePoints ? featurePoints.length : 0 };
    return new Promise((resolve) => {
      this.workerMatchDone = (d) => {
        controller.__lastMatch = { t: performance.now(), targetIndex: d.targetIndex, decidedBy: d.decidedBy, candidates: d.candidates || [] };
        resolve({ targetIndex: d.targetIndex, modelViewTransform: d.modelViewTransform, debugExtra: d.debugExtra, decidedBy: d.decidedBy, candidates: d.candidates || [] });
      };
      this.worker.postMessage({ type: 'match', featurePoints, targetIndexes, nFlavors: NF, layout: controller.pipasLayout || null, dominantColorTarget: useColor && s.total >= 14 ? s.dominant : -1 });
    });
  };

  // Ya no se oculta nada por color: con luz real el color puede fallar y no debe vetar un empaque.
  controller.pipasEnforceVisibility = function () {};

  /* ------------------------------------------------------------------------------------------------
   * Anclaje y seguimiento de la app ORIGINAL (portado sin el veto por color):
   *  1. Seguimiento tolerante: acepta coincidencias de plantilla con similitud > 0.52 (MindAR usa 0.80) y
   *     se queda solo con las que se mueven en conjunto (mediana ± 32 px), así los reflejos y arrugas del
   *     metalizado no sueltan la bolsa.
   *  2. Búsqueda en TODO el cuadro: MindAR solo mira un recuadro de 256 px por cuadro; si ahí no encuentra
   *     nada, se buscan puntos en una cuadrícula 3×3 que cubre toda la imagen.
   *  3. Pasada "anti-brillo": imagen en gris con los brillos especulares comprimidos y el contraste normalizado.
   * ------------------------------------------------------------------------------------------------ */
  const robust = opts.robust !== false;
  const lockVerified = new Set();
  // última vez que MindAR rastreó de verdad cada sabor (js/app.js no deja que el seguimiento cuadro a cuadro sostenga
  // el contenido por su cuenta más de 1.5 s sin esta confirmación → no queda flotando ni pasa a otra bolsa)
  const firmT = []; controller.__firmT = firmT;   // marcadores cuyo sabor ya se confirmó con el cuadro completo
  controller.__pipasStats = { moving: 0, full: 0, norm: 0, trackKeep: 0 };
  const W = (il && il.width) || 640, H = (il && il.height) || 480;

  if (robust && controller.tracker && typeof controller.tracker.track === 'function') {
    const mulPM = (n, t) => [
      [n[0][0] * t[0][0] + n[0][2] * t[2][0], n[0][0] * t[0][1] + n[0][2] * t[2][1], n[0][0] * t[0][2] + n[0][2] * t[2][2], n[0][0] * t[0][3] + n[0][2] * t[2][3]],
      [n[1][1] * t[1][0] + n[1][2] * t[2][0], n[1][1] * t[1][1] + n[1][2] * t[2][1], n[1][1] * t[1][2] + n[1][2] * t[2][2], n[1][1] * t[1][3] + n[1][2] * t[2][3]],
      [t[2][0], t[2][1], t[2][2], t[2][3]]
    ];
    const proj2D = (n, x, y) => {
      const o = n[0][0] * x + n[0][1] * y + n[0][3], r = n[1][0] * x + n[1][1] * y + n[1][3], i = n[2][0] * x + n[2][1] * y + n[2][3];
      return { x: o / i, y: r / i };
    };
    const SIM = opts.trackSimilarity || 0.52;
    const GHOST_MIN_STRONG = opts.ghostMinStrong || 3, GHOST_FRAMES = opts.ghostFrames || 3;
    controller.tracker.track = function (inputT, lastMVT, targetIndex) {
      const r = mulPM(this.projectionTransform, lastMVT);
      const adj = this._buildAdjustedModelViewTransform(r);
      const proj = this._computeProjection(adj, inputT, targetIndex);
      const { matchingPointsT, simT } = this._computeMatching(this.featurePointsListT[targetIndex], this.imagePixelsListT[targetIndex], this.imagePropertiesListT[targetIndex], proj);
      const p = matchingPointsT.arraySync(), f = simT.arraySync();
      const kf = this.trackingKeyframeList[targetIndex];
      adj.dispose(); proj.dispose(); matchingPointsT.dispose(); simT.dispose();
      const raw = [];
      for (let w = 0; w < p.length; w++) {
        if (f[w] > SIM && w < kf.points.length) raw.push({ w, dx: p[w][0] * kf.scale - kf.points[w].x, dy: p[w][1] * kf.scale - kf.points[w].y });
      }
      const worldCoords = [], screenCoords = [];
      // Anti-fantasma: con la bolsa a la vista siempre hay varias coincidencias FUERTES (similitud > 0.8, el umbral
      // de MindAR). Si el rastreo tolerante sigue "pegado" a la mesa o al fondo, casi no hay ninguna: tras
      // GHOST_FRAMES cuadros seguidos así, se suelta la bolsa para que el contenido no quede flotando.
      let strong = 0;
      for (const a of raw) if (f[a.w] > 0.8) strong++;
      const gs = this.__ghost || (this.__ghost = {});
      gs[targetIndex] = strong < GHOST_MIN_STRONG ? (gs[targetIndex] || 0) + 1 : 0;
      (controller.__trackStrong || (controller.__trackStrong = [])).push(strong);
      if (controller.__trackStrong.length > 400) controller.__trackStrong.splice(0, 200);
      if (gs[targetIndex] >= GHOST_FRAMES) { gs[targetIndex] = 0; controller.__ghostDrops = (controller.__ghostDrops || 0) + 1; return { worldCoords, screenCoords, debugExtra: {} }; }
      if (raw.length >= 6) {
        const mid = raw.length >> 1;
        const mdx = raw.map(a => a.dx).sort((a, b) => a - b)[mid], mdy = raw.map(a => a.dy).sort((a, b) => a - b)[mid];
        for (const a of raw) {
          if (Math.hypot(a.dx - mdx, a.dy - mdy) <= 32) {
            screenCoords.push(proj2D(r, p[a.w][0], p[a.w][1]));
            worldCoords.push({ x: kf.points[a.w].x / kf.scale, y: kf.points[a.w].y / kf.scale, z: 0 });
          }
        }
      }
      return { worldCoords, screenCoords, debugExtra: {} };
    };
  }

  // Cuadrícula 3×3 de recortes de 256 px que cubre todo el cuadro. Para no bajar los cuadros por segundo,
  // cada llamada revisa solo `count` recortes (rotando), así en 3 cuadros se cubre toda la imagen.
  let gridPos = 0;
  function gridCrops() {
    const cd = controller.cropDetector, crop = cd.cropSize;
    const maxX = Math.max(0, cd.width - crop - 1), maxY = Math.max(0, cd.height - crop - 1);
    const xs = [...new Set([0, maxX >> 1, maxX])], ys = [...new Set([0, maxY >> 1, maxY])];
    const out = []; for (const y of ys) for (const x of xs) out.push([x, y]);
    return out;
  }
  function mergePoints(inputT, crops) {
    const cd = controller.cropDetector, merged = [], seen = new Set();
    for (const [x, y] of crops) {
      const { featurePoints } = cd._detect(inputT, x, y);
      for (const pt of featurePoints) {
        const key = (pt.x >> 1) + '_' + (pt.y >> 1) + '_' + (pt.maxima ? 1 : 0);
        if (!seen.has(key)) { seen.add(key); merged.push(pt); }
      }
    }
    return merged;
  }
  function detectFullFrame(inputT, count = 9) {
    const all = gridCrops();
    if (count >= all.length) return mergePoints(inputT, all);
    const pick = []; for (let k = 0; k < count; k++) pick.push(all[(gridPos + k) % all.length]);
    gridPos = (gridPos + count) % all.length;
    return mergePoints(inputT, pick);
  }
  // Proyecta un punto del marcador (u, v en 0..1 desde arriba-izquierda) a píxeles de la imagen de entrada
  function projectMarkerPoint(mvt, idx, u, v) {
    const dims = controller.markerDimensions && controller.markerDimensions[idx];
    const P = controller.projectionTransform;
    if (!dims || !P || !mvt) return null;
    const X = u * dims[0], Y = v * dims[1];
    const Xc = mvt[0][0] * X + mvt[0][1] * Y + mvt[0][3];
    const Yc = mvt[1][0] * X + mvt[1][1] * Y + mvt[1][3];
    const Zc = Math.abs(mvt[2][0] * X + mvt[2][1] * Y + mvt[2][3]);
    if (!isFinite(Zc) || Zc < 1) return null;
    return { x: P[0][0] * Xc / Zc + P[0][2], y: P[1][1] * Yc / Zc + P[1][2] };
  }
  // Un recorte de 256 px centrado donde están las PALABRAS "MEGA + sabor" de la bolsa (lo que distingue el sabor)
  function detectAtWords(inputT, mvt, idx) {
    const cd = controller.cropDetector, crop = cd.cropSize;
    const isWords = idx >= NF;
    const pt = projectMarkerPoint(mvt, idx, 0.5, isWords ? 0.5 : (opts.wordsV || 0.38));
    if (!pt) return null;
    const x = Math.max(0, Math.min(cd.width - crop - 1, Math.round(pt.x - crop / 2)));
    const y = Math.max(0, Math.min(cd.height - crop - 1, Math.round(pt.y - crop / 2)));
    return mergePoints(inputT, [[x, y]]);
  }
  // Búsqueda por COLUMNAS: una columna de 3 recortes (256 px de ancho × toda la altura) contiene la bolsa completa
  // cuando está más o menos centrada. Antes se rotaba por FILAS (franjas de 256 px de alto) y una bolsa de ~300 px
  // nunca quedaba entera en una franja: con poca luz no se reconocía. Orden: centro, izquierda, centro, derecha.
  const COL_ORDER = [1, 0, 1, 2];
  let colPos = 0;
  function columnCrops(ci) {
    const all = gridCrops(), xs = [...new Set(all.map(c => c[0]))].sort((a, b) => a - b);
    const x = xs[Math.min(ci, xs.length - 1)];
    return all.filter(c => c[0] === x);
  }
  function detectNextColumn(inputT) {
    const ci = COL_ORDER[colPos % COL_ORDER.length]; colPos++;
    return mergePoints(inputT, columnCrops(ci));
  }
  controller.pipasDetectColumn = (inputT, ci) => mergePoints(inputT, columnCrops(ci));
  controller.pipasDetectAtWords = (inputT, mvt, idx) => detectAtWords(inputT, mvt, idx);
  controller.pipasProjectMarkerPoint = projectMarkerPoint;
  controller.pipasDetectFullFrame = detectFullFrame;

  // Imagen anti-brillo (de la app original): gris, brillos del metalizado comprimidos y contraste normalizado
  const normCanvas = document.createElement('canvas'); normCanvas.width = W; normCanvas.height = H;
  const normCtx = normCanvas.getContext('2d', { willReadFrequently: true });
  function buildGlareNormalized() {
    normCtx.drawImage(ictx.canvas, 0, 0, W, H);
    const img = normCtx.getImageData(0, 0, W, H), d = img.data;
    const x0 = (W * 0.08) | 0, x1 = (W * 0.92) | 0, y0 = (H * 0.08) | 0, y1 = (H * 0.92) | 0;
    let sumY = 0, cnt = 0, minY = 255, maxY = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (l > 235 && sat < 25) continue;
      sumY += l; cnt++; if (l < minY) minY = l; if (l > maxY) maxY = l;
    }
    const avg = cnt ? sumY / cnt : 128, span = Math.max(30, maxY - minY);
    const gamma = avg < 65 ? 0.62 : (avg > 185 ? 1.45 : 0.95);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx - mn;
      let y = 0.299 * r + 0.587 * g + 0.114 * b;
      if (y > 190 && sat > 6 && sat < 95) y = Math.min(230, Math.max(0, (y - mn * 0.65) * 1.45));
      else if (y > 225) y = 195 + (y - 225) * 0.35;
      const out = Math.round(Math.pow(Math.max(0, Math.min(1, (y - minY * 0.8) / span)), gamma) * 245);
      d[i] = d[i + 1] = d[i + 2] = out;
    }
    normCtx.putImageData(img, 0, 0);
    return normCanvas;
  }

  // ZOOM para bolsas lejanas: se amplía el centro del cuadro (×z) en un lienzo del mismo tamaño, se buscan puntos
  // ahí (la bolsa queda del doble de grande y con más detalle) y luego las coordenadas se devuelven al cuadro
  // original, así la pose se calcula con la cámara real y el contenido queda bien ubicado.
  const zoomCanvas = document.createElement('canvas'); zoomCanvas.width = W; zoomCanvas.height = H;
  const zoomCtx = zoomCanvas.getContext('2d');
  function detectZoom(src, z) {
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    if (!sw || !sh) return [];
    const cw = sw / z, ch = sh / z, sx = (sw - cw) / 2, sy = (sh - ch) / 2;
    zoomCtx.filter = ictx && ictx.filter && ictx.filter !== 'none' ? ictx.filter : 'none';
    if (z >= 1) zoomCtx.drawImage(src, sx, sy, cw, ch, 0, 0, W, H);
    else {   // alejar: el cuadro entero achicado en el centro (fondo gris neutro), sin salirse de la imagen de origen
      zoomCtx.fillStyle = '#808080'; zoomCtx.fillRect(0, 0, W, H);
      zoomCtx.drawImage(src, 0, 0, sw, sh, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
    }
    const prevFilter = ictx.filter; let zt = null;
    try {
      ictx.filter = 'none';
      zt = origLoad(zoomCanvas);
      const pts = mergePoints(zt, columnCrops(1));
      // cuadro ampliado -> cuadro original (en coordenadas de la entrada W×H)
      const ox = (W - W / z) / 2, oy = (H - H / z) / 2;
      return pts.map(p => ({ ...p, x: ox + p.x / z, y: oy + p.y / z, scale: p.scale / z }));
    } finally { if (zt) zt.dispose(); ictx.filter = prevFilter; }
  }
  controller.pipasDetectZoom = detectZoom;

  // Puntos de la columna central sobre la imagen anti-brillo (para pruebas y para la búsqueda)
  controller.pipasDetectGlare = function () {
    const prevFilter = ictx.filter; let normT = null;
    try { const c = buildGlareNormalized(); ictx.filter = 'none'; normT = origLoad(c); return mergePoints(normT, columnCrops(1)); }
    finally { if (normT) normT.dispose(); ictx.filter = prevFilter; }
  };

  if (robust) {
    let searchN = 0, sideCol = 0;
    controller._detectAndMatch = async function (inputT, targetIndexes) {
      const st = controller.__pipasStats;
      // Mientras se busca, el contenido de una bolsa recién perdida sigue en pantalla unos instantes: si en este
      // cuadro esa zona ya no se parece a la bolsa, se quita YA.
      (this.trackingStates || []).forEach((ts, i) => {
        if (ts.showing && !ts.isTracking && !bagStillThere(ts.currentModelViewTransform, i)) hideNow(i);
      });
      // Paso 1: recorte móvil de MindAR (rápido)
      let { featurePoints } = this.cropDetector.detectMoving(inputT);
      let r = await this._workerMatch(featurePoints, targetIndexes);
      if (r.targetIndex !== -1) {
        // El recorte de 256 px puede ver solo la parte que comparten las bolsas (personaje, semilla):
        // se confirma el sabor con un recorte sobre las PALABRAS de esa bolsa; gana el sabor con más evidencia.
        const pts = detectAtWords(inputT, r.modelViewTransform, r.targetIndex);
        if (pts && pts.length) {
          const conf = await this._workerMatch(pts, targetIndexes);
          if (conf.targetIndex !== -1 && flavorOf(conf.targetIndex) !== flavorOf(r.targetIndex)) { st.full++; r = conf; }
          else st.moving++;
          if (conf.targetIndex !== -1) lockVerified.add(r.targetIndex);
        } else st.moving++;
        return { targetIndex: r.targetIndex, modelViewTransform: r.modelViewTransform };
      }
      searchN++;
      // Paso 2: UN solo intento extra por cuadro, alternando (antes se hacían hasta 3 seguidos y el celular tardaba
      // >1 s por cuadro mientras buscaba; así prueba ~2 veces más por segundo):
      //   columna completa · zoom ×1.7 (bolsa lejos) · columna completa · imagen anti-brillo
      // Ciclo de 6 pasadas. La bolsa casi siempre está al CENTRO de la pantalla: la columna central se revisa en la
      // mitad de los cuadros (antes en 1 de cada 4, por eso tardaba varios segundos con la bolsa quieta al frente):
      //   centro · lados (izq./der.) · centro · acercar (bolsa lejos) · centro · anti-brillo
      const pass = searchN % 6;
      const found = (kind, rr) => { st[kind] = (st[kind] || 0) + 1; if (kind !== 'zoom') lockVerified.add(rr.targetIndex);
        return { targetIndex: rr.targetIndex, modelViewTransform: rr.modelViewTransform }; };
      if (pass === 0 || pass === 2 || pass === 4) {
        r = await this._workerMatch(mergePoints(inputT, columnCrops(1)), targetIndexes);
        if (r.targetIndex !== -1) return found('full', r);
      } else if (pass === 1) {
        sideCol = sideCol === 0 ? 2 : 0;
        r = await this._workerMatch(mergePoints(inputT, columnCrops(sideCol)), targetIndexes);
        if (r.targetIndex !== -1) return found('full', r);
      } else if (pass === 3) {
        // bolsa lejos: centro ampliado; su sabor se confirma con las palabras en el primer cuadro de rastreo
        if (video && video.readyState >= 2) {
          try { r = await this._workerMatch(detectZoom(video, 1.7), targetIndexes); if (r.targetIndex !== -1) return found('zoom', r); }
          catch (e) { /* sin zoom */ }
        }
      } else if (ictx) {
        const prevFilter = ictx.filter;
        let normT = null;
        try {
          const c = buildGlareNormalized();
          ictx.filter = 'none';
          normT = origLoad(c);
          r = await this._workerMatch(mergePoints(normT, columnCrops(1)), targetIndexes);
          if (r.targetIndex !== -1) return found('norm', r);
        } catch (e) { /* sin pasada anti-brillo */ }
        finally { if (normT) normT.dispose(); ictx.filter = prevFilter; }
      }
      return { targetIndex: -1, modelViewTransform: null };
    };
  }

  // Rastreo: cada ~12 cuadros se vuelve a comparar el cuadro actual contra los 4 empaques (por puntos clave).
  // Si otro sabor aparece claramente mejor 2 veces seguidas (p. ej. se cambió la bolsa), se suelta el rastreo
  // para que se detecte el nuevo sabor.
  const recheck = { n: 0, strikes: 0 };
  // Todos los marcadores compilados (4 bolsas + 4 logos si existen)
  // Todos los marcadores menos los borrosos (esos solo ayudan justo después de perder la bolsa por movimiento)
  const allTargets = () => Array.from({ length: (controller.markerDimensions && controller.markerDimensions.length) || NF }, (_, i) => i)
    .filter(i => !isBlurIdx(i) && !isTiltIdx(i) && !(controller.pipasSkipIdx && controller.pipasSkipIdx.has(i)));
  function isBlurIdx(i) { const L = controller.pipasLayout; return !!(L && L[Math.floor(i / NF)] === 'borroso'); }
  function isTiltIdx(i) { const L = controller.pipasLayout, k = L && L[Math.floor(i / NF)]; return typeof k === 'string' && k.startsWith('lado'); }
  const origTrack = controller._trackAndUpdate.bind(controller);

  // Pose imposible (contenido gigante, girado 90°, bolsa deformada): se compara la bolsa proyectada en pantalla
  // con su forma real y con la pose del cuadro anterior. Un cuadro raro se ignora (se mantiene la pose previa);
  // dos seguidos sueltan la bolsa para que se vuelva a detectar bien.
  const prevPose = {}, badPose = {};
  function poseShape(mvt, idx) {
    const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => projectMarkerPoint(mvt, idx, u, v));
    if (pts.some(p => !p || !isFinite(p.x) || !isFinite(p.y))) return null;
    let area = 0, sign = 0, convex = true;
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4], c = pts[(k + 2) % 4];
      area += a.x * b.y - b.x * a.y;
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cr !== 0) { const s = Math.sign(cr); if (sign && s !== sign) convex = false; sign = s; }
    }
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const top = d(pts[0], pts[1]), bot = d(pts[3], pts[2]), left = d(pts[0], pts[3]), right = d(pts[1], pts[2]);
    const dims = controller.markerDimensions[idx];
    return { area: Math.abs(area) / 2, convex, wRatio: top / Math.max(1e-3, bot), hRatio: left / Math.max(1e-3, right),
      aspect: ((top + bot) / 2) / Math.max(1e-3, (left + right) / 2) / (dims[0] / dims[1]),
      angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), cx: (pts[0].x + pts[2].x) / 2, cy: (pts[0].y + pts[2].y) / 2 };
  }
  function poseIsSane(mvt, idx) {
    if (!controller.markerDimensions || !controller.markerDimensions[idx]) return true;
    const s = poseShape(mvt, idx);
    if (!s) return false;
    const frameArea = W * H;
    if (!s.convex || s.area > frameArea * 4 || s.area < frameArea * 0.002) return false;
    if (s.wRatio < 0.35 || s.wRatio > 2.8 || s.hRatio < 0.35 || s.hRatio > 2.8) return false;
    if (s.aspect < 0.45 || s.aspect > 2.2) return false;
    const p = prevPose[idx], now = performance.now();
    if (p && now - p.t < 700) {
      let da = Math.abs(s.angle - p.angle); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da > 0.8 || s.area > p.area * 3.5 || s.area < p.area / 3.5) return false;   // giro > 45° o tamaño ×3.5 de golpe
    }
    prevPose[idx] = { ...s, t: now };
    return true;
  }
  // Comprobación de PRESENCIA (como la app original, "¿sigue el empaque en la imagen?"): cuando se ve bien la
  // bolsa se anotan sus colores principales (tonos de una cuadrícula 6×8 sobre la bolsa) y qué parte de la imagen
  // ocupan. Al perder el seguimiento se mide de nuevo en TODA la imagen: si esos colores casi desaparecieron, la
  // bolsa ya no está y el contenido se quita en ese mismo cuadro. No depende de la pose, así que una bolsa que
  // solo se movió rápido (y sigue en pantalla) no se pierde.
  const lookCanvas = document.createElement('canvas'); lookCanvas.width = 64; lookCanvas.height = Math.round(64 * H / W);
  const lookCtx = lookCanvas.getContext('2d', { willReadFrequently: true });
  const looks = {}; let lookN = 0;
  const HB = 18;
  function hueBin(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (mx < 50 || d < 0.3 * mx) return -1;               // gris, blanco, negro o muy oscuro: no cuenta
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return Math.min(HB - 1, (h / 360 * HB) | 0);
  }
  function grabThumb() {
    if (!ictx) return null;
    try { lookCtx.drawImage(ictx.canvas, 0, 0, lookCanvas.width, lookCanvas.height); } catch (e) { return null; }
    return lookCtx.getImageData(0, 0, lookCanvas.width, lookCanvas.height).data;
  }
  function fracIn(img, set) {
    let n = 0, tot = 0;
    for (let k = 0; k < img.length; k += 4) { tot++; const hb = hueBin(img[k], img[k + 1], img[k + 2]); if (hb >= 0 && set[hb]) n++; }
    return n / Math.max(1, tot);
  }
  function rememberLook(mvt, idx) {
    if ((lookN++ % 4) !== 0 && looks[idx]) return;          // cada 4 cuadros de rastreo basta
    if (!controller.markerDimensions || !controller.markerDimensions[idx]) return;
    const img = grabThumb(); if (!img) return;
    const sx = lookCanvas.width / W, sy = lookCanvas.height / H, cnt = new Array(HB).fill(0); let n = 0;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
      const p = projectMarkerPoint(mvt, idx, 0.12 + i * 0.152, 0.08 + j * 0.12);
      if (!p) return;
      const x = Math.round(p.x * sx), y = Math.round(p.y * sy);
      if (x < 0 || y < 0 || x >= lookCanvas.width || y >= lookCanvas.height) continue;
      const k = (y * lookCanvas.width + x) * 4, hb = hueBin(img[k], img[k + 1], img[k + 2]);
      if (hb >= 0) { cnt[hb]++; n++; }
    }
    if (n < 12) return;
    // tonos principales de la bolsa (y sus vecinos, por cambios de luz)
    const set = new Array(HB).fill(false);
    cnt.forEach((c, h) => { if (c >= Math.max(3, n * 0.12)) { set[h] = true; set[(h + 1) % HB] = true; set[(h + HB - 1) % HB] = true; } });
    const f0 = fracIn(img, set);
    if (f0 > 0.01) looks[idx] = { set, f0 };
  }
  function bagStillThere(mvt, idx) {
    const ref = looks[idx];
    if (!ref) return true;                                  // sin referencia: no se decide (no se quita)
    const img = grabThumb(); if (!img) return true;
    const f1 = fracIn(img, ref.set), ratio = f1 / ref.f0;
    controller.__lastPresence = Math.round(ratio * 100) / 100;
    return ratio > 0.4;
  }
  function hideNow(idx) {
    const st = controller.trackingStates && controller.trackingStates[idx];
    if (!st || !st.showing) return;
    st.showing = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null;
    controller.__presenceHides = (controller.__presenceHides || 0) + 1;
    controller.onUpdate && controller.onUpdate({ type: 'updateMatrix', targetIndex: idx, worldMatrix: null });
  }

  // Un solo sabor a la vez: cuando se rastrea un sabor, los demás que seguían "esperando" se ocultan al instante.
  function hideOtherFlavors(targetIndex) {
    const sts = controller.trackingStates; if (!sts) return;
    const mine = flavorOf(targetIndex);
    sts.forEach((st, i) => {
      if (i === targetIndex || !st.showing || flavorOf(i) === mine) return;
      st.showing = false; st.isTracking = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null;
      controller.onUpdate && controller.onUpdate({ type: 'updateMatrix', targetIndex: i, worldMatrix: null });
    });
  }

  controller._trackAndUpdate = async function (inputT, lastMVT, targetIndex) {
    if (controller.pipasSkipIdx && controller.pipasSkipIdx.has(targetIndex)) return null;   // marcador de diseño descartado
    // Giroscopio: la pose del cuadro anterior se gira lo que giró el celular desde entonces, así el rastreo busca
    // la bolsa donde está AHORA (antes se perdía al girar rápido porque la buscaba donde estaba).
    if (controller.__detIdx !== targetIndex) {
      // Mejor predicción: la pose del seguimiento cuadro a cuadro para ESTE cuadro (sabe cuánto se movió la bolsa);
      // si no hay, se gira con el giroscopio (solo sabe cuánto giró el celular).
      const F = window.__pipasFlow, fp = F && F.poseAt(targetIndex, controller.__inputT);
      lastMVT = fp || gyroRotate(lastMVT, controller.__prevInputT, controller.__inputT);
      if (fp) controller.__flowPredicts = (controller.__flowPredicts || 0) + 1;
    }
    let res = await origTrack(inputT, lastMVT, targetIndex);
    if (res !== null && !poseIsSane(res, targetIndex)) {
      badPose[targetIndex] = (badPose[targetIndex] || 0) + 1;
      controller.__badPoses = (controller.__badPoses || 0) + 1;
      if (badPose[targetIndex] >= 2) { badPose[targetIndex] = 0; delete prevPose[targetIndex]; res = null; }
      else return lastMVT;
    } else if (res !== null) badPose[targetIndex] = 0;
    if (res !== null) {
      hideOtherFlavors(targetIndex);
      // Con seguimiento firme (muchas coincidencias fuertes) se actualiza cómo se ve la bolsa. Con seguimiento
      // débil se comprueba que la bolsa siga en la imagen: si el seguimiento quedó "pegado" a la mesa o al fondo,
      // los colores de la bolsa ya no están y se suelta ya.
      const ts = controller.__trackStrong, strong = ts && ts.length ? ts[ts.length - 1] : 99;
      if (strong >= 8) rememberLook(res, targetIndex);
      else if ((lookN++ % 2) === 0 && !bagStillThere(res, targetIndex)) { hideNow(targetIndex); res = null; }
    }
    else delete prevPose[targetIndex];
    if (res === null) {
      recheck.strikes = 0;
      lockVerified.delete(targetIndex);
      // Bolsa arrugada / reflejos fuertes: el rastreo fino (que asume superficie plana) se pierde, pero el
      // empaque sigue visible. Se vuelve a ubicar por puntos clave en este mismo cuadro y, si el ganador
      // sigue siendo este sabor, se continúa en vez de soltarlo.
      if (opts.deformRescue === false) return null;
      try {
        let featurePoints;
        if (robust) {
          const near = detectAtWords(inputT, lastMVT, targetIndex) || [];
          featurePoints = near.concat(detectFullFrame(inputT, 2));
        } else featurePoints = this.cropDetector.detect(inputT).featurePoints;
        const m = await this._workerMatch(featurePoints, allTargets());
        if (m.targetIndex !== -1 && flavorOf(m.targetIndex) === flavorOf(targetIndex)) {
          let mvt = m.targetIndex === targetIndex ? m.modelViewTransform : null;
          if (!mvt) { // mismo sabor pero visto por el otro marcador (bolsa ↔ logo): pose de ESTE marcador
            const m2 = await this._workerMatch(featurePoints, [targetIndex]);
            mvt = m2.targetIndex === targetIndex ? m2.modelViewTransform : null;
          }
          if (mvt) { controller.__rescues = (controller.__rescues || 0) + 1; return mvt; }
        }
      } catch (e) { /* sin rescate */ }
      // Se perdió la bolsa. ¿Sigue en el mismo lugar (reflejo, movimiento rápido) o ya no está? Se compara cómo se
      // ve ahora esa zona con cómo se veía la bolsa: si ya no se parece, el contenido se quita YA (sin flotar).
      if (!bagStillThere(lastMVT, targetIndex)) hideNow(targetIndex);
      return null;
    }
    recheck.n++;
    const now = performance.now();
    firmT[flavorOf(targetIndex)] = now;
    const unverified = !lockVerified.has(targetIndex);
    // Se revisa el sabor cada ~0.4 s (por tiempo, no por cuadros: en celulares lentos 6 cuadros eran varios segundos)
    // Revisión del sabor: cada 0.4 s si el rastreo está flojo, cada 1.2 s si está firme (es costosa: menos revisiones =
    // más cuadros por segundo para seguir la bolsa)
    const tsx = controller.__trackStrong, strongNow = tsx && tsx.length ? tsx[tsx.length - 1] : 0;
    if (unverified || now - (recheck.t || 0) > (strongNow >= 12 ? 1200 : 400)) {
      recheck.t = now;
      try {
        const featurePoints = robust ? (detectAtWords(inputT, res, targetIndex) || this.cropDetector.detect(inputT).featurePoints)
                                     : this.cropDetector.detect(inputT).featurePoints;
        const m = await this._workerMatch(featurePoints, allTargets());
        const cands = m.candidates || [];
        const myFlavor = flavorOf(targetIndex);
        const mine = cands.filter(c => flavorOf(c.targetIndex) === myFlavor).reduce((a, c) => Math.max(a, c.inliers), 0);
        const winner = cands.find(c => c.targetIndex === m.targetIndex);
        const otherWins = m.targetIndex !== -1 && flavorOf(m.targetIndex) !== myFlavor && winner &&
          (m.decidedBy === 'logo' ? winner.inliers >= 8 || cands.some(c => c.logo && c.flavor === winner.flavor && c.inliers >= 8)
                                  : winner.inliers >= 10 && winner.inliers >= mine * 1.4 + 4);
        lockVerified.add(targetIndex);
        const flagrant = otherWins && winner.inliers >= mine * 2 + 10;
        (controller.__recheckLog || (controller.__recheckLog = [])).push([targetIndex, m.targetIndex, m.decidedBy, winner ? winner.inliers : 0, mine, otherWins ? 1 : 0]);
        if (controller.__recheckLog.length > 300) controller.__recheckLog.splice(0, 100);
        if (otherWins) {
          recheck.strikes++;
          // Las PALABRAS "MEGA + sabor" de otro sabor son evidencia directa de que cambiaron la bolsa: se suelta ya.
          if (recheck.strikes >= 2 || flagrant || unverified || m.decidedBy === 'logo') {
            recheck.strikes = 0;
            lockVerified.delete(targetIndex);
            const st = this.trackingStates && this.trackingStates[targetIndex];
            if (st) { // sabor equivocado: se oculta YA (sin periodo de gracia)
              st.showing = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null;
              this.onUpdate && this.onUpdate({ type: 'updateMatrix', targetIndex, worldMatrix: null });
            }
            controller.__wrongDrops = (controller.__wrongDrops || 0) + 1;
            controller.__aiBan[myFlavor] = now + 4000; firmT[myFlavor] = 0;
            return null;
          }
        } else {
          recheck.strikes = 0;
        }
      } catch (e) { /* si falla la comprobación, se sigue rastreando */ }
    }
    // Verificación cruzada con la IA: varias bolsas reales comparten media bolsa (personaje, semilla, logo) y MindAR a
    // veces engancha la mitad de abajo de OTRO sabor (Acid sobre Pica Limón). Si el rastreo no está firme y la IA,
    // muy segura, ve otro sabor dos veces seguidas, se suelta este sabor y se bloquea 2.5 s para que entre el correcto.
    if (controller.pipasAI && strongNow < 12 && now - (xcheck.t || 0) > 380 && video.readyState >= 2) {
      xcheck.t = now;
      try {
        const r = controller.pipasAI.runOn(video, bagRect(res, targetIndex)), myFl = flavorOf(targetIndex);
        if (r) {
          controller.__ai = { t: now, ms: performance.now() - now, cls: r.cls, prob: r.prob };
          if (r.cls > 0 && r.cls - 1 !== myFl && r.prob >= 0.9) {
            if (xcheck.fl === r.cls && xcheck.idx === targetIndex) xcheck.n++; else { xcheck.n = 1; xcheck.fl = r.cls; xcheck.idx = targetIndex; }
            // dos revisiones seguidas, o una sola si la IA está casi segura y MindAR casi no tiene puntos firmes
            if (xcheck.n >= 2 || (r.prob >= 0.98 && strongNow < 6)) {
              xcheck.n = 0; mindBan[myFl] = now + 2500; firmT[myFl] = 0; lockVerified.delete(targetIndex);
              const st = this.trackingStates && this.trackingStates[targetIndex];
              if (st) { st.showing = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null; this.onUpdate && this.onUpdate({ type: 'updateMatrix', targetIndex, worldMatrix: null }); }
              const F = window.__pipasFlow; if (F && F.out.ok && flavorOf(F.out.idx) === myFl) F.reset();
              controller.__aiCrossDrops = (controller.__aiCrossDrops || 0) + 1;
              return null;
            }
          } else xcheck.n = 0;
        }
      } catch (e) { /* sin IA */ }
    }
    const GU = gateUpdate(targetIndex, res, now);
    if (GU && GU.redo) {
      // ANCLAJE: la pose se rehace desde las 4 esquinas que ubicó la IA y MindAR sigue desde ahí (se corrige al momento)
      try {
        const cs = markerBagCorners(targetIndex), kx = W / (video.videoWidth || W), ky = H / (video.videoHeight || H);
        const Hm = cs && homog4(cs, GU.px.map(([x, y]) => [x * kx, y * ky])), mvt = Hm && homToMvt(Hm);
        if (mvt) {
          const r2 = await origTrack(inputT, mvt, targetIndex);
          if (r2 && poseIsSane(r2, targetIndex)) { controller.__reanchor = (controller.__reanchor || 0) + 1; delete prevPose[targetIndex]; return r2; }
        }
      } catch (e) { /* si no se puede, se suelta y se busca de nuevo */ }
      const st = this.trackingStates && this.trackingStates[targetIndex];
      if (st) { st.showing = false; st.isTracking = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null; this.onUpdate && this.onUpdate({ type: 'updateMatrix', targetIndex, worldMatrix: null }); }
      const F = window.__pipasFlow; if (F && F.out.ok && F.out.idx === targetIndex) F.reset();
      lockVerified.delete(targetIndex);
      return null;
    }
    (controller.__gateIdx || (controller.__gateIdx = [])).push(targetIndex); if (controller.__gateIdx.length > 60) controller.__gateIdx.shift();
    return res;
  };
  const xcheck = { t: 0, n: 0, fl: 0, idx: -1 }; controller.__xcheck = xcheck;
  // zona (rectángulo) de la bolsa en px del video, desde su pose (3×4) → para que la IA mire solo esa bolsa
  function bagRect(mvt, idx) {
    const K = controller.projectionTransform, dm = controller.markerDimensions && controller.markerDimensions[idx];
    if (!K || !dm || !mvt) return null;
    const sx = (video.videoWidth || W) / W, sy = (video.videoHeight || H) / H;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // marcador de PALABRAS: cubre solo el recuadro "MEGA + sabor" → se extiende a la bolsa entera con su zona
    let cs = [[0, 0], [dm[0], 0], [dm[0], dm[1]], [0, dm[1]]];
    const Lk = controller.pipasLayout, z = controller.pipasZones && controller.pipasZones[flavorOf(idx)];
    if (Lk && Lk[Math.floor(idx / NF)] === 'palabras' && z) {
      const zx0 = z.x0 ?? 0, zx1 = z.x1 ?? 1, zw = Math.max(0.05, zx1 - zx0), zh = Math.max(0.05, z.y1 - z.y0);
      const U = (fx) => (fx - zx0) / zw * dm[0], V = (fy) => (fy - z.y0) / zh * dm[1];
      cs = [[U(0), V(0)], [U(1), V(0)], [U(1), V(1)], [U(0), V(1)]];
    }
    for (const [u, v] of cs) {
      const X = mvt[0][0] * u + mvt[0][1] * v + mvt[0][3], Y = mvt[1][0] * u + mvt[1][1] * v + mvt[1][3], Z = mvt[2][0] * u + mvt[2][1] * v + mvt[2][3];
      if (!(Z > 0)) return null;
      const px = (K[0][0] * X + K[0][2] * Z) / Z * sx, py = (K[1][1] * Y + K[1][2] * Z) / Z * sy;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return x1 - x0 > 8 && y1 - y0 > 8 ? { x0, y0, x1, y1 } : null;
  }
  controller.pipasBagRect = bagRect;

  /* ---------------- COMPUERTA DE ALINEACIÓN (anclaje por empaque, confirmado por la IA) ----------------
     La primera pose que calcula MindAR a veces sale volteada, girada o corrida. El contenido NO se muestra hasta que:
       1) la pose es coherente: la bolsa se ve de frente (no espejada) y con forma de bolsa;
       2) es estable en cuadros seguidos (sin saltos de posición, tamaño ni giro);
       3) el ANCLAJE de la IA coincide: la IA ubica por su cuenta el centro y las 4 esquinas de la bolsa (en orden:
          arriba-izq., arriba-der., abajo-der., abajo-izq.) y deben caer donde MindAR dice que está la bolsa. Si el
          contenido iba a salir girado o volteado, las esquinas no coinciden y se espera.
     Si la IA no logra ubicar bien las esquinas (luz, reflejo) pero la pose está muy estable y la IA no dice otro sabor,
     se acepta tras más cuadros estables. */
  const gate = [];
  function markerBagCorners(idx) {          // las 4 esquinas de la BOLSA en coordenadas del marcador idx
    const dm = controller.markerDimensions && controller.markerDimensions[idx]; if (!dm) return null;
    const Lk = controller.pipasLayout, z = controller.pipasZones && controller.pipasZones[flavorOf(idx)];
    if (Lk && Lk[Math.floor(idx / NF)] === 'palabras' && z) {
      const zx0 = z.x0 ?? 0, zx1 = z.x1 ?? 1, zw = Math.max(0.05, zx1 - zx0), zh = Math.max(0.05, z.y1 - z.y0);
      return [[(0 - zx0) / zw * dm[0], (0 - z.y0) / zh * dm[1]], [(1 - zx0) / zw * dm[0], (0 - z.y0) / zh * dm[1]], [(1 - zx0) / zw * dm[0], (1 - z.y0) / zh * dm[1]], [(0 - zx0) / zw * dm[0], (1 - z.y0) / zh * dm[1]]];
    }
    return [[0, 0], [dm[0], 0], [dm[0], dm[1]], [0, dm[1]]];
  }
  function bagCorners(mvt, idx) {
    const K = controller.projectionTransform, cs = markerBagCorners(idx);
    if (!K || !cs || !mvt) return null;
    const sx = (video.videoWidth || W) / W, sy = (video.videoHeight || H) / H;
    const out = [];
    for (const [u, v] of cs) {
      const X = mvt[0][0] * u + mvt[0][1] * v + mvt[0][3], Y = mvt[1][0] * u + mvt[1][1] * v + mvt[1][3], Z = mvt[2][0] * u + mvt[2][1] * v + mvt[2][3];
      if (!(Z > 0)) return null;
      out.push([(K[0][0] * X + K[0][2] * Z) / Z * sx, (K[1][1] * Y + K[1][2] * Z) / Z * sy]);
    }
    return out;
  }
  function gateUpdate(idx, mvt, now) {
    const fl = flavorOf(idx), g = gate[fl] || (gate[fl] = { n: 0, last: null, t: 0, aiT: 0, aiOk: 0, aiBad: 0, miss: 0, ready: false });
    const gap = Math.max(450, 3 * (controller.__frameMs || 0));   // celulares lentos: más tiempo entre cuadros
    if (now - g.t > gap) { g.n = 0; g.last = null; g.ready = false; g.aiOk = 0; g.aiBad = 0; g.miss = 0; }   // se perdió: empieza de nuevo
    g.t = now;
    if (g.ready) return;
    const q = bagCorners(mvt, idx);
    if (!q) { g.n = 0; return; }
    const v = (a, b) => [b[0] - a[0], b[1] - a[1]], cr = (a, b) => a[0] * b[1] - a[1] * b[0];
    const e1 = v(q[0], q[1]), e2 = v(q[0], q[3]), diag = Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]);
    // 1) coherente: de frente (no espejada), convexa, y de tamaño razonable en pantalla
    let convex = true; for (let i = 0; i < 4; i++) if (cr(v(q[i], q[(i + 1) & 3]), v(q[(i + 1) & 3], q[(i + 2) & 3])) <= 0) convex = false;
    const wpx = video.videoWidth || W;
    if (!(cr(e1, e2) > 0) || !convex || diag < wpx * 0.12 || diag > wpx * 4) { g.n = 0; g.last = null; controller.__gateBad = (controller.__gateBad || 0) + 1; return; }
    // 2) estable respecto a la pose anterior
    const c = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2], ang = Math.atan2(e1[1], e1[0]);
    if (g.last) {
      const dc = Math.hypot(c[0] - g.last.c[0], c[1] - g.last.c[1]) / diag, ds = Math.abs(diag / g.last.diag - 1);
      let da = Math.abs(ang - g.last.ang); if (da > Math.PI) da = 2 * Math.PI - da;
      g.n = dc < 0.08 && ds < 0.12 && da < 0.14 ? g.n + 1 : 1;
    } else g.n = 1;
    g.last = { c, diag, ang, q };
    // 3) anclaje de la IA: centro y esquinas (cada ~0.2 s mientras se alinea)
    const AI = controller.pipasAI;
    if (AI && video.readyState >= 2 && now - g.aiT > 200) {
      g.aiT = now;
      try {
        const xs = q.map(p => p[0]), ys = q.map(p => p[1]);
        const r = AI.runOn(video, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
        if (r) {
          controller.__ai = { t: now, ms: performance.now() - now, cls: r.cls, prob: r.prob };
          if (r.cls > 0 && r.cls - 1 !== fl && r.prob >= 0.85) { g.aiBad++; g.aiOk = 0; }
          else if (r.cls - 1 === fl && r.prob >= 0.5 && r.px) {
            let d = 0; for (let k = 0; k < 4; k++) d += Math.hypot(r.px[k][0] - q[k][0], r.px[k][1] - q[k][1]);
            const ac = [(r.px[0][0] + r.px[2][0]) / 2, (r.px[0][1] + r.px[2][1]) / 2];
            const centerOk = Math.hypot(ac[0] - c[0], ac[1] - c[1]) / diag < 0.22;
            g.anchorErr = +(d / 4 / diag).toFixed(2);
            g.aiBad = 0;
            if (d / 4 / diag < 0.28 && centerOk) { g.aiOk++; g.miss = 0; }
            else {
              g.aiOk = 0;
              // la IA está segura del sabor pero la bolsa NO está donde MindAR dice (pose girada/agrandada/corrida):
              // dos veces seguidas → se suelta esa pose y se vuelve a enganchar desde las esquinas de la IA
              if (r.prob >= 0.8 && d / 4 / diag > 0.35) g.miss++;
              if (g.miss >= 2) { g.miss = 0; g.n = 0; g.last = null; controller.__gateRedo = (controller.__gateRedo || 0) + 1; return { redo: true, px: r.px }; }
            }
          }
        }
      } catch (e) { /* sin IA */ }
    }
    // con IA: SIEMPRE tiene que coincidir su anclaje (centro + esquinas). Sin IA: solo estabilidad.
    g.ready = AI ? (g.n >= 2 && g.aiOk >= 1 && g.aiBad === 0) : g.n >= 3;
    if (g.ready) controller.__gateOk = (controller.__gateOk || 0) + 1;
  }
  /** ¿La pose de este sabor ya está bien alineada para mostrar el contenido? (js/app.js) */
  controller.pipasPoseReady = (fl) => { const g = gate[fl]; return !!(g && g.ready && performance.now() - g.t < Math.max(600, 3 * (controller.__frameMs || 0))); };
  controller.pipasGate = gate;
  const mindBan = new Array(NF).fill(0); controller.__mindBan = mindBan;

  /* ------------------------------------------------------------------ giroscopio + cuadros borrosos */
  // Gira una pose de MindAR (3×4, ejes x derecha / y abajo / z adelante) lo que giró la cámara entre t0 y t1.
  function gyroRotate(m, t0, t1) {
    const G = window.__pipasGyro;
    if (!m || !G || window.PIPAS_GYRO === false || !(t0 > 0) || !(t1 > t0)) return m;
    const C = G.cameraDeltaCV(t0, t1);
    if (!C) return m;
    const tr = C[0][0] + C[1][1] + C[2][2];
    if (tr > 2.99999) return m;                                  // sin giro apreciable
    if (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) > 0.6) return m;   // >34°: dato raro, no se usa
    const out = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++)
      out[r][c] = C[r][0] * m[0][c] + C[r][1] * m[1][c] + C[r][2] * m[2][c];
    controller.__gyroUses = (controller.__gyroUses || 0) + 1;
    return out;
  }

  // Marcadores "borrosos" (la bolsa desenfocada por movimiento en 4 direcciones, compilados a media resolución):
  // solo sirven para RECONOCER la bolsa en un cuadro movido. Si gana uno, el resultado se pasa al marcador normal del
  // mismo sabor (foto real, o la bolsa) con la pose convertida, y el sabor queda "sin confirmar" para que se revise
  // con las palabras en cuanto llegue un cuadro nítido.
  function blurInfo(idx) {
    const L = controller.pipasLayout;
    if (!L || idx < 0) return null;
    const g = Math.floor(idx / NF), kind = L[g];
    // 'borroso' = bolsa desenfocada; 'ladoX' / 'ladoY' = bolsa vista inclinada de lado / hacia atrás (comprimida)
    if (kind !== 'borroso' && !(typeof kind === 'string' && kind.startsWith('lado'))) return null;
    const fl = idx % NF, gFoto = L.indexOf('foto');
    const to = (gFoto > 0 ? gFoto : 0) * NF + fl;
    const dims = controller.markerDimensions || [], a = dims[idx], b = dims[to];
    if (!a || !b) return null;
    return { to, sx: a[0] / b[0], sy: a[1] / b[1], blur: kind === 'borroso' };
  }
  // Para no mostrar el sabor equivocado con un cuadro borroso: se acepta si es el sabor que se estaba viendo hace
  // un momento (la bolsa se movió) o si dos cuadros borrosos seguidos dicen el mismo sabor.
  let lastShown = { fl: -1, t: 0 }, lastBlur = { fl: -1, t: 0 }, flowGone = 0, searchTurn = 0, aiVeto = 0;
  // quita YA el contenido de ese sabor (todos sus marcadores)
  function dropFlavor(idx) {
    const fl = flavorOf(idx), sts = controller.trackingStates || [];
    firmT[fl] = 0;
    sts.forEach((st, i) => { if (flavorOf(i) === fl && st.showing && !st.isTracking) hideNow(i); });
  }
  function noteShown() {
    const sts = controller.trackingStates || [], now = performance.now();
    for (let i = 0; i < sts.length; i++) if (sts[i].showing) { lastShown = { fl: flavorOf(i), t: now }; break; }
  }
  function mapBlur(r) {
    if (!r || r.targetIndex === -1) return r;
    const bi = blurInfo(r.targetIndex);
    if (!bi) return r;
    const m = r.modelViewTransform;
    // punto (x,y) del marcador normal = (x·sx, y·sy) del marcador extra → columnas x e y por sx, sy
    const mvtOf = () => m.map(row => [row[0] * bi.sx, row[1] * bi.sy, row[2], row[3]]);
    if (!bi.blur) {   // bolsa inclinada: imagen nítida, se acepta (el sabor se confirma con las palabras enseguida)
      controller.__tiltHits = (controller.__tiltHits || 0) + 1;
      lockVerified.delete(bi.to);
      return { targetIndex: bi.to, modelViewTransform: mvtOf() };
    }
    const fl = flavorOf(r.targetIndex), now = performance.now();
    const sameAsShown = lastShown.fl === fl && now - lastShown.t < 1500;
    const confirmed = lastBlur.fl === fl && now - lastBlur.t < 1200;
    lastBlur = { fl, t: now };
    if (!sameAsShown && !confirmed) { controller.__blurWait = (controller.__blurWait || 0) + 1; return { targetIndex: -1, modelViewTransform: null }; }
    const mvt = mvtOf();
    controller.__blurHits = (controller.__blurHits || 0) + 1;
    lockVerified.delete(bi.to);
    return { targetIndex: bi.to, modelViewTransform: mvt };
  }

  /* ------------------------------------------------------------------ IA (js/ai.js) */
  // La IA dice qué sabor es y dónde están sus 4 esquinas. Con eso: (1) se calcula una pose inicial y se intenta el
  // rastreo directo desde ahí; (2) si no basta, se "endereza" la bolsa (transformación afín sobre un lienzo, por
  // GPU) y MindAR la busca SOLO entre los marcadores de ese sabor.
  function mul3(A, B) { const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]; return C; }
  function inv3(M) {
    const [a, b, c] = M[0], [d, e, f] = M[1], [g, h, i] = M[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det], [B / det, (a * i - c * g) / det, -(a * f - c * d) / det], [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function homog4(src, dst) {     // homografía exacta de 4 puntos
    const A = [], b = [];
    for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
    for (let c = 0; c < 8; c++) {
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < 8; r++) { const k = A[r][c] / A[c][c]; for (let j = c; j < 8; j++) A[r][j] -= k * A[c][j]; b[r] -= k * b[c]; }
    }
    const h = new Array(8); for (let r = 7; r >= 0; r--) { let t = b[r]; for (let j = r + 1; j < 8; j++) t -= A[r][j] * h[j]; h[r] = t / A[r][r]; }
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }
  function homToMvt(Hm) {         // homografía marcador → px de entrada  →  pose 3×4 de MindAR
    const Ki = inv3(controller.projectionTransform); if (!Ki) return null;
    const A = mul3(Ki, Hm);
    const c0 = [A[0][0], A[1][0], A[2][0]], c1 = [A[0][1], A[1][1], A[2][1]], c2 = [A[0][2], A[1][2], A[2][2]];
    let lam = 2 / (Math.hypot(...c0) + Math.hypot(...c1)); if (c2[2] * lam < 0) lam = -lam;
    const r1 = c0.map(v => v * lam), r2 = c1.map(v => v * lam), t = c2.map(v => v * lam);
    const n1 = Math.hypot(...r1), u1 = r1.map(v => v / n1);
    const dp = u1[0] * r2[0] + u1[1] * r2[1] + u1[2] * r2[2];
    let u2 = [r2[0] - dp * u1[0], r2[1] - dp * u1[1], r2[2] - dp * u1[2]]; const n2 = Math.hypot(...u2); u2 = u2.map(v => v / n2);
    const u3 = [u1[1] * u2[2] - u1[2] * u2[1], u1[2] * u2[0] - u1[0] * u2[2], u1[0] * u2[1] - u1[1] * u2[0]];
    return [[u1[0], u2[0], u3[0], t[0]], [u1[1], u2[1], u3[1], t[1]], [u1[2], u2[2], u3[2], t[2]]];
  }
  function flavorTargets(fl, targetIndexes) {   // marcadores normales (bolsa, palabras, foto) de un sabor
    const Lr = controller.pipasLayout;
    return targetIndexes.filter(i => flavorOf(i) === fl && (!Lr || ['bolsa', 'palabras', 'foto'].includes(Lr[Math.floor(i / NF)])));
  }
  async function aiDetect(self, inputT, targetIndexes, src = video) {
    const AI = controller.pipasAI; if (!AI || !src || (src === video && video.readyState < 2)) return null;
    const t0 = performance.now();
    let r; try { r = AI.runOn(src); } catch (e) { return null; }
    controller.__ai = { t: t0, ms: performance.now() - t0, cls: r ? r.cls : 0, prob: r ? r.prob : 0 };
    if (!r || r.cls === 0 || r.prob < 0.6) return null;
    const fl = r.cls - 1, sx = W / (src.videoWidth || src.width || W), sy = H / (src.videoHeight || src.height || H);
    if (performance.now() < aiBan[fl]) return null;
    const q = r.px.map(([x, y]) => [x * sx, y * sy]);          // esquinas en px de la entrada de MindAR
    const idxs = flavorTargets(fl, targetIndexes); if (!idxs.length) return null;
    // (1) pose inicial desde las esquinas → rastreo directo con el marcador de la foto real (o la bolsa)
    const Lr = controller.pipasLayout, gF = Lr ? Lr.indexOf('foto') : -1;
    const idx = (gF > 0 ? gF : 0) * NF + fl, dm = controller.markerDimensions && controller.markerDimensions[idx];
    if (dm && targetIndexes.includes(idx)) {
      const Hm = homog4([[0, 0], [dm[0], 0], [dm[0], dm[1]], [0, dm[1]]], q);
      const mvt = Hm && homToMvt(Hm);
      if (mvt) {
        try {
          const res = await origTrack(inputT, mvt, idx);
          if (res && poseIsSane(res, idx)) { controller.__aiTrack = (controller.__aiTrack || 0) + 1; lockVerified.delete(idx); return { targetIndex: idx, modelViewTransform: res }; }
        } catch (e) { /* sigue con (2) */ }
      }
    }
    controller.__aiHint = { fl, t: performance.now(), prob: r.prob };
    return null;
  }
  let aiTurn = 0;
  // Si la IA dijo un sabor y el rastreo terminó siendo de OTRO sabor (bolsas con el mismo diseño), ese sabor queda
  // vetado para la IA unos segundos: antes se repetía en bucle (IA → sabor equivocado → se suelta → IA otra vez) y
  // la barra marcaba 100 % sin mostrar nada, y la búsqueda normal quedaba restringida al sabor equivocado.
  const aiBan = new Array(NF).fill(0);
  controller.__aiBan = aiBan;
  controller.pipasAIDetect = (inputT, idxs, src) => aiDetect(controller, inputT, idxs, src);   // para pruebas

  const innerDetect = controller._detectAndMatch.bind(controller);
  controller._detectAndMatch = async function (inputT, targetIndexes) {
    const sts = this.trackingStates || [];
    noteShown();
    // marcadores de diseño que no se parecen a la bolsa real de ese sabor (realOnly): nunca se usan
    if (controller.pipasSkipIdx && controller.pipasSkipIdx.size) targetIndexes = targetIndexes.filter(i => !controller.pipasSkipIdx.has(i));
    // sabor bloqueado un momento por la verificación cruzada con la IA: no se busca ni se retoma
    { const nb = performance.now(); if (mindBan.some(t => t > nb)) targetIndexes = targetIndexes.filter(i => nb >= mindBan[flavorOf(i)]); }
    // El seguimiento cuadro a cuadro sigue "viendo" la bolsa pero MindAR no: se comprueba por color que la bolsa siga
    // en la imagen; si no está (2 cuadros seguidos) se suelta → el contenido no queda flotando.
    {
      const F = window.__pipasFlow, fo = F && F.out;
      // (solo si la bolsa se ve en la imagen: si salió de cuadro y la pared sostiene la pose, no hay nada que mirar)
      if (fo && fo.ok && !(sts[fo.idx] && sts[fo.idx].isTracking) && !(fo.wall && fo.vis < 0.6)) {
        let gone = !bagStillThere(fo.mvt, fo.idx);
        // la IA mira el cuadro: si ve OTRO sabor o ninguna bolsa con seguridad, el contenido no es de aquí
        if (!gone && controller.pipasAI && video.readyState >= 2) {
          try {
            const t0 = performance.now(), r = controller.pipasAI.runOn(video, bagRect(fo.mvt, fo.idx));
            if (r) {
              controller.__ai = { t: t0, ms: performance.now() - t0, cls: r.cls, prob: r.prob };
              // con el celular o la bolsa moviéndose rápido la imagen sale borrosa y la IA puede decir "no hay bolsa":
              // en ese caso solo cuenta si dice OTRO sabor (la bolsa ausente la detecta el color)
              const G = window.__pipasGyro, fast = (G && G.state && G.state.rate > 45) || (performance.now() - (fo.fastT || 0) < 400);
              const other = r.cls > 0 && r.cls !== flavorOf(fo.idx) + 1;
              if ((other || (!fast && r.cls === 0)) && r.prob >= 0.85) { if (++aiVeto >= (fast ? 3 : 2)) { gone = true; controller.__aiVetos = (controller.__aiVetos || 0) + 1; } }
              else aiVeto = 0;
            }
          } catch (e) { /* sin IA */ }
        }
        if (gone) { if (++flowGone >= 2 || aiVeto >= 2) { dropFlavor(fo.idx); F.reset(); flowGone = 0; aiVeto = 0; controller.__flowDrops = (controller.__flowDrops || 0) + 1; } }
        else flowGone = 0;
      } else flowGone = 0;
    }
    // Bolsa recién perdida (cuadro borroso): su pose se sigue girando con el giroscopio, así el contenido se queda
    // sobre la bolsa (MindAR lo sigue mostrando con esta pose durante la espera) y se intenta retomar el rastreo
    // desde ahí, que es mucho más barato y rápido que volver a reconocerla desde cero.
    for (let i = 0; i < sts.length; i++) {
      const ts = sts[i];
      if (!ts.showing || ts.isTracking || !ts.currentModelViewTransform) continue;
      const F = window.__pipasFlow, fp = F && F.poseAt(i, this.__inputT);
      ts.currentModelViewTransform = fp || gyroRotate(ts.currentModelViewTransform, this.__prevInputT, this.__inputT);
      if (targetIndexes.indexOf(i) === -1 || blurInfo(i)) continue;
      try {
        const res = await origTrack(inputT, ts.currentModelViewTransform, i);
        if (res && poseIsSane(res, i)) {
          controller.__gyroRecovers = (controller.__gyroRecovers || 0) + 1; lockVerified.delete(i);
          this.__detIdx = i;
          return { targetIndex: i, modelViewTransform: res };
        }
      } catch (e) { /* sigue la búsqueda normal */ }
    }
    // Los 16 marcadores borrosos hacen más lenta la búsqueda: solo se usan si hace poco se veía una bolsa
    // (se movió); al buscar desde cero se usan solo los 12 normales (reconoce más rápido).
    {
      const F = window.__pipasFlow, fo = F && F.out;
      if (fo && fo.ok && targetIndexes.indexOf(fo.idx) !== -1 && !(sts[fo.idx] && sts[fo.idx].showing)) {
        const fp = F.poseAt(fo.idx, this.__inputT);
        if (fp) {
          try {
            const res = await origTrack(inputT, fp, fo.idx);
            if (res && poseIsSane(res, fo.idx)) { controller.__flowRecovers = (controller.__flowRecovers || 0) + 1; lockVerified.delete(fo.idx); this.__detIdx = fo.idx; return { targetIndex: fo.idx, modelViewTransform: res }; }
          } catch (e) { /* búsqueda normal */ }
        }
      }
    }
    // IA en cada cuadro de búsqueda: dice qué sabor y dónde están sus esquinas; con eso se intenta el rastreo directo
    // (funciona aunque el empaque esté inclinado o en diagonal). Si no basta, la búsqueda normal de este mismo cuadro
    // se hace solo con ese sabor (más rápida y sin confundir sabores).
    let aiFl = -1;
    if (controller.pipasAI && !sts.some(x => x.showing)) {
      controller.__aiHint = null;
      const ar = await aiDetect(this, inputT, targetIndexes);
      if (ar) { this.__detIdx = ar.targetIndex; return ar; }
      const h = controller.__aiHint; if (h && h.prob >= 0.92 && performance.now() >= aiBan[h.fl]) aiFl = h.fl;
    }
    if (aiFl >= 0 && (aiTurn++ % 2) === 0) targetIndexes = targetIndexes.filter(i => flavorOf(i) === aiFl);   // 1 de cada 4: todos (por si la IA se equivoca)
    const recent = performance.now() - lastShown.t < 1500;
    // Búsqueda en dos velocidades: la bolsa y la foto real en TODOS los cuadros (lo más rápido y lo que más reconoce);
    // las palabras 1 de cada 2, la bolsa inclinada 1 de cada 3 y la desenfocada solo si hace poco se veía una bolsa.
    searchTurn++;
    const L = controller.pipasLayout;
    const idxs = targetIndexes.filter(i => {
      const k = L ? L[Math.floor(i / NF)] : 'bolsa';
      if (k === 'borroso') return recent;
      if (typeof k === 'string' && k.startsWith('lado')) return searchTurn % 3 === 0;
      if (k === 'palabras') return recent || searchTurn % 2 === 0;
      return true;
    });
    const r = mapBlur(await innerDetect(inputT, idxs));
    if (r && r.targetIndex !== -1) this.__detIdx = r.targetIndex;
    return r;
  };
}
