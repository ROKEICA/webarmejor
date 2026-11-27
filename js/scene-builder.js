/**
 * Pipas Mega RA — construcción de elementos 3D (compartido por la app y el editor).
 * Cada elemento produce un ElementView:
 *   view.group  -> recibe posición/rotación/escala del elemento (el editor mueve este grupo)
 *   view.inner  -> recibe animaciones (giro, flotación, pulso) y el modo "mirar a la cámara"
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MATERIAL_PRESETS, CHARACTER_URL } from './project.js';

// Colores hex interpretados como sRGB (evita colores lavados con outputEncoding sRGB en three r150)
if (THREE.ColorManagement) {
  if ('enabled' in THREE.ColorManagement) THREE.ColorManagement.enabled = true;
  else THREE.ColorManagement.legacyMode = false;
}

const DEG = Math.PI / 180;
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

/* ================================================================ fuentes */
const loadedFonts = new Set();
/**
 * Registra las tipografías del proyecto (TTF, OTF, WOFF, WOFF2). Devuelve la lista de las que fallaron.
 * Se declaran para todos los grosores (1–1000) para que el navegador no "engorde" artificialmente una fuente
 * que solo trae un grosor (el texto se dibuja en negrita 900).
 */
export async function loadFonts(fonts = []) {
  const failed = [];
  await Promise.all(fonts.map(async (f) => {
    if (!f || !f.family || !f.url) return;
    const key = f.family + '|' + f.url;
    if (loadedFonts.has(key)) return;
    try {
      const ff = new FontFace(f.family, `url("${f.url}")`, { weight: '1 1000', style: 'normal', display: 'block' });
      await ff.load();
      document.fonts.add(ff);
      loadedFonts.add(key);
    } catch (e) {
      console.warn('No se pudo cargar la fuente', f.family, e);
      failed.push(f.family);
    }
  }));
  return failed;
}

/* ================================================================ transformaciones */
export function applyTransform(obj, el) {
  const p = el.position || {}, r = el.rotation || {}, s = el.scale || {};
  obj.position.set(p.x || 0, p.y || 0, p.z || 0);
  obj.rotation.set((r.x || 0) * DEG, (r.y || 0) * DEG, (r.z || 0) * DEG);
  obj.scale.set(s.x ?? 1, s.y ?? 1, s.z ?? 1);
}

export function readTransform(obj) {
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r1 = (v) => Math.round(v * 10) / 10;
  return {
    position: { x: r3(obj.position.x), y: r3(obj.position.y), z: r3(obj.position.z) },
    rotation: { x: r1(obj.rotation.x / DEG), y: r1(obj.rotation.y / DEG), z: r1(obj.rotation.z / DEG) },
    scale: { x: r3(obj.scale.x), y: r3(obj.scale.y), z: r3(obj.scale.z) }
  };
}

