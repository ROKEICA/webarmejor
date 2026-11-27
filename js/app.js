/**
 * Pipas Mega RA — app de realidad aumentada.
 *  - Reconoce los 4 empaques (MindAR + verificación de color) y muestra el contenido del editor.
 *  - Medallas 4/4 y premio final.
 *  - Modo 3D (simulador sin cámara), Audit & Fix, consejos de cámara, sonido, ayuda,
 *    letrero ¡HOLA!, botones de pantalla, partículas y luces por sabor.
 * Parámetros de URL: ?modo=3d (abre el simulador sin pedir cámara), &sabor=<id>
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadPublishedProject, stabilityParams, STABILITY_PRESETS, HUD_POSITIONS, resolveTargetsLayout } from './project.js';
import {
  buildFlavorContent, buildHolaSign, buildParticles, loadFonts, elementIdFromHit,
  addDefaultLights, applyFlavorLights
} from './scene-builder.js';
import { installColorVerification } from './recognition.js';
import { startGyro, cameraDelta, gyroState } from './gyro.js';
import { createFlow } from './flow.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const state = {
  project: null,
  mindar: null,
  arLights: null,
  flavors: [],          // entradas de RA: { flavor, anchor, root, views, hola, particles, visibleSince }
  medals: new Set(),
  seen: new Set(),      // sabores detectados al menos una vez (botones "siempre")
  finaleShown: false,
  current: null,
  arStarted: false,
  sound: true,
  sim: null,
  stab: null,
  audit: { fps: 0, lat: 0, luma: 0, glare: 0, sharp: 0, frames: 0, lastT: performance.now(), lastProc: 0, lats: [] },
  adviceDismissed: 0
};
window.__pipas = state; // pruebas y depuración

/* ================================================================ utilidades de interfaz */
function progress(pct, text) {
  $('loader-bar').style.width = pct + '%';
  if (text) $('loader-status').textContent = text;
}

function applyUi(project) {
  const L = project.ui.loading;
  const root = document.documentElement.style;
  root.setProperty('--accent', L.accent || '#84cc16');
  root.setProperty('--accent2', L.accent2 || L.accent || '#22d3ee');
  root.setProperty('--bg', L.bgColor || '#090d16');
  root.setProperty('--cardbg', L.cardColor || '#121a2d');
  root.setProperty('--title', L.titleColor || L.accent || '#84cc16');
  $('loader-title').textContent = L.title || 'PIPAS MEGA';
  $('loader-subtitle').textContent = L.subtitle || '';
  $('loader-status').textContent = L.statusText || 'Cargando…';
  $('brand-title').textContent = L.title || 'PIPAS MEGA';
  document.title = (L.title || 'Pipas Mega') + ' · RA';
  if (L.logoUrl) { $('loader-logo').src = L.logoUrl; $('loader-logo').classList.remove('hidden'); }
  $('help-text').textContent = project.ui.help || '';
  $('btn-hola').textContent = `👋 ${project.ui.hola.text || '¡HOLA!'}`;
  $('btn-audit').classList.toggle('hidden', !project.settings.auditPanel);
  $('btn-sim').classList.toggle('hidden', !project.settings.simulator);

  const medals = $('medals');
  medals.innerHTML = '';
  project.flavors.forEach(f => {
    const d = document.createElement('div');
    d.className = 'medal';
    d.id = 'medal-' + f.id;
    d.title = f.short || f.name;
    d.textContent = f.emoji || '●';
    d.style.setProperty('--c', f.color);
    medals.appendChild(d);
  });
}

function showToast(text, color) {
  const t = $('toast');
  t.textContent = text;
  t.style.setProperty('--flavor', color);
  t.classList.remove('hidden');
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), 2600);
}

function openPopup(title, text, color) {
  document.documentElement.style.setProperty('--flavor', color || 'var(--accent)');
  $('popup-title').textContent = title || '';
  $('popup-text').textContent = text || '';
  $('popup').classList.remove('hidden');
}

function showError(message) {
  $('loader').classList.add('hidden');
  $('error-text').textContent = message;
  $('error-sim').classList.toggle('hidden', !state.project?.settings.simulator);
  $('error').classList.remove('hidden');
}

/* ================================================================ sonido */
let audioCtx = null;
function tone(freqs, gap = 0.09, dur = 0.25, vol = 0.18) {
  if (!state.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, now + i * gap);
      g.gain.exponentialRampToValueAtTime(vol, now + i * gap + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * gap + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + i * gap); o.stop(now + i * gap + dur + 0.05);
    });
  } catch (e) { /* sin audio */ }
}
const chime = () => tone([660, 990]);
const click = () => tone([880], 0, 0.08, 0.08);
const fanfare = () => tone([523, 659, 784, 1046], 0.12, 0.35);

function setSound(on) {
  state.sound = on;
  $('btn-sound').textContent = on ? '🔊' : '🔇';
  $('btn-sound').classList.toggle('off', !on);
  try { localStorage.setItem('pipas_sound', on ? '1' : '0'); } catch (e) {}
}

/* ================================================================ medallas */
function unlockMedal(entry) {
  const f = entry.flavor;
  if (state.medals.has(f.id)) return;
  state.medals.add(f.id);
  $('medal-' + f.id)?.classList.add('on');
  $('medal-counter').textContent = `${state.medals.size}/${state.project.flavors.length}`;
  showToast(`🏅 ¡Medalla ${f.short || f.name}! (${state.medals.size}/${state.project.flavors.length})`, f.color);
  chime();
  // el navegador bloquea (y marca error en consola) la vibración si la persona aún no ha tocado la pantalla
  const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  if (navigator.vibrate && touched) { try { navigator.vibrate(60); } catch (e) {} }
  if (state.medals.size === state.project.flavors.length && !state.finaleShown) {
    state.finaleShown = true;
    setTimeout(showFinale, 1400);
  }
}

function showFinale() {
  const F = state.project.ui.finale;
  if (!F.enabled) return;
  $('finale-img').src = F.imageUrl || '';
  $('finale-img').classList.toggle('hidden', !F.imageUrl);
  $('finale-title').textContent = F.title || '';
  $('finale-subtitle').textContent = F.subtitle || '';
  $('finale-btn').textContent = F.buttonText || 'Continuar';
  $('finale').classList.remove('hidden');
  fanfare();
}

