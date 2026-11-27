/**
 * Pipas Mega RA — IA que encuentra el empaque.
 *
 * Una red neuronal pequeña (≈5 millones de operaciones, corre en JavaScript puro en pocos ms) entrenada con miles de
 * imágenes de los 4 empaques: de frente, inclinados, en diagonal, borrosos, con poca luz, reflejos, arrugados y
 * tapados por la mano. Para cada cuadro de la cámara responde:
 *   - qué sabor se ve (o ninguno) y con qué seguridad,
 *   - dónde están las 4 esquinas del empaque.
 * La app usa eso para "enderezar" el empaque (aunque esté en diagonal) y pedirle a MindAR la posición exacta solo
 * de ese sabor: reconoce más rápido y sin confundir sabores. Los pesos están en models/pipas_ai.json.
 */
function b64f32(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}

export async function loadAI(url = 'models/pipas_ai.json') {
  const res = await fetch(url, { cache: 'no-cache' });   // revisa si hay una IA nueva (si no cambió, el navegador usa la guardada)
  if (!res.ok) throw new Error('No se pudo cargar la IA: ' + res.status);
  const m = await res.json();
  const layers = m.layers.map(l => ({ ...l, w: b64f32(l.w), b: b64f32(l.b) }));
  const [IH, IW, IC] = m.input;
  // búferes reutilizables (sin crear memoria en cada cuadro)
  const bufs = [new Float32Array(IH * IW * 128), new Float32Array(IH * IW * 128)];
  const pad = (n, k, s) => { const o = Math.ceil(n / s), tot = Math.max((o - 1) * s + k - n, 0); return [o, tot >> 1]; };

  function conv(inp, H, W, l, out) {          // conv 3×3 normal (primera capa)
    const { cin, cout, s } = l, w = l.w, b = l.b, k = 3;
    const [OH, pt] = pad(H, k, s), [OW, pl] = pad(W, k, s);
    for (let oy = 0; oy < OH; oy++) for (let ox = 0; ox < OW; ox++) {
      const o = (oy * OW + ox) * cout;
      for (let co = 0; co < cout; co++) out[o + co] = b[co];
      for (let ky = 0; ky < k; ky++) {
        const iy = oy * s + ky - pt; if (iy < 0 || iy >= H) continue;
        for (let kx = 0; kx < k; kx++) {
          const ix = ox * s + kx - pl; if (ix < 0 || ix >= W) continue;
          const ib = (iy * W + ix) * cin, wb = (ky * k + kx) * cin * cout;
          for (let ci = 0; ci < cin; ci++) {
            const v = inp[ib + ci]; if (v === 0) continue;
            const wr = wb + ci * cout;
            for (let co = 0; co < cout; co++) out[o + co] += v * w[wr + co];
          }
        }
      }
      for (let co = 0; co < cout; co++) if (out[o + co] < 0) out[o + co] = 0;
    }
    return [OH, OW, cout];
  }
  function dw(inp, H, W, l, out) {            // depthwise 3×3
    const { c, s } = l, w = l.w, b = l.b, k = 3;
    const [OH, pt] = pad(H, k, s), [OW, pl] = pad(W, k, s);
    for (let oy = 0; oy < OH; oy++) for (let ox = 0; ox < OW; ox++) {
      const o = (oy * OW + ox) * c;
      for (let ch = 0; ch < c; ch++) out[o + ch] = b[ch];
      for (let ky = 0; ky < k; ky++) {
        const iy = oy * s + ky - pt; if (iy < 0 || iy >= H) continue;
        for (let kx = 0; kx < k; kx++) {
          const ix = ox * s + kx - pl; if (ix < 0 || ix >= W) continue;
          const ib = (iy * W + ix) * c, wb = (ky * k + kx) * c;
          for (let ch = 0; ch < c; ch++) out[o + ch] += inp[ib + ch] * w[wb + ch];
        }
      }
      for (let ch = 0; ch < c; ch++) if (out[o + ch] < 0) out[o + ch] = 0;
    }
    return [OH, OW, c];
  }
  function pw(inp, H, W, l, out) {            // 1×1
    const { cin, cout } = l, w = l.w, b = l.b, n = H * W;
    for (let p = 0; p < n; p++) {
      const ib = p * cin, o = p * cout;
      for (let co = 0; co < cout; co++) out[o + co] = b[co];
      for (let ci = 0; ci < cin; ci++) {
        const v = inp[ib + ci]; if (v === 0) continue;
        const wr = ci * cout;
        for (let co = 0; co < cout; co++) out[o + co] += v * w[wr + co];
      }
      for (let co = 0; co < cout; co++) if (out[o + co] < 0) out[o + co] = 0;
    }
    return [H, W, cout];
  }
  function dense(inp, n, l, relu) {
    const [, m] = l.wshape, w = l.w, out = new Float32Array(m);
    for (let j = 0; j < m; j++) out[j] = l.b[j];
    for (let i = 0; i < n; i++) { const v = inp[i]; if (v === 0) continue; const r = i * m; for (let j = 0; j < m; j++) out[j] += v * w[r + j]; }
    if (relu) for (let j = 0; j < m; j++) if (out[j] < 0) out[j] = 0;
    return out;
  }

  /** x: Float32Array H×W×3 con valores 0..255 (fila por fila, RGB). */
  function run(x) {
    let cur = bufs[0], nxt = bufs[1];
    for (let i = 0; i < x.length; i++) cur[i] = x[i] / 255;
    let H = IH, W = IW, C = IC;
    for (const l of layers) {
      if (l.t === 'dense') break;
      [H, W, C] = l.t === 'conv' ? conv(cur, H, W, l, nxt) : l.t === 'dw' ? dw(cur, H, W, l, nxt) : pw(cur, H, W, l, nxt);
      const t = cur; cur = nxt; nxt = t;
    }
    const L = layers.filter(l => l.t === 'dense');
    const h = dense(cur, H * W * C, L[0], true), logits = dense(h, h.length, L[1], false), cor = dense(h, h.length, L[2], false);
    const mx = Math.max(...logits), ex = Array.from(logits, v => Math.exp(v - mx)), sum = ex.reduce((a, b) => a + b, 0);
    const probs = ex.map(v => v / sum);
    let cls = 0; for (let i = 1; i < probs.length; i++) if (probs[i] > probs[cls]) cls = i;
    return { cls, prob: probs[cls], probs, corners: Array.from(cor) };   // esquinas normalizadas 0..1 (x, y) ×4
  }

  // lee un cuadro de la cámara (o un lienzo) y corre la red
  const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const inp = new Float32Array(IH * IW * 3);
  // rect (opcional): {x0, y0, x1, y1} en px de la imagen = zona de UNA bolsa (la que se está siguiendo). Así la IA mira
  // solo esa bolsa y no se confunde con otra que aparezca en una esquina. Sin rect: recorte central de la imagen.
  function runOn(src, rect) {
    const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
    if (!sw || !sh) return null;
    const want = IW / IH; let cw = sw, ch = sh, ox, oy;
    if (rect) {
      const mx = (rect.x0 + rect.x1) / 2, my = (rect.y0 + rect.y1) / 2;
      cw = (rect.x1 - rect.x0) * 1.35; ch = (rect.y1 - rect.y0) * 1.35;   // con un margen de pared alrededor
      if (cw / ch > want) ch = cw / want; else cw = ch * want;
      ox = mx - cw / 2; oy = my - ch / 2;
      cx.fillStyle = '#8a9aa6'; cx.fillRect(0, 0, IW, IH);              // lo que quede fuera de la imagen
    } else {
      // recorte central con la proporción con la que se entrenó (3:4 vertical)
      if (sw / sh > want) cw = sh * want; else ch = sw / want;
      ox = (sw - cw) / 2; oy = (sh - ch) / 2;
    }
    cx.drawImage(src, ox, oy, cw, ch, 0, 0, IW, IH);
    const d = cx.getImageData(0, 0, IW, IH).data;
    for (let i = 0, j = 0; i < inp.length; i += 3, j += 4) { inp[i] = d[j]; inp[i + 1] = d[j + 1]; inp[i + 2] = d[j + 2]; }
    const r = run(inp);
    // esquinas en píxeles de la imagen original
    r.px = []; for (let k = 0; k < 4; k++) r.px.push([ox + r.corners[2 * k] * cw, oy + r.corners[2 * k + 1] * ch]);
    return r;
  }
  return { run, runOn, classes: m.classes, inputSize: [IW, IH] };
}