/* ================================================================ utilidades */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx, text, family, maxW, maxH, weight = '900') {
  let size = Math.floor(maxH);
  while (size > 10) {
    ctx.font = `${weight} ${size}px "${family}", "Arial Black", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  }
  return size;
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = 4;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

function planeMesh(w, h, tex) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.02 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...opts });
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/* ================================================================ TEXTO (degradado, contorno y volumen) */
function drawTextCanvas(t, W, H, fillOverride) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const content = String(t.content || '');
  if (t.background && !fillOverride) {
    ctx.fillStyle = t.background;
    roundRect(ctx, 4, 4, W - 8, H - 8, H * 0.25);
    ctx.fill();
  }
  const pad = H * 0.12;
  fitFont(ctx, content, t.font || 'PipasDisplay', W - pad * 2, H - pad * 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const y = H / 2 + H * 0.03;
  const sw = Math.max(0, t.strokeWidth ?? 8) * (H / 140);
  if (t.stroke && sw > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = sw;
    ctx.strokeStyle = fillOverride || t.stroke;
    ctx.strokeText(content, W / 2, y);
  }
  if (fillOverride) {
    ctx.fillStyle = fillOverride;
  } else if (t.gradient) {
    const a = (t.angle ?? 90) * DEG;
    const dx = Math.cos(a) * W / 2, dy = Math.sin(a) * H / 2;
    const g = ctx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy);
    g.addColorStop(0, t.color || '#ffffff');
    g.addColorStop(1, t.color2 || '#38bdf8');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = t.color || '#ffffff';
  }
  ctx.fillText(content, W / 2, y);
  return c;
}

/**
 * Paredes del texto 3D: "marching squares" sobre la transparencia del texto (umbral 0.5) → segmentos del
 * contorno → un cuadrilátero por segmento desde z=0 hasta z=-depth, sombreado según su orientación.
 */
function extrudeWalls(maskCanvas, w, h, depth, hex) {
  const STEP = 3;                                        // 1 muestra cada 3 px del lienzo (suave y liviano)
  const gw = Math.max(8, Math.round(maskCanvas.width / STEP)), gh = Math.max(4, Math.round(maskCanvas.height / STEP));
  const c = document.createElement('canvas'); c.width = gw + 2; c.height = gh + 2;   // borde de 1 px para cerrar contornos
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
  cx.drawImage(maskCanvas, 1, 1, gw, gh);
  const data = cx.getImageData(0, 0, gw + 2, gh + 2).data;
  const GW = gw + 2, GH = gh + 2;
  const A = (i, j) => data[(j * GW + i) * 4 + 3] / 255;
  const iso = 0.5;
  const pos = [], col = [];
  const base = new THREE.Color(hex);
  const L = new THREE.Vector2(-0.45, 0.89);             // luz de arriba a la izquierda
  const toX = (i) => ((i - 1) / gw - 0.5) * w, toY = (j) => (0.5 - (j - 1) / gh) * h;
  const seg = (x1, y1, x2, y2) => {
    const X1 = toX(x1), Y1 = toY(y1), X2 = toX(x2), Y2 = toY(y2);
    const nx = -(Y2 - Y1), ny = X2 - X1, nl = Math.hypot(nx, ny) || 1;
    const lit = 0.55 + 0.45 * Math.abs((nx * L.x + ny * L.y) / nl);
    const r = base.r * lit, gg = base.g * lit, b = base.b * lit;
    pos.push(X1, Y1, 0, X2, Y2, 0, X2, Y2, -depth, X1, Y1, 0, X2, Y2, -depth, X1, Y1, -depth);
    for (let k = 0; k < 6; k++) col.push(r, gg, b);
  };
  const lerp = (a, b) => (Math.abs(b - a) < 1e-6 ? 0.5 : (iso - a) / (b - a));
  for (let j = 0; j < GH - 1; j++) {
    for (let i = 0; i < GW - 1; i++) {
      const tl = A(i, j), tr = A(i + 1, j), br = A(i + 1, j + 1), bl = A(i, j + 1);
      const idx = (tl >= iso ? 8 : 0) | (tr >= iso ? 4 : 0) | (br >= iso ? 2 : 0) | (bl >= iso ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = [i + lerp(tl, tr), j], R = [i + 1, j + lerp(tr, br)], B = [i + lerp(bl, br), j + 1], Lf = [i, j + lerp(tl, bl)];
      const P = (a, b) => seg(a[0], a[1], b[0], b[1]);
      switch (idx) {
        case 1: case 14: P(Lf, B); break;
        case 2: case 13: P(B, R); break;
        case 3: case 12: P(Lf, R); break;
        case 4: case 11: P(T, R); break;
        case 6: case 9: P(T, B); break;
        case 7: case 8: P(Lf, T); break;
        case 5: P(Lf, T); P(B, R); break;
        case 10: P(T, R); P(Lf, B); break;
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.name = 'text-walls';
  return mesh;
}

function buildText(el) {
  const t = el.text || {};
  const w = Math.max(0.05, t.width || 0.7), h = Math.max(0.02, t.height || 0.14);
  const W = 1024, H = Math.max(64, Math.round(W * h / w));
  const g = new THREE.Group();
  const front = planeMesh(w, h, canvasTexture(drawTextCanvas(t, W, H)));
  front.renderOrder = 2;
  g.add(front);
  const depth = Math.max(0, t.depth || 0);
  if (depth > 0.001) {
    // Volumen SÓLIDO: se toma el contorno exacto de las letras (incluido el contorno/stroke) y se levantan
    // paredes reales hasta la cara trasera. Se ve sólido desde cualquier ángulo y sirve con cualquier fuente.
    const sideHex = shade(t.gradient ? (t.color2 || t.color) : (t.color || '#ffffff'), 0.5);
    const mask = drawTextCanvas(t, W, H, '#ffffff');
    const walls = extrudeWalls(mask, w, h, depth, sideHex);
    if (walls) g.add(walls);
    const backTex = canvasTexture(drawTextCanvas(t, W, H, shade(sideHex, 0.8)));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: backTex, alphaTest: 0.5, side: THREE.DoubleSide }));
    back.position.z = -depth;
    back.rotation.y = Math.PI; back.scale.x = -1; // misma silueta vista desde atrás
    g.add(back);
    front.material.depthWrite = true;
    front.material.alphaTest = 0.5;
    front.material.transparent = false;
    front.position.z = 0.0003;
  }
  return g;
}

/* ================================================================ BOTÓN 3D */
function buildButton(el) {
  const b = el.button || {};
  const w = Math.max(0.1, b.width || 0.6), h = Math.max(0.05, b.height || 0.16);
  const W = 1024, H = Math.round(W * h / w);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const radius = b.shape === 'square' ? H * 0.08 : b.shape === 'rounded' ? H * 0.28 : H / 2;
  ctx.fillStyle = b.color || '#84cc16';
  roundRect(ctx, 6, 6, W - 12, H - 12, radius); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 6;
  roundRect(ctx, 10, 10, W - 20, H - 20, radius); ctx.stroke();
  const label = `${b.icon ? b.icon + ' ' : ''}${b.label || ''}`;
  fitFont(ctx, label, 'PipasDisplay', W - H * 0.8, H * 0.5);
  ctx.fillStyle = b.textColor || '#020617';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, H / 2 + 3);
  const g = new THREE.Group();
  g.add(planeMesh(w, h, canvasTexture(c)));
  const d = Math.max(0, b.depth ?? 0.02);
  if (d > 0) {
    const r = Math.min(h / 2, (radius / H) * h);
    const shape = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }), std(shade(b.color || '#84cc16', 0.55)));
    body.position.z = -d - 0.001;
    g.add(body);
  }
  return g;
}

/* ================================================================ PUNTO */
function buildHotspot(el, view) {
  const hs = el.hotspot || {};
  const size = Math.max(0.02, hs.size || 0.08);
  const color = new THREE.Color(hs.color || '#a5f3fc');
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.35, 24, 16), std(color, { emissive: color, emissiveIntensity: 0.6, roughness: 0.2 }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.55, size * 0.65, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.userData.keepOpacity = true;
  g.add(core, halo, ring);
  view.tickers.push((dt, t) => {
    const k = (t * 0.9) % 1;
    ring.scale.setScalar(1 + k * 1.2);
    ring.material.opacity = 0.8 * (1 - k) * view.opacity;
  });
  return g;
}

/* ================================================================ IMAGEN / GIF */
function isGifUrl(url) {
  return /\.gif(\?|#|$)/i.test(url) || /giphy\.com/i.test(url) || /^data:image\/gif/i.test(url);
}

/**
 * Convierte cualquier enlace de Giphy al archivo .gif directo (los "stickers" de Giphy son los GIF SIN fondo):
 *   giphy.com/gifs/nombre-ID · giphy.com/stickers/nombre-ID · giphy.com/clips/nombre-ID · giphy.com/embed/ID
 *   media*.giphy.com/media/(v1.xxx/)ID/<cualquier archivo>  (giphy.webp, 200.gif, giphy.mp4, ?cid=...)
 *   i.giphy.com/ID.gif|webp · i.giphy.com/media/ID/giphy.webp · gph.is no (se deja igual)
 */
export function normalizeGiphy(url) {
  if (!url || !/giphy\.com/i.test(url)) return url;
  const u = url.trim();
  let m = /giphy\.com\/(?:gifs|stickers|clips)\/(?:[^/?#]*-)?([A-Za-z0-9]+)\/?(?:[?#].*)?$/i.exec(u);
  if (!m) m = /giphy\.com\/embed\/([A-Za-z0-9]+)/i.exec(u);
  if (!m) m = /giphy\.com\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)\/[^/?#]+/i.exec(u);
  if (!m) m = /i\.giphy\.com\/([A-Za-z0-9]+)\.(?:gif|webp|mp4)/i.exec(u);
  return m ? `https://media.giphy.com/media/${m[1]}/giphy.gif` : u;
}

/** Quita el fondo de color sólido (el de las esquinas del primer cuadro) de todos los cuadros. */
function keyOutBackground(frames, W, H, tol) {
  const d0 = frames[0].data.data;
  const corners = [0, W - 1, (H - 1) * W, H * W - 1].map(i => i * 4).filter(i => d0[i + 3] > 0);
  if (!corners.length) return; // ya es transparente
  const key = [0, 1, 2].map(k => corners.reduce((a, i) => a + d0[i + k], 0) / corners.length);
  const t2 = tol * tol;
  for (const f of frames) {
    const d = f.data.data;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist <= t2) d[i + 3] = 0;
      else if (dist <= t2 * 2.2) d[i + 3] = Math.min(d[i + 3], Math.round(255 * (Math.sqrt(dist) - tol) / (tol * 0.48)));
    }
  }
}