/* ================================================================ acciones */
function doAction(action, entry) {
  if (!action || action.type === 'none') return false;
  const color = entry?.flavor.color;
  switch (action.type) {
    case 'popup': click(); openPopup(action.title, action.text, color); return true;
    case 'url':
      if (/^https?:\/\//i.test(action.url || '')) { click(); window.open(action.url, '_blank', 'noopener'); return true; }
      return false;
    case 'toggle_element': {
      const v = entry?.views.find(x => x.el.id === action.target);
      if (v) { click(); v.group.visible = !v.group.visible; return true; }
      return false;
    }
    case 'toggle_hola': toggleHola(entry); return true;
    case 'sound': chime(); return true;
    default: return false;
  }
}

function toggleHola(entry) {
  entry = entry || activeEntry();
  if (!entry || !entry.hola) return;
  entry.hola.group.visible = !entry.hola.group.visible;
  $('btn-hola').classList.toggle('on', entry.hola.group.visible);
  if (entry.hola.group.visible) tone([523, 784]);
}

function activeEntry() {
  if (state.sim && state.sim.active) return state.sim.entry;
  return state.flavors.find(e => e.anchor.group.visible) || null;
}

/** Raycast de un toque sobre el contenido del sabor y ejecución de su acción. */
function handleTap(entry, camera, ndc) {
  if (!entry) return;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const targets = [entry.root];
  if (entry.hola && entry.hola.group.visible) targets.push(entry.hola.group);
  const hits = ray.intersectObjects(targets, true).filter(h => h.object.visible);
  for (const h of hits) {
    const id = elementIdFromHit(h.object);
    if (id === '__hola__') { toggleHola(entry); return; }
    const el = id && entry.flavor.elements.find(x => x.id === id);
    if (!el) continue;
    const view = entry.views.find(v => v.el.id === id);
    if (doAction(el.action, entry)) {
      if (view) { view.content.scale.setScalar(0.9); setTimeout(() => view.content.scale.setScalar(1), 140); }
      return;
    }
  }
}

/* ================================================================ botones de pantalla (HUD) */
function renderHud() {
  const hud = $('hud');
  hud.innerHTML = '';
  const slots = {};
  const entry = activeEntry();
  const showFlavors = state.project.flavors.filter(f => {
    if (state.sim && state.sim.active) return f.id === state.sim.flavorId;
    return (entry && entry.flavor.id === f.id) || state.seen.has(f.id);
  });
  for (const f of showFlavors) {
    for (const b of f.hudButtons || []) {
      const visibleNow = (state.sim && state.sim.active) || b.show === 'always' || (entry && entry.flavor.id === f.id);
      if (!visibleNow) continue;
      const pos = HUD_POSITIONS[b.position] ? b.position : 'bottom-center';
      if (!slots[pos]) { slots[pos] = document.createElement('div'); slots[pos].className = 'hud-slot ' + pos; hud.appendChild(slots[pos]); }
      const btn = document.createElement('button');
      btn.className = `hud-btn ${b.shape || 'pill'} ${b.size || 'md'}`;
      btn.style.setProperty('--bc', b.color || f.color);
      btn.style.setProperty('--tc', b.textColor || '#020617');
      btn.textContent = b.shape === 'circle' ? (b.icon || '•') : `${b.icon ? b.icon + ' ' : ''}${b.label || ''}`;
      btn.title = b.label || '';
      btn.addEventListener('click', () => {
        const e = (state.sim && state.sim.active) ? state.sim.entry : (state.flavors.find(x => x.flavor.id === f.id) || entry);
        doAction(b.action, e);
      });
      slots[pos].appendChild(btn);
    }
  }
  const holaOn = state.project.ui.hola.showButton && !!entry;
  $('btn-hola').classList.toggle('hidden', !holaOn);
  $('btn-hola').classList.toggle('on', !!(entry && entry.hola && entry.hola.group.visible));
}

/* ================================================================ contenido por sabor */
function buildEntryContent(flavor, parent) {
  const ctx = { hola: state.project.ui.hola };
  const { root, views } = buildFlavorContent(flavor, ctx);
  parent.add(root);
  const hola = buildHolaSign(state.project.ui.hola, flavor.aspect || 0.65);
  parent.add(hola.group);
  const particles = buildParticles(flavor.particles, flavor.aspect || 0.65);
  if (particles) parent.add(particles.object);
  return { flavor, root, views, hola, particles };
}

function updateEntry(e, dt, t, camera) {
  for (const v of e.views) v.update(dt, t, camera);
  if (e.hola.group.visible) e.hola.update(dt, t, camera);
  if (e.particles) e.particles.update(dt, t);
}

/* ================================================================ RA */
/* ---------------------------------------------------------------- marcadores de logo */
/**
 * Marcadores extra en targets.mind (grupos de NF, ver resolveTargetsLayout):
 *  - 'palabras': recuadro "MEGA + sabor" (logoZone = x0..x1 del ancho, y0..y1 del alto). MindAR mide cada marcador
 *    con ancho = 1, así que el contenido se escala y se desplaza al centro de la bolsa.
 *  - 'foto': foto real de la bolsa alineada a la carátula → mismo sistema de coordenadas (sin desplazamiento).
 */
function addExtraAnchors(mindar, NF) {
  const dims = mindar.controller.markerDimensions || [];
  const layout = resolveTargetsLayout(state.project, dims.length);
  mindar.controller.pipasLayout = layout;
  // zona "MEGA + sabor" de cada sabor (para que la IA pueda ver la bolsa ENTERA aunque se esté siguiendo solo esa zona)
  mindar.controller.pipasZones = []; for (const e of state.flavors) mindar.controller.pipasZones[e.flavor.targetIndex] = e.flavor.logoZone || null;
  // Sabores cuya bolsa REAL ya no se parece a la carátula de diseño (p. ej. Mega Verde): sus marcadores de diseño
  // (carátula y palabras) dan poses falsas (contenido girado/corrido) → no se usan; se reconoce con la foto real.
  mindar.controller.pipasSkipIdx = new Set();
  layout.forEach((kind, g) => { if (kind === 'bolsa' || kind === 'palabras') for (const e of state.flavors) if (e.flavor.realOnly) mindar.controller.pipasSkipIdx.add(g * NF + e.flavor.targetIndex); });
  state.targetsLayout = layout;
  layout.forEach((kind, g) => {
    if (g === 0 || kind === 'borroso' || String(kind).startsWith('lado')) return;   // los borrosos solo reconocen: se rastrea con el marcador normal
    for (const entry of state.flavors) {
      const f = entry.flavor, idx = g * NF + f.targetIndex;
      const full = dims[f.targetIndex];
      if (!dims[idx] || !full) continue;
      let offset = new THREE.Matrix4();
      if (kind === 'palabras') {
        const z = f.logoZone;
        if (!z) continue;
        const H = full[1] / full[0];
        const x0 = z.x0 ?? 0, x1 = z.x1 ?? 1;
        const cw = Math.max(0.05, x1 - x0);
        const cx = (x0 + x1) / 2 - 0.5, cy = (0.5 - (z.y0 + z.y1) / 2) * H;
        offset = new THREE.Matrix4().makeScale(1 / cw, 1 / cw, 1 / cw).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, 0));
      }
      const anchor = mindar.addAnchor(idx);
      entry.anchor.extra.push({ anchor, offset, kind });
      anchor.onTargetFound = () => anchorFound(entry);
      anchor.onTargetLost = () => anchorLost(entry);
    }
  });
}

/* ----------------------------------------------------------------------------------------------
 * Estabilizador de anclaje (el de la app ORIGINAL, mejorado): MindAR entrega una pose por cuadro procesado,
 * con ruido cuando la bolsa está quieta y con retraso cuando se mueve. Aquí se mide la velocidad real de la
 * bolsa y se decide cuánto seguirla:
 *   - quieta (se mueve menos de ~2 px): el contenido NO se mueve (cero temblor),
 *   - temblor de la mano: sigue muy suave,
 *   - movimiento normal: sigue proporcional a la velocidad,
 *   - movimiento rápido o salto grande: sigue 1:1 (sin retraso).
 * Mejoras sobre la original: también se mide el GIRO (inclinar el celular sin moverlo), las distancias se miden en
 * milésimas del ancho del marcador (sirven igual para marcadores de distinto tamaño) y, si cambia el marcador que
 * ve la bolsa (bolsa ↔ foto ↔ palabras), el contenido se pega directo a la nueva pose en vez de deslizarse.
 * ---------------------------------------------------------------------------------------------- */
const _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _sv = new THREE.Vector3();
const _tp = new THREE.Vector3(), _gq = new THREE.Quaternion(), _pp = new THREE.Vector3();
/* Estabilizador "anclado al mundo" (como el seguimiento extendido de Vuforia / el paso a SLAM de 8th Wall):
   la bolsa en la pared NO se mueve; lo que se mueve es el celular. La pose de la bolsa se guarda en un marco fijo
   (la orientación del celular en un instante de referencia, medida con el giroscopio) y ahí se filtra fuerte: el giro
   y el temblor de la mano ya no pasan por MindAR (que tiene ruido) sino por el giroscopio (que es exacto y rápido).
   Cada cuadro se dibuja = giro del celular desde la referencia × pose filtrada. Si la bolsa SÍ se mueve (la llevan
   en la mano), el filtro la sigue rápido. Sin giroscopio se usa el estabilizador de antes. */
const _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion(), _wp = new THREE.Vector3(), _wv = new THREE.Vector3();
function stabilizeWorld(a, dt) {
  // Marco fijo = orientación del celular en un instante de referencia (giroscopio). En ese marco:
  //   - la ORIENTACIÓN de la bolsa en la pared no cambia aunque el celular gire o la rodee → se filtra fuerte;
  //   - la POSICIÓN cambia solo si el celular se desplaza (o mueven la bolsa) → filtro alfa-beta con VELOCIDAD, que
  //     predice dónde está ahora (las poses de MindAR llegan con retraso). Antes el giro se aplicaba al instante y el
  //     desplazamiento con retraso: al girar ALREDEDOR de la bolsa el contenido se balanceaba hacia afuera.
  const st = a.wstab || (a.wstab = { wp: new THREE.Vector3(), wv: new THREE.Vector3(), wq: new THREE.Quaternion(), sc: new THREE.Vector3(1, 1, 1),
    mq: new THREE.Quaternion(), ms: new THREE.Vector3(1, 1, 1), tm: 0, op: new THREE.Vector3(), res: 0, rawPos: new THREE.Vector3(), rawQuat: new THREE.Quaternion(), tRef: 0, on: false, src: null });
  if (!a.group.visible) { st.on = false; return true; }
  a.group.matrix.decompose(_sp, _sq, _ss);
  if (!isFinite(_sp.x) || !isFinite(_sq.x) || !isFinite(_ss.x)) return true;
  const now = performance.now(), c = state.mindar && state.mindar.controller;
  const cap = a.capT || (c && c.__poseT && a.srcIdx != null && c.__poseT[a.srcIdx]) || now;
  const fresh = !st.on || st.src !== a.source;
  if (!fresh && now - st.tRef > 800) {          // la historia del giroscopio es corta: se renueva la referencia
    if (!cameraDelta(st.tRef, now, _wq)) { st.on = false; return false; }
    st.wp.applyQuaternion(_wq); st.wv.applyQuaternion(_wq); st.op.applyQuaternion(_wq); st.wq.premultiply(_wq); st.mq.premultiply(_wq);
    st.tRef = now;
  }
  const newPose = fresh || _sp.distanceToSquared(st.rawPos) > 1e-12 || Math.abs(_sq.dot(st.rawQuat)) < 0.9999999;
  if (newPose) {
    const tRef = fresh ? now : st.tRef;
    if (!cameraDelta(cap, tRef, _wq)) return false;
    _wp.copy(_sp).applyQuaternion(_wq); _wq2.copy(_sq).premultiply(_wq);
    if (fresh) {
      st.tRef = now; st.wp.copy(_wp); st.wv.set(0, 0, 0); st.wq.copy(_wq2); st.mq.copy(_wq2); st.sc.copy(_ss); st.ms.copy(_ss);
      st.tm = cap; st.on = true; st.src = a.source; st.op.copy(_wp); st.res = 0;
    } else {
      // alfa-beta: predicción al instante de la medida, residuo, corrección de posición y velocidad
      const h = Math.max(0.008, Math.min(0.4, (cap - st.tm) / 1000));
      st.wp.addScaledVector(st.wv, h);
      _wv.copy(_wp).sub(st.wp);
      const unit = Math.max(1e-6, _ss.x) / 1000, res = _wv.length() / unit;     // milésimas del ancho de la bolsa
      // residuo chico = ruido (suavizar mucho); grande = movimiento real (seguir ya)
      st.res = res;
      const k = Math.min(1, Math.max(0, (res - 4) / 20));
      const al = 0.25 + 0.65 * k, be = 0.04 + 0.36 * k;
      st.wp.addScaledVector(_wv, al);
      st.wv.addScaledVector(_wv, be / h);
      const vmax = 2.5 * _ss.x; if (st.wv.length() > vmax) st.wv.setLength(vmax);   // máx. 2.5 bolsas/s
      if (_wq2.dot(st.mq) < 0) _wq2.set(-_wq2.x, -_wq2.y, -_wq2.z, -_wq2.w);
      st.mq.copy(_wq2); st.ms.copy(_ss); st.tm = cap;
    }
    st.rawPos.copy(_sp); st.rawQuat.copy(_sq);
  }
  // orientación y tamaño: suave si la diferencia es ruido, rápido si cambió de verdad
  if (st.wq.dot(st.mq) < 0) st.mq.set(-st.mq.x, -st.mq.y, -st.mq.z, -st.mq.w);
  const ang = 2 * Math.acos(Math.min(1, Math.abs(st.wq.dot(st.mq)))) * 180 / Math.PI;
  const step = Math.max(0, Math.min(0.1, dt || 0.016));
  const tauR = ang < 1.5 ? 0.25 : ang < 5 ? 0.1 : 0.04;
  st.wq.slerp(st.mq, 1 - Math.exp(-step / tauR));
  st.sc.lerp(st.ms, 1 - Math.exp(-step / 0.12));
  // se dibuja: posición predicha a AHORA (velocidad, máx. 150 ms) y giro del celular hasta ahora (giroscopio)
  if (!cameraDelta(st.tRef, now, _wq)) { st.on = false; return false; }
  _tp.copy(st.wp).addScaledVector(st.wv, Math.min(0.15, Math.max(0, (now - st.tm) / 1000)));
  // último suavizado muy corto (quita los saltitos cuando llega cada medida); más corto si hay movimiento real
  st.op.lerp(_tp, 1 - Math.exp(-step / (st.res > 8 ? 0.012 : 0.035)));
  _sp.copy(st.op).applyQuaternion(_wq); _sq.copy(st.wq).premultiply(_wq);
  a.group.matrix.compose(_sp, _sq, st.sc);
  if (a.stab) a.stab.on = false;
  return true;
}