const gifCache = new Map();
function decodeGif(url) {
  if (gifCache.has(url)) return gifCache.get(url);
  const p = (async () => {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!window.GifReader) throw new Error('omggif no cargado');
    const reader = new window.GifReader(bytes);
    const W = reader.width, H = reader.height;
    const frames = [];
    const buf = new Uint8ClampedArray(W * H * 4);
    let prev = null;
    for (let i = 0; i < reader.numFrames(); i++) {
      const info = reader.frameInfo(i);
      if (info.disposal === 3) prev = buf.slice();
      reader.decodeAndBlitFrameRGBA(i, buf);
      frames.push({ data: new ImageData(buf.slice(), W, H), delay: Math.max(20, (info.delay || 10) * 10) });
      if (info.disposal === 2) {
        for (let y = info.y; y < info.y + info.height; y++) buf.fill(0, (y * W + info.x) * 4, (y * W + info.x + info.width) * 4);
      } else if (info.disposal === 3 && prev) buf.set(prev);
    }
    return { W, H, frames };
  })();
  gifCache.set(url, p);
  p.catch(() => gifCache.delete(url));
  return p;
}

function buildImage(el, view) {
  const url = normalizeGiphy((el.image && el.image.url) || '');
  const width = Math.max(0.02, (el.image && el.image.width) || 0.5);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.02, opacity: 0 });
  mat.userData.loaded = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.scale.set(width, width, 1);
  const setAspect = (aspect) => mesh.scale.set(width, width / (aspect || 1), 1);
  const shown = () => { mat.userData.loaded = true; mat.userData.baseOpacity = 1; mat.opacity = view.opacity; mat.needsUpdate = true; };
  if (!url) return mesh;

  const loadStatic = () => textureLoader.load(url, (tex) => {
    tex.encoding = THREE.sRGBEncoding;
    if (removeBg) {
      try {
        const im = tex.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const cx = c.getContext('2d'); cx.drawImage(im, 0, 0);
        const fr = [{ data: cx.getImageData(0, 0, c.width, c.height) }];
        keyOutBackground(fr, c.width, c.height, tol); cx.putImageData(fr[0].data, 0, 0);
        tex = canvasTexture(c);
      } catch (e) { /* imagen sin permiso CORS: se deja igual */ }
    }
    mat.map = tex; shown();
    setAspect(tex.image.width / tex.image.height);
  }, undefined, () => console.warn('No se pudo cargar la imagen', url));

  const removeBg = !!(el.image && el.image.removeBg);
  const tol = Math.max(5, Math.min(160, (el.image && el.image.bgTolerance) || 40));

  if (isGifUrl(url)) {
    decodeGif(url).then(({ W, H, frames: src }) => {
      let frames = src;
      if (removeBg) { // copia para no alterar la caché compartida
        frames = src.map(f => ({ delay: f.delay, data: new ImageData(new Uint8ClampedArray(f.data.data), W, H) }));
        keyOutBackground(frames, W, H, tol);
      }
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      const tex = canvasTexture(c);
      let idx = 0, acc = 0;
      ctx.putImageData(frames[0].data, 0, 0);
      tex.needsUpdate = true;
      mat.map = tex; shown();
      setAspect(W / H);
      view.gif = { frames: frames.length, restart: () => { idx = 0; acc = 0; ctx.putImageData(frames[0].data, 0, 0); tex.needsUpdate = true; } };
      if (frames.length > 1) {
        view.tickers.push((dt) => {
          if (view.paused) return;
          acc += dt * 1000 * Math.max(0.1, (el.image && el.image.speed) || 1);
          let changed = false;
          while (acc >= frames[idx].delay) { acc -= frames[idx].delay; idx = (idx + 1) % frames.length; changed = true; }
          if (changed) { ctx.putImageData(frames[idx].data, 0, 0); tex.needsUpdate = true; }
        });
      }
    }).catch((e) => { console.warn('GIF no animado, se usa imagen fija:', url, e.message); loadStatic(); });
  } else {
    loadStatic();
  }
  return mesh;
}

/* ================================================================ MODELOS INCLUIDOS */
function labelTexture(text, bg, fg, w = 1024, h = 400) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; roundRect(ctx, 0, 0, w, h, h * 0.22); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 14; roundRect(ctx, 16, 16, w - 32, h - 32, h * 0.18); ctx.stroke();
  fitFont(ctx, text, 'PipasDisplay', w * 0.86, h * 0.62);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + 6);
  return canvasTexture(c);
}

function builtinModel(kind, color, opts = {}) {
  const g = new THREE.Group();
  const main = (m) => { m.userData.main = true; return m; };
  switch (kind) {
    case 'chili': {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.08, 0.2, 0.02),
        new THREE.Vector3(0.06, -0.08, 0.03), new THREE.Vector3(-0.06, -0.3, 0.02), new THREE.Vector3(-0.2, -0.42, 0)
      ]);
      const mat = std(color || '#dc2626', { roughness: 0.25 });
      const body = main(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.1, 20, false), mat));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 12), mat); tip.position.copy(curve.getPoint(1)); tip.scale.set(1, 0.6, 1);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 12), mat); cap.position.copy(curve.getPoint(0));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.16, 12), std('#15803d'));
      stem.position.set(0, 0.52, 0); stem.rotation.z = 0.3;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.08, 6), std('#16a34a'));
      leaf.position.set(0, 0.46, 0); leaf.rotation.x = Math.PI;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 16), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.75 }));
      flame.position.set(-0.24, -0.55, 0); flame.rotation.z = Math.PI * 0.85;
      g.add(body, tip, cap, stem, leaf, flame);
      break;
    }
    case 'passion': {
      const shell = main(new THREE.Mesh(new THREE.SphereGeometry(0.45, 40, 28), std(color || '#6b21a8', { roughness: 0.6 })));
      shell.scale.set(1, 1.08, 1);
      const pulp = new THREE.Mesh(new THREE.CircleGeometry(0.36, 40), std('#facc15', { roughness: 0.3, emissive: '#a16207', emissiveIntensity: 0.25 }));
      pulp.position.z = 0.33;
      for (let i = 0; i < 14; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), std('#1c1917'));
        const a = i * 2.4, r = 0.08 + (i % 4) * 0.06;
        s.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.35);
        g.add(s);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.14, 10), std('#4d7c0f'));
      stem.position.y = 0.52;
      g.add(shell, pulp, stem);
      break;
    }
    case 'seed':
    case 'golden_seed': {
      const gold = kind === 'golden_seed';
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = gold ? '#b45309' : '#111827'; ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = gold ? '#fde68a' : '#e5e7eb';
      for (let i = 0; i < 8; i++) ctx.fillRect(i * 32 + 12, 0, 7, 64);
      const seed = main(new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 24),
        std(color || '#ffffff', { map: canvasTexture(c), roughness: gold ? 0.2 : 0.35, metalness: gold ? 0.85 : 0.05 })));
      seed.scale.set(0.42, 1, 0.25);
      g.add(seed);
      break;
    }
    case 'hola': {
      const side = std(shade(color || '#facc15', 0.6));
      const front = new THREE.MeshStandardMaterial({ map: labelTexture(opts.text || '¡HOLA!', color || '#facc15', opts.textColor || '#020617'), roughness: 0.4 });
      const sign = main(new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.06), [side, side, side, side, front, side]));
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 12), std('#78716c'));
      post.position.set(0, -0.37, -0.02);
      g.add(sign, post);
      break;
    }
    case 'trophy': {
      const gold = std(color || '#f5b301', { roughness: 0.22, metalness: 0.95 });
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.06 + 0.28 * Math.sin(t * Math.PI * 0.55), 0.1 + t * 0.45)); }
      const cup = main(new THREE.Mesh(new THREE.LatheGeometry(pts, 40), gold));
      gold.side = THREE.DoubleSide;
      const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 10, 30, Math.PI), gold); h1.position.set(0.33, 0.42, 0); h1.rotation.z = -Math.PI / 2;
      const h2 = h1.clone(); h2.position.x = -0.33; h2.rotation.z = Math.PI / 2;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.2, 16), gold);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.3), std('#1f2937', { roughness: 0.5 })); base.position.y = -0.14;
      g.add(cup, h1, h2, stem, base);
      break;
    }
    case 'gem': {
      const c = color || '#22d3ee';
      const gem = main(new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), std(c, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.25, flatShading: true })));
      gem.scale.set(0.8, 1, 0.8);
      g.add(gem);
      break;
    }
    case 'crown': {
      const gold = std(color || '#f5b301', { roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide });
      g.add(main(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 40, 1, true), gold)));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 12), gold);
        spike.position.set(Math.cos(a) * 0.4, 0.23, Math.sin(a) * 0.4);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), std(i % 2 ? '#ef4444' : '#22c55e', { roughness: 0.1 }));
        jewel.position.set(Math.cos(a) * 0.43, 0, Math.sin(a) * 0.43);
        g.add(spike, jewel);
      }
      break;
    }
    case 'rocket': {
      const body = main(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.6, 32), std(color || '#e5e7eb', { roughness: 0.3, metalness: 0.4 })));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 32), std('#ef4444')); nose.position.y = 0.45;
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), std('#38bdf8', { emissive: '#0ea5e9', emissiveIntensity: 0.4 })); win.position.set(0, 0.1, 0.161);
      g.add(body, nose, win);
      for (let i = 0; i < 3; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.16), std('#ef4444'));
        const a = (i / 3) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.19, -0.25, Math.sin(a) * 0.19); fin.rotation.y = -a;
        g.add(fin);
      }
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 16), new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.8 }));
      flame.position.y = -0.46; flame.rotation.x = Math.PI;
      g.add(flame);
      break;
    }
    case 'bullseye': {
      [color || '#ef4444', '#ffffff', color || '#ef4444', '#ffffff', color || '#ef4444'].forEach((c, i) => {
        const r = 0.5 - i * 0.1;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04 + i * 0.006, 48), std(c));
        m.rotation.x = Math.PI / 2;
        if (i === 0) main(m);
        g.add(m);
      });
      break;
    }
    case 'frame': {
      const wood = std(color || '#a16207', { roughness: 0.6 });
      const fw = 1, fh = 0.75, t = 0.08;
      [[0, fh / 2 - t / 2, fw, t], [0, -fh / 2 + t / 2, fw, t], [fw / 2 - t / 2, 0, t, fh], [-fw / 2 + t / 2, 0, t, fh]].forEach(([x, y, w, h]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), wood); m.position.set(x, y, 0);
        g.add(m);
      });
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(fw - t * 2, fh - t * 2), std('#f1f5f9', { roughness: 0.8 }));
      pic.userData.picture = true;
      g.add(pic);
      break;
    }
    case 'box': g.add(main(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(color || '#84cc16')))); break;
    case 'sphere': g.add(main(new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 28), std(color || '#84cc16')))); break;
    case 'cylinder': g.add(main(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 40), std(color || '#84cc16')))); break;
    case 'cone': g.add(main(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 40), std(color || '#84cc16')))); break;
    case 'torus': g.add(main(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.14, 24, 60), std(color || '#84cc16')))); break;
    case 'plane': g.add(main(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), std(color || '#84cc16', { side: THREE.DoubleSide })))); break;
    case 'lime':
    default: {
      const mat = std(color || '#65a30d', { roughness: 0.35 });
      const body = main(new THREE.Mesh(new THREE.SphereGeometry(0.45, 40, 28), mat));
      body.scale.set(1, 0.92, 0.92);
      const nubGeo = new THREE.SphereGeometry(0.07, 16, 10);
      const n1 = new THREE.Mesh(nubGeo, mat); n1.position.set(0.44, 0, 0); n1.scale.set(1, 0.7, 0.7);
      const n2 = new THREE.Mesh(nubGeo, mat); n2.position.set(-0.44, 0, 0); n2.scale.set(1, 0.7, 0.7);
      const slice = new THREE.Mesh(new THREE.CircleGeometry(0.3, 40), std('#d9f99d', { emissive: '#4d7c0f', emissiveIntensity: 0.15 }));
      slice.position.set(0, 0, 0.42);
      g.add(body, n1, n2, slice);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.27), new THREE.MeshBasicMaterial({ color: '#f7fee7' }));
        sp.position.set(0, 0, 0.421); sp.rotation.z = i * Math.PI / 8;
        g.add(sp);
      }
      break;
    }
  }
  return g;
}