/* DOS MODOS, elegidos solos en cada momento:
   - MODO PARED/MESA: la bolsa está fija en una superficie (el seguimiento cuadro a cuadro ve que el fondo se mueve igual
     que la bolsa) → estabilizador anclado al mundo (giroscopio) y poses de MindAR sin filtro: queda clavada al mover
     o rodear con el celular.
   - MODO MANO: la bolsa se mueve distinto del fondo (la llevan en la mano) → estabilizador de siempre + filtro de
     MindAR (lo que ya funcionaba bien al mover la bolsa).
   Entra a pared/mesa tras 0.4 s fija; vuelve a mano apenas (0.25 s) la bolsa se mueve sola. */
let _modeT = 0;
function updateFixedMode() {
  const now = performance.now(); if (now - _modeT < 8) return; _modeT = now;
  const fo = state.flow && state.flow.out, f = !!(fo && fo.ok && fo.fixed);
  if (f) { state.fixSince = state.fixSince || now; state.unfixSince = 0; } else { state.unfixSince = state.unfixSince || now; state.fixSince = 0; }
  state.worldMode = state.worldMode ? !(state.unfixSince && now - state.unfixSince > 250) : !!(state.fixSince && now - state.fixSince > 400);
}

function stabilizeRoot(a, dt) {
  updateFixedMode();
  if (state.worldMode && gyroState.ok && state.project.settings.gyro !== false && state.project.settings.worldStabilizer !== false) {
    if (stabilizeWorld(a, dt)) return;
    a.group.matrix.decompose(_sp, _sq, _ss);   // sin historia de giroscopio suficiente: estabilizador normal
  }
  if (a.wstab) a.wstab.on = false;
  const st = a.stab || (a.stab = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
    vel: new THREE.Vector3(), angVel: 0, rawPos: new THREE.Vector3(), rawQuat: new THREE.Quaternion(), rawT: 0, capT: 0, on: false, src: null });
  if (!a.group.visible) { st.on = false; return; }
  a.group.matrix.decompose(_sp, _sq, _ss);
  if (!isFinite(_sp.x) || !isFinite(_sq.x) || !isFinite(_ss.x)) return;
  const now = performance.now();
  const c = state.mindar && state.mindar.controller;
  const capOf = () => a.capT || (c && c.__poseT && a.srcIdx != null && c.__poseT[a.srcIdx]) || now;
  if (!st.on || st.src !== a.source) {
    // primera vez que se ve (o cambió el marcador que la ve): se pega directo a la bolsa
    st.pos.copy(_sp); st.quat.copy(_sq); st.scale.copy(_ss); st.vel.set(0, 0, 0);
    st.rawPos.copy(_sp); st.rawQuat.copy(_sq); st.rawT = now; st.capT = capOf(); st.on = true; st.src = a.source;
    a.group.matrix.compose(st.pos, st.quat, st.scale);
    return;
  }
  // unidades: milésimas del ancho del marcador (la escala del ancla es el ancho del marcador)
  const unit = Math.max(1e-6, _ss.x) / 1000;
  const useGyro = gyroState.ok && state.project.settings.gyro !== false;
  // ¿llegó una pose NUEVA de MindAR? (llegan pocas veces por segundo; la pantalla dibuja ~60)
  if (_sp.distanceToSquared(st.rawPos) > 1e-12 || Math.abs(_sq.dot(st.rawQuat)) < 0.9999999) {
    const cap = capOf();
    const gap = Math.max(16, Math.min(400, now - st.rawT)) / 1000;
    // Velocidad de la bolsa. Con giroscopio, las dos poses se llevan al mismo instante (ahora) antes de restarlas:
    // así el giro del celular no cuenta como "movimiento" (ya lo corrige el giroscopio) y solo queda el desplazamiento.
    _pp.copy(st.rawPos);
    if (useGyro && cameraDelta(st.capT, now, _gq)) _pp.applyQuaternion(_gq);
    _sv.copy(_sp);
    if (useGyro && cameraDelta(cap, now, _gq)) _sv.applyQuaternion(_gq);
    _sv.sub(_pp).divideScalar(gap);
    st.vel.lerp(_sv, 0.6);
    // velocidad de GIRO de la bolsa (grados/s): un giro lento y constante no es "temblor", hay que seguirlo. Se mide
    // el giro NETO en ventanas de ~0.25 s (el ruido de MindAR va y viene y no se acumula; un giro real sí)
    if (!st.angRefT || now - st.angRefT > 600) { st.angRefQ = (st.angRefQ || new THREE.Quaternion()).copy(_sq); st.angRefT = now; }
    else if (now - st.angRefT >= 250) {
      st.angVel = 2 * Math.acos(Math.min(1, Math.abs(_sq.dot(st.angRefQ)))) * 180 / Math.PI / ((now - st.angRefT) / 1000);
      st.angRefQ.copy(_sq); st.angRefT = now;
    }
    st.rawPos.copy(_sp); st.rawQuat.copy(_sq); st.rawT = now; st.capT = cap;
  }
  // Giroscopio: la pose de MindAR es de un cuadro de hace un rato; se gira lo que giró el celular desde ese cuadro.
  // Entre pose y pose (y mientras los cuadros salen borrosos) el contenido sigue la bolsa en vez de quedarse quieto.
  let gyroMoving = false;
  if (useGyro && cameraDelta(st.capT, now, _gq)) {
    const gAng = 2 * Math.acos(Math.min(1, Math.abs(_gq.w))) * 180 / Math.PI;
    if (gAng < 35) { _sp.applyQuaternion(_gq); _sq.premultiply(_gq); gyroMoving = gyroState.rate > 8; }
  }
  if (st.quat.dot(_sq) < 0) _sq.set(-_sq.x, -_sq.y, -_sq.z, -_sq.w);   // sin giros de 360°
  const speed = st.vel.length() / unit;                                 // milésimas de bolsa por segundo
  const jump = _sp.distanceTo(st.pos) / unit;
  const ang = 2 * Math.acos(Math.min(1, Math.abs(st.quat.dot(_sq)))) * 180 / Math.PI;
  // Destino: la última pose + un poco hacia donde se mueve (predicción, máx. 0.1 s) para que no quede atrás.
  _tp.copy(_sp);
  if (speed > 120) _tp.addScaledVector(st.vel, Math.min(0.1, (now - st.rawT) / 1000 + 0.03));
  // Suavizado por TIEMPO (fluido a cualquier fps): quieta = no se mueve; lento = suave; rápido = casi inmediato.
  let tauP, tauR;
  if (gyroMoving) { tauP = 0.02; tauR = 0.02; }                                      // el celular gira: seguir el giroscopio ya
  else if (jump < 3.4 && speed < 70 && ang < 1.2 && st.angVel < 6) { tauP = Infinity; tauR = Infinity; }   // quieta: cero temblor
  else if (jump < 7.4 && speed < 130 && ang < 2.5 && st.angVel < 15) { tauP = 0.35; tauR = 0.4; }      // temblor de la mano
  else {
    const k = Math.min(1, Math.max((speed - 130) / 600, (jump - 7.4) / 40, (ang - 2.5) / 15, (st.angVel - 15) / 90));
    tauP = THREE.MathUtils.lerp(0.07, 0.015, k); tauR = THREE.MathUtils.lerp(0.09, 0.02, k);   // rápido: casi sin retraso
  }
  const step = Math.max(0, Math.min(0.1, dt || 0.016));
  const pa = tauP === Infinity ? 0 : 1 - Math.exp(-step / tauP);
  const ra = tauR === Infinity ? 0 : 1 - Math.exp(-step / tauR);
  st.pos.lerp(_tp, pa); st.quat.slerp(_sq, ra); st.scale.lerp(_ss, ra);
  a.group.matrix.compose(st.pos, st.quat, st.scale);
}

/** Copia al root del sabor la pose del marcador visible (bolsa o logo). */
const _fm = new THREE.Matrix4();
function syncFlavorRoot(entry, dt = 0) {
  const a = entry.anchor;
  if (!a.full) return;
  const ctl = state.mindar && state.mindar.controller;
  const F = state.flow, fo = F && F.out;
  a.capT = 0;
  // 1) Seguimiento cuadro a cuadro (js/flow.js): pose nueva en cada cuadro de la cámara → el contenido va pegado a
  //    la bolsa aunque se mueva rápido.
  let byFlow = false;
  // el seguimiento cuadro a cuadro solo sostiene el contenido si MindAR confirmó ESTE sabor hace poco (1.5 s): si no,
  // puede estar siguiendo la pared u otra bolsa del mismo diseño → se suelta y el contenido se quita
  const flv = entry.flavor.targetIndex, fT = ctl && ctl.__firmT && ctl.__firmT[flv];
  const flowMine = fo && fo.ok && (fo.idx % state.flavors.length) === flv;
  // Bolsa a la vista: MindAR debe confirmar el sabor cada 1.5 s. Bolsa (casi) fuera de la imagen y sostenida por la
  // pared: hasta 6 s sin confirmación (no se puede confirmar lo que no se ve) → el contenido se queda en su sitio.
  const wallHold = flowMine && fo.wall && fo.vis < 0.6 && performance.now() - fo.wallSince < 6000;
  // Movimiento RÁPIDO en la mano: la imagen sale borrosa y MindAR deja de confirmar, pero el seguimiento cuadro a
  // cuadro sigue la bolsa bien. Si lo hace con muchos puntos firmes, se le dan hasta 3.5 s (antes 1.5 s y se soltaba).
  const flowStrong = flowMine && fo.inliers >= 18;
  const confirmWin = flowStrong ? 3500 : 1500;
  // Pose sacada de la PARED con la bolsa a la vista: si la bolsa se ve pero se perdieron sus puntos, es que se movió
  // (va en la mano). Al girar el celular el fondo y la bolsa se mueven igual en la imagen, así que "la pared coincide"
  // no prueba que la bolsa esté pegada: la pared solo sostiene el contenido con la bolsa (casi) fuera de cuadro.
  const wallWrong = flowMine && fo.wall && fo.vis >= 0.6;
  if (wallWrong || (flowMine && !wallHold && !(fT && performance.now() - fT < confirmWin))) { F.reset(); }
  else if (flowMine && ctl && fo.mvt && performance.now() - fo.t < 160) {
    let off = null, kind = 'bolsa';
    if (fo.idx === a.full.targetIndex) off = null;
    else { const x = a.extra.find(e => e.anchor.targetIndex === fo.idx); if (x) { off = x.offset; kind = x.kind; } else kind = null; }
    const post = state.mindar.postMatrixs && state.mindar.postMatrixs[fo.idx];
    if (kind && post) {
      _fm.fromArray(ctl._glModelViewMatrix(fo.mvt, fo.idx)).multiply(post);
      if (off) _fm.multiply(off);
      a.group.matrix.copy(_fm); a.group.visible = true; a.source = kind; a.srcIdx = fo.idx; a.capT = fo.t;
      byFlow = true;
    }
  }
  if (byFlow) { /* listo */ }
  else if (a.full.group.visible) {
    a.group.matrix.copy(a.full.group.matrix); a.group.visible = true; a.source = 'bolsa'; a.srcIdx = a.full.targetIndex;
  } else {
    const x = a.extra.find(e => e.anchor.group.visible);
    if (x) { a.group.matrix.multiplyMatrices(x.anchor.group.matrix, x.offset); a.group.visible = true; a.source = x.kind; a.srcIdx = x.anchor.targetIndex; }
    else { a.group.visible = false; a.source = null; }
  }
  // 2) Sin seguimiento cuadro a cuadro y MindAR tampoco la está rastreando en este momento (solo la "recuerda"
  //    unos cuadros): la bolsa no está → el contenido se quita YA, sin quedar flotando.
  if (!byFlow && F && a.group.visible && ctl && ctl.trackingStates) {
    const ts = ctl.trackingStates[a.srcIdx];
    if (ts && !ts.isTracking) { a.group.visible = false; a.source = null; }
  }
  if (flowMine && !wallWrong) a.flowOkT = performance.now();
  const ts3 = ctl && ctl.__trackStrong, strongNow = ts3 && ts3.length ? ts3[ts3.length - 1] : 99;
  const dropTracking = (counter) => {
    a.flowOkT = 0; a.disT = 0; a.group.visible = false; a.source = null; if (a.stab) a.stab.on = false; if (a.wstab) a.wstab.on = false;
    ctl[counter] = (ctl[counter] || 0) + 1;
    if (F && fo && (fo.idx % state.flavors.length) === flv) F.reset();
    ctl.trackingStates.forEach((st, i) => {
      if (i % state.flavors.length !== flv || !st.showing) return;
      st.showing = false; st.isTracking = false; st.trackCount = 0; st.trackMiss = 0; st.trackingMatrix = null;
      ctl.onUpdate && ctl.onUpdate({ type: 'updateMatrix', targetIndex: i, worldMatrix: null });
    });
  };
  // 3) Seguimiento cuadro a cuadro y MindAR NO coinciden (más de 1/4 de bolsa) con MindAR casi sin ver la bolsa durante
  //    1.5 s (solo con el contenido ya alineado; en el celular, con la bolsa real MindAR tiene ~7 coincidencias fuertes):
  //    tras un movimiento rápido el seguimiento cuadro a cuadro puede quedar calibrado con una pose mala y seguir la
  //    bolsa "bien" pero corrido (medido: 82 puntos firmes y 24 % de error) y MindAR, débil, no lo corrige. Ninguna
  //    de las dos es confiable → se suelta y se reconoce de nuevo (la detección da la pose correcta).
  if (a.aligned && byFlow && ctl && ctl.trackingStates && strongNow < 4) {
    const x = a.full.targetIndex === fo.idx ? { anchor: a.full, offset: null } : a.extra.find(q => q.anchor.targetIndex === fo.idx);
    let dis = 0;
    if (x && x.anchor.group.visible) {
      _fm.copy(x.anchor.group.matrix); if (x.offset) _fm.multiply(x.offset);
      _sv.setFromMatrixPosition(_fm); _tp.setFromMatrixPosition(a.group.matrix); _ss.setFromMatrixScale(a.group.matrix);
      dis = _sv.distanceTo(_tp) / Math.max(1e-6, _ss.x);
    }
    if (dis > 0.25) { a.disT = a.disT || performance.now(); if (performance.now() - a.disT > 1500) { dropTracking('__mismatchDrops'); byFlow = false; } }
    else a.disT = 0;
  } else a.disT = 0;
  if (!a.group.visible && !(a.full.group.visible || a.extra.some(x => x.anchor.group.visible))) a.flowOkT = 0;
  if (state.project.settings.stabilizer !== false) stabilizeRoot(a, dt);
  // Si la bolsa sale de la pantalla, el contenido se quita YA (aunque MindAR todavía crea verla en el borde).
  // Se mira la pose ya corregida con el giroscopio: al girar el celular para otro lado se quita al instante.
  // (Con la pared sosteniendo la pose, el contenido se deja en su sitio aunque quede fuera: sale de la vista solo.)
  if (a.group.visible && state.mindar && state.mindar.camera && !(byFlow && fo && fo.wall)) {
    _sv.setFromMatrixPosition(a.group.matrix).project(state.mindar.camera);
    if (!isFinite(_sv.x) || Math.abs(_sv.x) > 0.95 || Math.abs(_sv.y) > 0.95 || _sv.z > 1 || _sv.z < -1) {
      a.group.visible = false; a.source = null; if (a.stab) a.stab.on = false;
    }
  }
  // COMPUERTA DE ALINEACIÓN: la primera vez (o tras perder la bolsa) el contenido no aparece hasta que la pose es
  // coherente, estable y coincide con el anclaje de la IA (js/recognition.js). Así nunca sale volteado ni corrido.
  if (a.group.visible && !a.aligned && ctl && ctl.pipasPoseReady && state.project.settings.alignGate !== false && !window.PIPAS_NOGATE) {
    if (ctl.pipasPoseReady(entry.flavor.targetIndex)) { a.aligned = true; if (a.stab) a.stab.on = false; if (a.wstab) a.wstab.on = false; }
    else { a.group.visible = false; a.aligning = performance.now(); a.source = null; }
  }
  if (a.group.visible) a.alignSeen = performance.now();
  else if (a.aligned && performance.now() - (a.alignSeen || 0) > 2000) a.aligned = false;   // perdida más de 2 s: volver a alinear (un tirón rápido no obliga a esperar)
  a.group.matrixWorldNeedsUpdate = true;
}

function anchorFound(entry) {
  const a = entry.anchor;
  clearTimeout(a.lostTimer);
  syncFlavorRoot(entry);
  if (!a.on && a.group.visible) { a.on = true; onFound(entry); }
}

function anchorLost(entry) {
  const a = entry.anchor;
  clearTimeout(a.lostTimer);
  // Breve espera: al pasar de la bolsa al logo (o al revés) no se reinicia la medalla ni la interfaz
  a.lostTimer = setTimeout(() => {
    syncFlavorRoot(entry);
    if (a.on && !a.group.visible) { a.on = false; onLost(entry); }
  }, 120);
}

function onFound(entry) {
  state.current = entry;
  entry.visibleSince = performance.now();
  state.seen.add(entry.flavor.id);
  applyFlavorLights(state.arLights, entry.flavor.lights);
  document.documentElement.style.setProperty('--flavor', entry.flavor.color);
  $('scan').classList.add('hidden');
  hideAdvice();
  if (!state.medals.has(entry.flavor.id)) showToast(`${entry.flavor.emoji || '✨'} ${entry.flavor.name}`, entry.flavor.color);
  renderHud();
}