function normalizeToUnit(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  const center = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group();
  obj.position.sub(center);
  wrap.add(obj);
  wrap.scale.setScalar(1 / max);
  return wrap;
}

/** Aplica preset/rugosidad/metal/emisión y textura a las mallas del modelo. */
function applyMaterial(root, el) {
  const m = el.material || {};
  const preset = MATERIAL_PRESETS[m.preset] || null;
  const rough = m.roughness ?? preset?.roughness ?? null;
  const metal = m.metalness ?? preset?.metalness ?? null;
  const emissive = m.emissive || preset?.emissive || 0;
  const presetOpacity = preset?.opacity ?? 1;
  const texUrl = el.model && el.model.texture;
  const tex = texUrl ? textureLoader.load(texUrl, (t) => { t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; }) : null;
  if (tex) tex.encoding = THREE.sRGBEncoding;
  const seen = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(mt => {
      if (!mt.isMeshStandardMaterial) return;
      if (!seen.has(mt)) {
        seen.add(mt);
        if (rough !== null) mt.roughness = rough;
        if (metal !== null) mt.metalness = metal;
        if (emissive > 0) { mt.emissive = mt.color.clone(); mt.emissiveIntensity = emissive; }
        if (presetOpacity < 1) { mt.transparent = true; mt.opacity = presetOpacity; mt.userData.baseOpacity = presetOpacity; }
      }
      if (tex && (o.userData.main || o.userData.picture)) { mt.map = tex; mt.color.set('#ffffff'); }
      mt.needsUpdate = true;
    });
  });
}