function onLost(entry) {
  entry.visibleSince = 0;
  if (state.current === entry) state.current = null;
  if (!state.flavors.some(e => e.anchor.group.visible)) {
    state.scanSince = performance.now();
    $('scan').classList.remove('hidden');
    $('scan-hint').innerHTML = 'Apunta la cámara a tu empaque de <strong>Pipas Mega</strong>';
  }
  renderHud();
}

/** Aplica minCF / beta / gracia al filtro de MindAR (en vivo). */
/* Filtro interno de MindAR: suaviza cada uno de los 16 números de la pose por separado y el giro queda ATRASADO respecto
   a la posición (con movimientos lentos, como rodear la bolsa, mucho). Con giroscopio, el estabilizador anclado al mundo
   ya suaviza sabiendo el instante exacto de cada cuadro → el filtro de MindAR se apaga (poses crudas, sin retraso).
   Sin giroscopio se usa el filtro de siempre. Se revisa cada 150 ms (el giroscopio puede activarse después). */
let _rawFilter = null;
function syncMindarFilter(force) {
  const c = state.mindar && state.mindar.controller, p = state.stab; if (!c || !p) return;
  const S = state.project.settings;
  const raw = !!(state.worldMode && gyroState.ok && S.gyro !== false && S.worldStabilizer !== false && S.stabilizer !== false);
  if (!force && raw === _rawFilter) return;
  _rawFilter = raw;
  const minCF = raw ? 1e4 : p.minCF, beta = raw ? 0 : p.beta;
  c.filterMinCF = minCF; c.filterBeta = beta;
  (c.trackingStates || []).forEach(st => { if (st.filter) { st.filter.minCutOff = minCF; st.filter.beta = beta; } });
  c.__rawFilter = raw;
}

function applyStability(p) {
  state.stab = { ...p };
  const c = state.mindar && state.mindar.controller;
  if (c) {
    syncMindarFilter(true);
    // Gracia: cuántos cuadros se mantiene el contenido sin ver el empaque (~40 ms por ciclo)
    c.missTolerance = Math.max(2, Math.min(40, Math.round((p.graceMs || 250) / 40)));
    c.pipasGraceMs = p.graceMs || 250; // la gracia real se mide en tiempo (js/recognition.js)
  }
  syncAuditControls();
}

/* Descarga de los empaques (targets.mind, ~16 MB) con porcentaje visible. Empieza apenas abre la app, en paralelo
   con el proyecto y las fuentes, y la app le pasa a MindAR el archivo ya descargado (no lo baja dos veces). */
let targetsDl = null;
function prefetchTargets() {
  if (targetsDl) return targetsDl;
  targetsDl = { pct: 0, done: false };
  // baja un archivo con porcentaje visible; devuelve sus partes
  const download = async (url, expected) => {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error('http ' + res.status);
    const total = +res.headers.get('content-length') || 0, rd = res.body.getReader(), parts = []; let got = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; targetsDl.pct = Math.min(0.99, got / (total || expected)); targetsDl.t = performance.now(); }
    if (total && got < total) throw new Error('descarga incompleta');
    return parts;
  };
  // ¿parece un .mind? (MessagePack: empieza con un mapa)
  const looksMind = (u8) => u8.length > 0 && ((u8[0] >= 0x80 && u8[0] <= 0x8f) || u8[0] === 0xde);
  targetsDl.promise = (async () => {
    // 1) Versión COMPRIMIDA (targets.mind.gz, la mitad de peso, mismo contenido): se descomprime en el celular.
    //    Si el navegador no puede, el archivo no está o sale mal, se usa targets.mind normal.
    if (typeof DecompressionStream === 'function') {
      try {
        const parts = await download('targets/targets.mind.gz', 8.5e6);
        const head = parts[0] || new Uint8Array(0);
        let blob = new Blob(parts);
        if (head[0] === 0x1f && head[1] === 0x8b) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
        if (blob.size > 1000 && looksMind(new Uint8Array(await blob.slice(0, 1024).arrayBuffer()))) {
          targetsDl.done = true; targetsDl.pct = 1; state.targetsGz = true;
          return URL.createObjectURL(blob);
        }
      } catch (e) { /* se usa el normal */ }
      targetsDl.pct = 0;
    }
    // 2) targets.mind normal: hasta 3 intentos (en datos móviles la descarga a veces se corta a la mitad)
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const parts = await download('targets/targets.mind', 16e6);
        targetsDl.done = true; targetsDl.pct = 1;
        return URL.createObjectURL(new Blob(parts));
      } catch (e) { lastErr = e; targetsDl.pct = 0; targetsDl.t = performance.now(); await new Promise(r => setTimeout(r, 800 * (attempt + 1))); }
    }
    targetsDl.done = true;
    const err = new Error('No se pudieron descargar los empaques (' + (lastErr && lastErr.message) + '). Revisa tu conexión a internet y toca "Reintentar".');
    err.name = 'AssetError';
    throw err;
  })();
  targetsDl.promise.catch(() => {});   // el error se muestra cuando startAR lo espera
  return targetsDl.promise;
}

async function startAR() {
  const P = state.project;
  // vigilante: si algo se queda trabado (sin avanzar 20 s), se muestra "Reintentar" en vez de quedarse en la carga
  let lastStep = performance.now(), finished = false;
  const step = (pct, text) => { lastStep = performance.now(); progress(pct, text); };
  const watchdog = setInterval(() => {
    if (finished) return clearInterval(watchdog);
    const busy = targetsDl && !targetsDl.done && targetsDl.t && performance.now() - targetsDl.t < 5000;
    if (!busy && performance.now() - lastStep > 20000) { clearInterval(watchdog); showError('La cámara tardó demasiado en arrancar. Toca "Reintentar".'); }
  }, 1000);
  window.PIPAS_STAGE = (s) => { if (s === 'targets') step(82, 'Cargando empaques…'); else if (s === 'warmup') step(92, 'Preparando el escáner…'); };
  try { await startARInner(P, step); finished = true; } finally { finished = true; clearInterval(watchdog); }
}

async function startARInner(P, step) {
  const container = $('ar');
  const stab = stabilityParams(P.settings);

  step(40, 'Preparando reconocimiento…');
  const { MindARThree } = await import('mindar-image-three');
  // espera la descarga de los empaques mostrando el porcentaje
  prefetchTargets();
  const dlTick = setInterval(() => { if (!targetsDl.done) step(40 + Math.round(targetsDl.pct * 25), 'Descargando empaques… ' + Math.round(targetsDl.pct * 100) + '%'); }, 200);
  let targetsSrc;
  try { targetsSrc = await targetsDl.promise; } finally { clearInterval(dlTick); }
  const mindar = new MindARThree({
    container,
    imageTargetSrc: targetsSrc,
    maxTrack: 1,
    uiLoading: 'no', uiScanning: 'no', uiError: 'no',
    filterMinCF: stab.minCF,
    filterBeta: stab.beta,
    warmupTolerance: 0,   // el contenido aparece en el MISMO cuadro en que se reconoce (antes esperaba 1 cuadro más)   // el contenido aparece tras 1 cuadro de seguimiento (~0.1 s): la pose ya está corregida y no sale inclinado
    missTolerance: 5
  });
  state.mindar = mindar;
  const { renderer, scene, camera } = mindar;
  // MindAR dibuja a la densidad completa de la pantalla (3× en muchos celulares): 2× se ve igual y cuesta mucho menos
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.arLights = addDefaultLights(scene);

  // Cada sabor tiene un "root" propio que sigue al marcador que esté viendo la cámara:
  // la bolsa completa (targetIndex) o, si se compiló, el logo "MEGA + sabor" (NF + targetIndex).
  state.flavors = P.flavors.map(flavor => {
    const root = new THREE.Group();
    root.matrixAutoUpdate = false; root.visible = false;
    scene.add(root);
    const full = mindar.addAnchor(flavor.targetIndex);
    const anchor = { group: root, full, extra: [], on: false, lostTimer: 0 };
    const entry = { ...buildEntryContent(flavor, root), anchor, visibleSince: 0 };
    full.onTargetFound = () => anchorFound(entry);
    full.onTargetLost = () => anchorLost(entry);
    return entry;
  });

  container.addEventListener('pointerup', (ev) => {
    if (state.sim && state.sim.active) return;
    const entry = state.flavors.find(e => e.anchor.group.visible);
    if (!entry) return;
    const rect = container.getBoundingClientRect();
    handleTap(entry, camera, new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1));
  });

  step(70, 'Activando cámara…');
  await mindar.start();
  if (typeof targetsSrc === 'string' && targetsSrc.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(targetsSrc), 2000);
  // Comparación de los 4 empaques por puntos clave (siempre) + color como desempate (opcional)
  const NF = P.flavors.length;
  installColorVerification(mindar.controller, mindar.video, { nFlavors: NF, useColor: P.settings.colorCheck !== false, autoContrast: P.settings.autoContrast !== false });
  if (P.settings.gyro !== false) startGyro();
  // IA que encuentra el empaque (sabor + esquinas): se carga aparte, la app funciona igual mientras tanto
  if (P.settings.ai !== false) {
    import('./ai.js').then(m => m.loadAI('models/pipas_ai.json')).then(ai => { mindar.controller.pipasAI = ai; })
      .catch(e => console.warn('IA no disponible:', e && e.message));
  }
  // Seguimiento cuadro a cuadro de la bolsa (sigue la bolsa en cada cuadro de la cámara entre los cálculos de MindAR)
  if (P.settings.flow !== false) {
    try {
      const ctl = mindar.controller;
      state.flow = createFlow(ctl, mindar.video, {
        // solo trabaja cuando hay (o acaba de haber) una bolsa: mientras se busca, todo el celular es para reconocer
        isActive: () => (ctl.trackingStates || []).some(s => s.isTracking || s.showing),
        // campo de visión real de este celular, medido con la bolsa inclinada: se guarda y se usa al volver a abrir
        onFov: (fovy) => {
          try {
            const prev = parseFloat(localStorage.getItem('pipas_fovy')) || 0;
            if (Math.abs(prev - fovy) >= 1.5) localStorage.setItem('pipas_fovy', String(fovy));
          } catch (e) { /* sin almacenamiento */ }
        },
      });
      window.__pipasFlow = state.flow; state.flow.start();
    }
    catch (e) { console.warn('Seguimiento cuadro a cuadro no disponible:', e); state.flow = null; }
  }
  addExtraAnchors(mindar, NF);
  applyStability(stab);
  hookLatency(mindar.controller);
  if (/[?&]debug=1\b/.test(location.search)) installDebugOverlay(mindar);
  state.arStarted = true;
  // Modo prueba con cámara real: index.html?prueba=1 (mide reconocimiento/seguimiento y graba video)
  if (/[?&]prueba=1\b/.test(location.search)) import('./phone-test.js').then(m => m.installPhoneTest(state)).catch(e => console.warn('Modo prueba:', e));

  progress(100, '¡Listo!');
  setTimeout(() => {
    $('loader').classList.add('hidden');
    $('topbar').classList.remove('hidden');
    $('side-tools').classList.remove('hidden');
    $('scan').classList.remove('hidden');
    state.scanSince = performance.now();
    renderHud();
  }, 250);

  const clock = new THREE.Clock();
  const stableMs = P.settings.medalStableMs || 600;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    countFrame();
    if (state.sim && state.sim.active) return; // el simulador tiene su propio render
    const now = performance.now();
    const ctl = mindar.controller;
    if (ctl.pipasEnforceVisibility) ctl.pipasEnforceVisibility();
    for (const e of state.flavors) syncFlavorRoot(e, dt);
    // Aparece / desaparece según lo que se dibuja (también cuando lo mueve el seguimiento cuadro a cuadro)
    for (const e of state.flavors) {
      const a = e.anchor;
      if (a.group.visible) { a.hiddenAt = 0; if (!a.on) { a.on = true; onFound(e); } }
      else if (a.on) { if (!a.hiddenAt) a.hiddenAt = now; else if (now - a.hiddenAt > 150) { a.on = false; a.hiddenAt = 0; onLost(e); } }
    }
    for (const e of state.flavors) {
      if (!e.anchor.group.visible) continue;
      updateEntry(e, dt, t, camera);
      if (e.visibleSince && now - e.visibleSince >= stableMs) unlockMedal(e);
    }
    renderer.render(scene, camera);
  });
  setInterval(runOpticalAudit, 500);
  setInterval(updateScanState, 150);
}

/* ================================================================ Diagnóstico en pantalla (?debug=1) */
function installDebugOverlay(mindar) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:4px;right:4px;bottom:4px;z-index:99999;background:rgba(0,0,0,.75);color:#9f9;font:10px/1.35 monospace;padding:5px 7px;border-radius:6px;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(el);
  let lastDet = 0, detN = 0, t0 = performance.now();
  setInterval(() => {
    const c = mindar.controller, v = mindar.video, F = state.flow, fo = F && F.out, st = c.__pipasStats || {};
    const det = (st.moving || 0) + (st.full || 0) + (st.norm || 0) + (st.zoom || 0);
    const trk = (c.trackingStates || []).map((s, i) => s.isTracking ? i : -1).filter(i => i >= 0);
    const vis = state.flavors.find(e => e.anchor.group.visible);
    let fovSaved = ''; try { fovSaved = localStorage.getItem('pipas_fovy') || '-'; } catch (e) { fovSaved = '?'; }
    el.textContent =
      `cámara ${v.videoWidth}x${v.videoHeight} | pantalla ${state.audit ? state.audit.fps : '?'} fps\n` +
      `MindAR ${Math.round(c.__frameMs || 0)} ms/cuadro (${c.__frameMs ? (1000 / c.__frameMs).toFixed(1) : '?'} por s)\n` +
      `rastrea ${trk.length ? trk.join(',') : 'buscando…'} | visible ${vis ? vis.flavor.short || vis.flavor.id : 'no'}\n` +
      `cuadro a cuadro ${fo ? (fo.ok ? 'SÍ ' + fo.inliers + ' pts' : 'no') : 'apagado'} ${fo ? fo.ms.toFixed(1) + ' ms' : ''}\n` +
      `giroscopio ${gyroState.ok ? 'sí ' + Math.round(gyroState.rate) + '°/s' : 'no llega'}\n` +
      `ALINEACIÓN ${(() => { const G = (c.pipasGate || []).map((g, i) => g ? ['Pica', 'Acid', 'Maracu', 'Verde'][i] + (g.ready ? ' OK' : ' esperando') + ' (estable ' + g.n + ', IA coincide ' + g.aiOk + ', desvío ' + (g.anchorErr ?? '-') + ')' : '').filter(Boolean); return G.join(' | ') || '-'; })()}\n` +
      `MODO ${state.worldMode ? 'PARED/MESA (fija)' : 'MANO'} | fondo ${fo && fo.wallPts ? fo.wallPts + ' pts' : '-'}${fo && fo.wall ? ' (sostiene la pared)' : ''}\n` +
      `campo visión usado ${window.PIPAS_FOVY}° | medido ${fo && fo.fovy ? fo.fovy + '° ±' + fo.fovSpread + ' (' + fo.fovN + ')' : 'inclina la bolsa…'} | guardado ${fovSaved}\n` +
      `IA ${c.pipasAI ? (c.__ai ? ['nada', 'Pica', 'Acid', 'Maracu', 'Verde'][c.__ai.cls] + ' ' + Math.round(c.__ai.prob * 100) + '% ' + c.__ai.ms.toFixed(0) + ' ms' : 'lista') : 'cargando…'} | aciertos IA ${(c.__aiTrack || 0) + (c.__aiDetect || 0)}\n` +
      `luz ${c.__enhance ? Math.round(c.__enhance.mean * 100) + '% ' + (c.__enhance.filter !== 'none' ? '(aclarando)' : '') : '?'} | búsquedas ${det} | marcadores ${(c.markerDimensions || []).length}`;
  }, 500);
}

/* ================================================================ Marco del escáner con progreso */
// El marco cambia de color según lo que va viendo la app:
//   blanco = buscando · amarillo = ya ve puntos de un empaque (barra = qué tanto) · verde = reconocido, casi listo
const SCAN_HINT = 'Apunta la cámara a tu empaque de <strong>Pipas Mega</strong>';
let scanLevel = -1, scanBest = 0, scanFill = 0;
function updateScanState() {
  syncMindarFilter();
  const sc = $('scan'); if (!sc || sc.classList.contains('hidden') || !state.mindar) return;
  const c = state.mindar.controller, now = performance.now();
  const ret = sc.querySelector('.reticle'); if (!ret) return;
  let bar = sc.querySelector('.scan-bar');
  if (!bar) { bar = document.createElement('div'); bar.className = 'scan-bar'; bar.innerHTML = '<i></i><b></b>'; ret.after(bar); }
  // Etapas (cada una suma a la barra):
  //   colores de empaque en la imagen → la IA sabe qué sabor es → MindAR encuentra puntos coincidentes → reconocido
  const lm = c.__lastMatch, cands = lm && now - lm.t < 900 ? (lm.candidates || []) : [];
  const best = cands.reduce((a, x) => Math.max(a, x.inliers || 0), 0);
  scanBest = Math.max(best, scanBest * 0.8);
  // 100 % SOLO cuando el contenido ya se ve (antes bastaba con que MindAR lo intentara y a veces no salía nada)
  const tracking = (state.flavors || []).some(e => e.anchor.on && e.anchor.group.visible);
  const trying = (c.trackingStates || []).some(s => s.isTracking);
  const sg = c.__sig, colors = sg && now - sg.t < 1200 && sg.total > 260;
  const ai = c.__ai && now - c.__ai.t < 1200 && c.__ai.cls > 0 && c.__ai.prob >= 0.6 ? c.__ai : null;
  let target = 0;
  if (colors) target = 25;
  if (ai) target = 40 + Math.round(ai.prob * 25);            // 55–65 %
  if (scanBest >= 6) target = Math.max(target, 70 + Math.min(20, scanBest));
  if (trying) target = Math.max(target, 92);
  const aligning = !tracking && (state.flavors || []).some(e => e.anchor.aligning && now - e.anchor.aligning < 400);
  // la barra sube suave hacia la meta y, mientras se mantiene la bolsa, sigue avanzando de a poco (máx. 95 %)
  if (tracking) scanFill = 100;
  else if (target) scanFill = Math.min(95, Math.max(scanFill + 1.5, scanFill + (target - scanFill) * 0.35));
  else scanFill = Math.max(0, scanFill - 10);
  const level = tracking ? 2 : (target ? 1 : 0);
  bar.firstChild.style.width = Math.round(scanFill) + '%';
  bar.lastChild.textContent = scanFill > 1 ? Math.round(scanFill) + '%' : '';
  const names = ['', 'Pica Limón', 'Mega Acid', 'Maraculimón', 'Mega Verde'];
  const hint = level === 2 ? '¡Empaque reconocido! ✨'
    : aligning ? '<strong>Alineando…</strong> mantén el empaque a la vista'
    : ai ? `Escaneando <strong>${names[ai.cls]}</strong>… mantén el empaque quieto`
    : level === 1 ? '¡Ya casi! Mantén el empaque <strong>quieto</strong> dentro del marco' : SCAN_HINT;
  if (level !== scanLevel) {
    scanLevel = level;
    ret.classList.toggle('scan-near', level === 1); ret.classList.toggle('scan-ok', level === 2);
    bar.classList.toggle('scan-near', level === 1); bar.classList.toggle('scan-ok', level === 2);
  }
  const hEl = $('scan-hint'); if (hEl.innerHTML !== hint) hEl.innerHTML = hint;
}