function buildModel(el, view, ctx) {
  const m = el.model || {};
  const holder = new THREE.Group();
  const url = m.url || (m.kind === 'character' ? CHARACTER_URL : '');
  if (url) {
    const ph = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), new THREE.MeshBasicMaterial({ color: '#94a3b8', wireframe: true }));
    holder.add(ph);
    gltfLoader.load(url, (gltf) => {
      holder.remove(ph);
      const root = normalizeToUnit(gltf.scene);
      if (m.color) root.traverse(o => { if (o.isMesh && o.material && o.material.color) { o.material = o.material.clone(); o.material.color.set(m.color); } });
      applyMaterial(root, el);
      holder.add(root);
      if (gltf.animations && gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach(clip => mixer.clipAction(clip).play());
        view.tickers.push((dt) => { if (!view.paused) mixer.update(dt); });
      }
      view.applyOpacity();
      view.onLoaded && view.onLoaded();
    }, undefined, (err) => {
      console.warn('No se pudo cargar el modelo', url, err);
      ph.material.color.set('#ef4444');
    });
  } else {
    const model = normalizeToUnit(builtinModel(m.kind || 'lime', m.color || '', (ctx && ctx.hola) || {}));
    applyMaterial(model, el);
    holder.add(model);
  }
  return holder;
}