/* ================================================================ Audit & Fix */
function countFrame() {
  const a = state.audit;
  a.frames++;
  const now = performance.now();
  if (now - a.lastT >= 1000) { a.fps = Math.round(a.frames * 1000 / (now - a.lastT)); a.frames = 0; a.lastT = now; }
}

function hookLatency(controller) {
  const orig = controller.onUpdate;
  controller.onUpdate = (d) => {
    if (d.type === 'processDone') {
      const now = performance.now();
      if (state.audit.lastProc) {
        state.audit.lats.push(now - state.audit.lastProc);
        if (state.audit.lats.length > 20) state.audit.lats.shift();
        state.audit.lat = Math.round(state.audit.lats.reduce((a, b) => a + b, 0) / state.audit.lats.length);
      }
      state.audit.lastProc = now;
    }
    orig && orig(d);
  };
}

const auditCanvas = document.createElement('canvas');
auditCanvas.width = 96; auditCanvas.height = 72;
const auditCtx = auditCanvas.getContext('2d', { willReadFrequently: true });

function runOpticalAudit() {
  const video = state.mindar && state.mindar.video;
  if (!video || video.readyState < 2 || (state.sim && state.sim.active)) return;
  const W = 96, H = 72;
  try { auditCtx.drawImage(video, 0, 0, W, H); } catch (e) { return; }
  const d = auditCtx.getImageData(0, 0, W, H).data;
  const gray = new Float32Array(W * H);
  let sum = 0, glare = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[p] = y; sum += y;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 235 && (mx - mn) < 40) glare++;
  }
  // Nitidez: varianza del laplaciano
  let lsum = 0, lsq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - W] - gray[i + W];
    lsum += l; lsq += l * l; n++;
  }
  const a = state.audit;
  a.luma = Math.round(sum / (W * H));
  a.glare = Math.round(glare / (W * H) * 1000) / 10;
  a.sharp = Math.round(lsq / n - (lsum / n) ** 2);
  a.res = `${video.videoWidth}×${video.videoHeight}`;
  updateAuditUi();
  evaluateAdvice();
}

function setBar(id, pct, cls) {
  const el = $(id); if (!el) return;
  el.style.width = Math.max(0, Math.min(100, pct)) + '%';
  el.className = cls || '';
}

function updateAuditUi() {
  if ($('audit').classList.contains('hidden')) return;
  const a = state.audit;
  $('m-fps').textContent = a.fps; setBar('b-fps', a.fps / 60 * 100, a.fps < 15 ? 'bad' : a.fps < 25 ? 'warn' : '');
  $('m-lat').textContent = a.lat ? a.lat + ' ms' : '–'; setBar('b-lat', 100 - a.lat / 3, a.lat > 200 ? 'bad' : a.lat > 100 ? 'warn' : '');
  $('m-luma').textContent = a.luma; setBar('b-luma', a.luma / 255 * 100, a.luma < 55 ? 'bad' : a.luma > 210 ? 'warn' : '');
  $('m-glare').textContent = a.glare + ' %'; setBar('b-glare', a.glare * 5, a.glare > 8 ? 'bad' : a.glare > 3 ? 'warn' : '');
  $('m-sharp').textContent = a.sharp; setBar('b-sharp', a.sharp / 8, a.sharp < 60 ? 'bad' : a.sharp < 150 ? 'warn' : '');
  $('m-res').textContent = a.res || '–';
  const e = activeEntry();
  $('m-track').textContent = e ? `🟢 Rastreando ${e.flavor.short || e.flavor.name}${e.anchor && e.anchor.source && e.anchor.source !== 'bolsa' ? ` (por ${e.anchor.source === 'foto' ? 'la foto real' : 'las palabras'})` : ''}` : '🔵 Buscando empaque…';
  $('audit-dot').className = 'dot ' + (e ? 'ok' : 'warn');
  const sig = state.mindar?.controller?.getColorSignature?.();
  const names = state.project.flavors.slice().sort((x, y) => x.targetIndex - y.targetIndex).map(f => f.short);
  $('m-color').textContent = sig ? (sig.dominant >= 0 ? names[sig.dominant] : (sig.total < 6 ? 'sin empaque' : 'ambiguo')) : '–';
  const ctl = state.mindar?.controller;
  const lm = ctl?.__lastMatch;
  if ($('m-points')) {
    $('m-points').textContent = lm && performance.now() - lm.t < 3000 && lm.candidates.length
      ? lm.candidates.map(c => { const k = (state.targetsLayout || [])[Math.floor(c.targetIndex / names.length)] || 'bolsa';
        return `${names[c.targetIndex % names.length] || c.targetIndex}${k !== 'bolsa' ? ` (${k})` : ''} ${c.inliers}`; }).join(' · ') +
        (lm.decidedBy === 'logo' ? ' → deciden las palabras' : '') : 'ninguno';
    const en = ctl?.__enhance;
    const ps = ctl?.__pipasStats;
    $('m-enh').textContent = (en ? (en.filter === 'none' ? 'normal' : 'ajustada') : '–') + (ctl?.__rescues ? ` · rescates ${ctl.__rescues}` : '') +
      (ps ? ` · hallado por: recorte ${ps.moving} / cuadro completo ${ps.full} / anti-brillo ${ps.norm}` : '');
  }
}

function syncAuditControls() {
  const p = state.stab; if (!p) return;
  $('s-mincf').value = p.minCF; $('v-mincf').textContent = (+p.minCF).toFixed(5);
  $('s-beta').value = p.beta; $('v-beta').textContent = Math.round(p.beta);
  $('s-grace').value = p.graceMs; $('v-grace').textContent = Math.round(p.graceMs) + ' ms';
  document.querySelectorAll('#audit-presets button').forEach(b => {
    const pr = STABILITY_PRESETS[b.dataset.preset];
    b.classList.toggle('active', pr && pr.minCF === p.minCF && pr.beta === p.beta && pr.graceMs === p.graceMs);
  });
}

function setupAudit() {
  const box = $('audit-presets');
  Object.entries(STABILITY_PRESETS).filter(([k]) => k !== 'custom').forEach(([k, v]) => {
    const b = document.createElement('button');
    b.textContent = v.label.split(' (')[0];
    b.dataset.preset = k;
    b.addEventListener('click', () => { applyStability(v); auditLog(`✅ Preset: ${v.label}`); });
    box.appendChild(b);
  });
  const live = () => applyStability({ minCF: +$('s-mincf').value, beta: +$('s-beta').value, graceMs: +$('s-grace').value });
  ['s-mincf', 's-beta', 's-grace'].forEach(id => $(id).addEventListener('input', live));
  $('btn-audit').addEventListener('click', () => { $('audit').classList.toggle('hidden'); updateAuditUi(); syncAuditControls(); });
  $('audit-close').addEventListener('click', () => $('audit').classList.add('hidden'));
  $('audit-fix').addEventListener('click', autoFix);
}

function auditLog(text) { $('audit-log').textContent = text; }

function autoFix() {
  const a = state.audit;
  const lines = [];
  window.dispatchEvent(new Event('resize')); // re-sincroniza cámara y proyección
  lines.push('📐 Proyección sincronizada con la cámara.');
  const c = state.mindar?.controller;
  if (c && c.trackingStates) {
    c.trackingStates.forEach(st => { if (st.filter) st.filter.reset(); });
    lines.push('🎯 Filtros de rastreo reiniciados.');
  }
  let preset;
  if (a.glare > 7) { preset = STABILITY_PRESETS.suave; lines.push(`☀️ Reflejos altos (${a.glare}%): más estabilidad y persistencia.`); }
  else if (a.sharp && a.sharp < 80) { preset = STABILITY_PRESETS.suave; lines.push('🌫️ Imagen borrosa: filtro anti-temblor alto.'); }
  else if (a.fps && a.fps < 18) { preset = STABILITY_PRESETS.rapido; lines.push(`🐢 FPS bajos (${a.fps}): menos retraso.`); }
  else { preset = STABILITY_PRESETS.normal; lines.push('⚖️ Condiciones buenas: balance normal.'); }
  applyStability(preset);
  if (a.luma < 55) lines.push('💡 Consejo: busca más luz.');
  auditLog(`⚡ Auto-Fix aplicado\n${lines.join('\n')}`);
  chime();
}

/* --- consejos en pantalla */
function evaluateAdvice() {
  if (activeEntry() || (state.sim && state.sim.active)) { hideAdvice(); return; }
  if (performance.now() - state.adviceDismissed < 20000) return;
  const a = state.audit;
  let msg = '';
  if (a.glare > 8) msg = '✨ Hay reflejos sobre el empaque. Inclínalo un poco o aléjalo de la luz directa.';
  else if (a.luma && a.luma < 50) msg = '💡 Hay poca luz. Busca un lugar más iluminado.';
  else if (a.sharp && a.sharp < 40) msg = '🌫️ La imagen está borrosa. Mantén el celular quieto un momento.';
  else if (state.scanSince && performance.now() - state.scanSince > 8000) msg = '🔎 ¿No lo reconoce? Pon el empaque de frente con buena luz, acércate hasta que llene el marco y evita reflejos.';
  if (msg) { $('advice-text').textContent = msg; $('advice').classList.remove('hidden'); }
  else hideAdvice();
}
function hideAdvice() { $('advice').classList.add('hidden'); }