/* ================================================================ API */
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

export class ElementView {
  /**
   * @param el   elemento del proyecto
   * @param ctx  { hola: ui.hola } (opcional)
   */
  constructor(el, ctx = {}) {
    this.el = el;
    this.tickers = [];
    this.opacity = el.opacity ?? 1;
    this.paused = false;
    this.group = new THREE.Group();
    this.group.name = el.name || el.id;
    this.group.userData.elementId = el.id;
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    applyTransform(this.group, el);
    this.group.visible = el.visible !== false;
    this.phase = Math.random() * Math.PI * 2;

    let content;
    switch (el.type) {
      case 'text': content = buildText(el); break;
      case 'button': content = buildButton(el); break;
      case 'hotspot': content = buildHotspot(el, this); break;
      case 'image': content = buildImage(el, this); break;
      case 'model': content = buildModel(el, this, ctx); break;
      default: content = new THREE.Group();
    }
    this.content = content;
    this.inner.add(content);
    this.applyOpacity();
  }

  applyOpacity() {
    const op = Math.max(0, Math.min(1, this.opacity));
    this.group.traverse(o => {
      o.userData.elementId = this.el.id;
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(mt => {
        if (o.userData.keepOpacity || mt.userData.loaded === false) return;
        if (mt.userData.baseOpacity === undefined) mt.userData.baseOpacity = mt.opacity;
        mt.opacity = mt.userData.baseOpacity * op;
        if (op < 1) mt.transparent = true;
      });
    });
  }

  update(dt, t, camera) {
    const a = this.el.anim || {};
    if (this.el.billboard && camera) {
      // Mirar a la cámara: compensa la rotación de los padres
      this.group.updateWorldMatrix(true, false);
      this.group.getWorldQuaternion(_q).invert();
      camera.getWorldQuaternion(_q2);
      this.inner.quaternion.copy(_q.multiply(_q2));
    } else if (a.spin) {
      this.inner.rotation.y += (a.spin * DEG) * dt;
    }
    this.inner.position.y = a.float ? Math.sin(t * 2 + this.phase) * a.float : 0;
    if (a.pulse) this.inner.scale.setScalar(1 + Math.sin(t * 4 + this.phase) * 0.08);
    for (const fn of this.tickers) fn(dt, t);
  }

  resetAnimation() {
    this.inner.rotation.set(0, 0, 0);
    this.inner.position.set(0, 0, 0);
    this.inner.scale.setScalar(1);
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); });
      }
    });
    this.tickers = [];
  }
}

export function buildFlavorContent(flavor, ctx = {}) {
  const root = new THREE.Group();
  root.name = 'flavor-' + flavor.id;
  const views = [];
  for (const el of flavor.elements || []) {
    const v = new ElementView(el, ctx);
    root.add(v.group);
    views.push(v);
  }
  return { root, views };
}

/** Letrero ¡HOLA! (oculto por defecto) que aparece sobre el empaque. */
export function buildHolaSign(hola = {}, aspect = 0.65) {
  const el = {
    id: '__hola__', type: 'model', name: 'HOLA', visible: false,
    position: { x: 0, y: 0.5 / aspect + 0.25, z: 0.12 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 0.6, y: 0.6, z: 0.6 },
    opacity: 1, anim: { spin: 0, float: 0.03, pulse: false }, model: { kind: 'hola', url: '', color: hola.color || '#facc15' }, material: {},
    action: { type: 'toggle_hola' }
  };
  return new ElementView(el, { hola });
}