/* ================================================================ Simulador 3D */
function ensureSim() {
  if (state.sim) return state.sim;
  const host = $('sim-view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  camera.position.set(0, 0, 3.2);
  const lights = addDefaultLights(scene);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 1.2; controls.maxDistance = 6;
  const pivot = new THREE.Group();
  scene.add(pivot);
  const sim = { renderer, scene, camera, controls, lights, pivot, active: false, entry: null, flavorId: null, clock: new THREE.Clock() };

  const resize = () => {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  sim.resize = resize;

  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    handleTap(sim.entry, camera, new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1));
  });

  const chips = $('sim-flavors');
  state.project.flavors.forEach(f => {
    const b = document.createElement('button');
    b.textContent = `${f.emoji} ${f.short}`;
    b.dataset.id = f.id;
    b.style.setProperty('--c', f.color);
    b.addEventListener('click', () => simShowFlavor(f.id));
    chips.appendChild(b);
  });

  renderer.setAnimationLoop(() => {
    if (!sim.active) return;
    const dt = Math.min(sim.clock.getDelta(), 0.1);
    controls.update();
    if (sim.entry) updateEntry(sim.entry, dt, sim.clock.elapsedTime, camera);
    renderer.render(scene, camera);
  });
  state.sim = sim;
  return sim;
}

function simShowFlavor(id) {
  const sim = state.sim;
  const flavor = state.project.flavors.find(f => f.id === id) || state.project.flavors[0];
  if (sim.entry) {
    // libera TODO lo del sabor anterior (carátula, contenido, ¡HOLA!, partículas): antes quedaban texturas en memoria
    sim.pivot.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); });
    });
    sim.pivot.clear();
    sim.entry.views.forEach(v => { v.tickers = []; });
    sim.entry.hola.tickers = [];
  }
  const aspect = flavor.aspect || 0.65;
  const pack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  new THREE.TextureLoader().load(flavor.imageUrl, (t) => { t.encoding = THREE.sRGBEncoding; pack.material.map = t; pack.material.needsUpdate = true; });
  pack.renderOrder = -1;
  sim.pivot.add(pack);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect), new THREE.MeshStandardMaterial({ color: flavor.color, side: THREE.BackSide }));
  back.position.z = -0.002;
  sim.pivot.add(back);
  sim.entry = buildEntryContent(flavor, sim.pivot);
  sim.flavorId = flavor.id;
  applyFlavorLights(sim.lights, flavor.lights);
  document.documentElement.style.setProperty('--flavor', flavor.color);
  document.querySelectorAll('#sim-flavors button').forEach(b => b.classList.toggle('active', b.dataset.id === flavor.id));
  sim.camera.position.set(0.35, 0.1, 2.2 / aspect * 0.75 + 1);
  sim.controls.target.set(0, 0, 0);
  renderHud();
}

function openSim(flavorId) {
  const sim = ensureSim();
  sim.active = true;
  $('sim').classList.remove('hidden');
  $('loader').classList.add('hidden');
  $('error').classList.add('hidden');
  $('scan').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('side-tools').classList.remove('hidden');
  $('btn-sim').classList.add('hidden');
  $('btn-audit').classList.add('hidden');
  $('audit').classList.add('hidden');
  hideAdvice();
  sim.resize();
  simShowFlavor(flavorId || sim.flavorId || (activeEntry() && activeEntry().flavor.id) || state.project.flavors[0].id);
}

function closeSim() {
  const sim = state.sim;
  if (!sim) return;
  sim.active = false;
  $('sim').classList.add('hidden');
  $('btn-sim').classList.toggle('hidden', !state.project.settings.simulator);
  $('btn-audit').classList.toggle('hidden', !state.project.settings.auditPanel);
  if (state.arStarted) {
    if (!activeEntry()) $('scan').classList.remove('hidden');
    renderHud();
  } else {
    startCameraFlow();
  }
}

/* ================================================================ inicio */
// Navegadores dentro de otras apps (Instagram, Facebook, TikTok…): muchas veces no dan acceso a la cámara
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|WhatsApp|TikTok|musical_ly|Bytedance|Snapchat|\bLine\//i.test(navigator.userAgent || '');
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const OPEN_IN_BROWSER = IS_IOS
  ? 'Toca los tres puntos (⋯) o el ícono de compartir y elige "Abrir en Safari".'
  : 'Toca los tres puntos (⋮) arriba a la derecha y elige "Abrir en Chrome" o "Abrir en el navegador".';

function cameraErrorMessage(err) {
  const name = err && (err.name || '');
  const inApp = IN_APP ? ' Estás dentro de otra app: ' + OPEN_IN_BROWSER : '';
  if (name === 'AssetError') return err.message;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return (IN_APP ? 'Esta app no permite usar la cámara.' : 'Diste o tienes bloqueado el permiso de cámara. Actívalo en la configuración del navegador para este sitio y toca Reintentar.') + inApp;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No se encontró una cámara en este dispositivo.' + inApp;
  if (name === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación. Ciérrala y toca Reintentar.';
  return 'No se pudo iniciar la cámara (' + (err && err.message ? err.message : (err || 'error desconocido')) + '). Toca Reintentar.' + inApp;
}

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

async function startCameraFlow() {
  if (location.protocol === 'file:') {
    showError('Abre la app desde un servidor (iniciar_servidor.bat o tu hosting HTTPS). Con doble clic el navegador no permite la cámara.');
    return;
  }
  if (!window.isSecureContext) {
    showError('La cámara solo funciona con HTTPS (o en localhost). Publica la app en un hosting con HTTPS, como Cloudflare.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !hasWebGL() || typeof Worker !== 'function') {
    showError(IN_APP ? 'Este navegador dentro de la app no es compatible con la realidad aumentada. ' + OPEN_IN_BROWSER
      : 'Este navegador no es compatible con la realidad aumentada. Abre el enlace en Chrome (Android) o Safari (iPhone) actualizados.');
    return;
  }
  $('error').classList.add('hidden');
  $('loader').classList.remove('hidden');
  try {
    await startAR();
  } catch (err) {
    console.error(err);
    showError(cameraErrorMessage(err));
  }
}

function bindUi() {
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).classList.add('hidden')));
  $('finale-btn').addEventListener('click', () => {
    const url = state.project?.ui.finale.buttonUrl;
    if (url && /^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener');
    $('finale').classList.add('hidden');
  });
  $('error-retry').addEventListener('click', () => location.reload());
  $('error-sim').addEventListener('click', () => openSim());
  $('btn-sound').addEventListener('click', () => { setSound(!state.sound); if (state.sound) click(); });
  $('btn-help').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('btn-sim').addEventListener('click', () => openSim());
  $('sim-close').addEventListener('click', closeSim);
  $('btn-hola').addEventListener('click', () => toggleHola());
  $('advice-close').addEventListener('click', () => { state.adviceDismissed = performance.now(); hideAdvice(); });
  document.addEventListener('pointerdown', () => {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
  }, { once: true });
  setupAudit();
  bindLifecycle();
}

/* Segundo plano: al salir se silencia el audio; al volver se reanuda la cámara (iOS la pausa) o, si el sistema la
   apagó, se avisa con "Reintentar" en vez de quedar la imagen congelada. */
function bindLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { audioCtx && audioCtx.suspend(); } catch (e) {} return; }
    try { audioCtx && audioCtx.resume(); } catch (e) {}
    const v = state.mindar && state.mindar.video;
    if (!v || !state.arStarted) return;
    const tracks = (v.srcObject && v.srcObject.getVideoTracks) ? v.srcObject.getVideoTracks() : [];
    if (!tracks.length || tracks.every(t => t.readyState === 'ended')) {
      showError('La cámara se detuvo mientras la app estaba en segundo plano. Toca "Reintentar" para seguir escaneando.');
      return;
    }
    if (v.paused) { const p = v.play(); p && p.catch && p.catch(() => {}); }
    state.scanSince = performance.now();
  });
  // Safari puede devolver la página desde su caché con la cámara apagada: se recarga limpia
  window.addEventListener('pageshow', (e) => { if (e.persisted && state.arStarted) location.reload(); });
}

async function main() {
  bindUi();
  // diagnóstico en vivo para pruebas en el celular (serve.js --publico + túnel): index.html?envivo=1
  if (/[?&]envivo=1\b/.test(location.search)) import('./envivo.js').then(m => m.startLive(state)).catch(() => {});
  if (IN_APP) { $('inapp-note').textContent = '⚠️ Para que funcione mejor la cámara, abre este enlace en tu navegador. ' + OPEN_IN_BROWSER; $('inapp-note').classList.remove('hidden'); }
  if (location.protocol !== 'file:' && !/^(3d|sim|simulador)$/i.test(params.get('modo') || '')) prefetchTargets();
  progress(10, 'Cargando proyecto…');
  state.project = await loadPublishedProject();
  applyUi(state.project);
  let soundPref = null;
  try { soundPref = localStorage.getItem('pipas_sound'); } catch (e) {}
  setSound(soundPref === null ? state.project.settings.sound !== false : soundPref === '1');
  progress(25, 'Cargando fuentes…');
  await loadFonts(state.project.ui.fonts);

  const wantSim = /^(3d|sim|simulador)$/i.test(params.get('modo') || '');
  if (wantSim && state.project.settings.simulator !== false) {
    $('loader').classList.add('hidden');
    $('sim-close').classList.toggle('hidden', params.get('camara') === 'no');
    openSim(params.get('sabor'));
    return;
  }
  await startCameraFlow();
}

main().catch(e => { console.error(e); showError('Error al iniciar: ' + e.message); });