/** Busca el elemento tocado subiendo por los padres del objeto intersectado. */
export function elementIdFromHit(obj) {
  while (obj) {
    if (obj.userData && obj.userData.elementId) return obj.userData.elementId;
    obj = obj.parent;
  }
  return null;
}

/* ================================================================ luces */
export function addDefaultLights(scene) {
  const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 0.75);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(0.5, 1, 2);
  scene.add(hemi, dir);
  return { hemi, dir };
}

export function applyFlavorLights(lights, cfg = {}) {
  if (!lights) return;
  lights.hemi.color.set(cfg.ambientColor || '#ffffff');
  lights.hemi.intensity = cfg.ambient ?? 0.75;
  lights.dir.intensity = cfg.directional ?? 0.9;
}

/* ================================================================ partículas */
function spriteTexture(type) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.translate(32, 32);
  if (type === 'leaves') {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 26, 0.6, 0, Math.PI * 2); ctx.fill();
  } else if (type === 'confetti') {
    ctx.fillStyle = '#fff'; ctx.fillRect(-10, -18, 20, 36);
  } else if (type === 'stars') {
    ctx.fillStyle = '#fff'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 28, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
  } else if (type === 'bubbles') {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-8, -8, 6, 0, Math.PI * 2); ctx.fill();
  } else {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-32, -32, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/** Sistema de partículas alrededor del empaque. Devuelve { object, update, dispose } o null. */
export function buildParticles(cfg = {}, aspect = 0.65) {
  if (!cfg || !cfg.enabled) return null;
  const type = cfg.type || 'sparkles';
  const N = type === 'confetti' ? 90 : 70;
  const halfH = 0.5 / aspect;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), base = new Float32Array(N * 3), seed = new Float32Array(N);
  const c1 = new THREE.Color(cfg.color || '#ffffff'), c2 = new THREE.Color(cfg.color2 || cfg.color || '#ffffff');
  const tmp = new THREE.Color();
  const reset = (i, initial) => {
    const ix = i * 3;
    pos[ix] = (Math.random() - 0.5) * 1.3;
    pos[ix + 2] = 0.02 + Math.random() * 0.35;
    if (type === 'fire' || type === 'bubbles') pos[ix + 1] = initial ? (Math.random() * 2 - 1) * halfH : -halfH - 0.05;
    else if (type === 'leaves' || type === 'confetti') pos[ix + 1] = initial ? (Math.random() * 2 - 1) * halfH : halfH + 0.1;
    else pos[ix + 1] = (Math.random() * 2 - 1) * (halfH + 0.15);
    seed[i] = Math.random();
    if (type === 'confetti') tmp.setHSL(Math.random(), 0.85, 0.6);
    else tmp.copy(c1).lerp(c2, Math.random());
    base[ix] = tmp.r; base[ix + 1] = tmp.g; base[ix + 2] = tmp.b;
  };
  for (let i = 0; i < N; i++) reset(i, true);
  col.set(base);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const additive = type === 'sparkles' || type === 'fire' || type === 'stars';
  const mat = new THREE.PointsMaterial({
    size: type === 'bubbles' ? 0.07 : type === 'confetti' ? 0.045 : 0.05, map: spriteTexture(type), vertexColors: true,
    transparent: true, depthWrite: false, opacity: 0.9, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'particles';
  points.raycast = () => {}; // no interfiere con los toques
  const update = (dt, t) => {
    for (let i = 0; i < N; i++) {
      const s = seed[i], ix = i * 3;
      if (type === 'fire') { pos[ix + 1] += dt * (0.25 + s * 0.3); pos[ix] += Math.sin(t * 3 + s * 9) * dt * 0.05; if (pos[ix + 1] > -halfH * 0.2 + s * 0.6) reset(i); }
      else if (type === 'bubbles') { pos[ix + 1] += dt * (0.1 + s * 0.12); pos[ix] += Math.sin(t * 1.5 + s * 9) * dt * 0.04; if (pos[ix + 1] > halfH + 0.15) reset(i); }
      else if (type === 'leaves' || type === 'confetti') { pos[ix + 1] -= dt * (0.08 + s * 0.12); pos[ix] += Math.sin(t * 1.2 + s * 9) * dt * 0.08; if (pos[ix + 1] < -halfH - 0.1) reset(i); }
      else { pos[ix + 1] += dt * 0.02 * (s - 0.3); }
      const tw = (type === 'sparkles' || type === 'stars') ? 0.35 + 0.65 * Math.abs(Math.sin(t * (1.5 + s * 3) + s * 20)) : 1;
      col[ix] = base[ix] * tw; col[ix + 1] = base[ix + 1] * tw; col[ix + 2] = base[ix + 2] * tw;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return { object: points, update, dispose: () => { geo.dispose(); mat.map.dispose(); mat.dispose(); } };
}
