/**
 * Pipas Mega RA — giroscopio del celular.
 *
 * MindAR solo calcula la pose de la bolsa unas pocas veces por segundo y la pierde cuando el cuadro sale borroso
 * por el movimiento. El giroscopio, en cambio, mide el GIRO del celular ~60 veces por segundo y no le afecta el
 * desenfoque. Aquí se integra ese giro en una orientación de la cámara Q(t) y se guarda un historial corto, para
 * poder responder: "¿cuánto giró la cámara entre el instante A y el instante B?".
 *
 * Con eso:
 *   - el contenido se corrige entre una pose de MindAR y la siguiente (se mueve fluido al girar el celular),
 *   - mientras los cuadros salen borrosos el contenido se queda pegado a la bolsa en vez de quedarse quieto
 *     en la pantalla,
 *   - el rastreo de MindAR recibe la pose ya girada y encuentra la bolsa aunque el celular haya girado rápido.
 * El giroscopio no mide desplazamientos (mover el celular de lado sin girarlo); eso lo sigue haciendo MindAR.
 *
 * Ejes: con el celular vertical, los ejes del dispositivo (x derecha, y arriba, z hacia la persona) coinciden con
 * los de la cámara de three.js, así que el giro se usa directo; en horizontal se rota según la orientación de pantalla.
 */
import * as THREE from 'three';

const HIST = 240;                       // ~4 s de muestras a 60 Hz
const hist = [];                        // { t, q } orientación acumulada de la cámara
const Q = new THREE.Quaternion();
const _w = new THREE.Vector3(), _dq = new THREE.Quaternion();
let lastT = 0, samples = 0, started = false;
export const gyroState = { ok: false, rate: 0 };   // rate = velocidad de giro actual (grados/s)

function screenAngle() {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle
    : (typeof window.orientation === 'number' ? window.orientation : 0);
  return (a || 0) * Math.PI / 180;
}

function onMotion(ev) {
  const r = ev.rotationRate;
  if (!r || (r.alpha == null && r.beta == null && r.gamma == null)) return;
  const t = performance.now();
  if (!lastT) { lastT = t; hist.push({ t, q: Q.clone() }); return; }
  let dt = (t - lastT) / 1000; lastT = t;
  if (!(dt > 0) || dt > 0.25) dt = Math.min(0.25, Math.max(0, ev.interval ? ev.interval / (ev.interval > 1 ? 1000 : 1) : 0.016));
  const d2r = Math.PI / 180;
  // rotationRate: beta = eje x, gamma = eje y, alpha = eje z del dispositivo (grados/s)
  let wx = (r.beta || 0) * d2r, wy = (r.gamma || 0) * d2r;
  const wz = (r.alpha || 0) * d2r;
  const a = screenAngle();
  if (a) { const c = Math.cos(a), s = Math.sin(a); const x = wx * c - wy * s, y = wx * s + wy * c; wx = x; wy = y; }
  _w.set(wx, wy, wz);
  const ang = _w.length();
  gyroState.rate = ang / d2r;
  if (ang > 1e-6) {
    _dq.setFromAxisAngle(_w.multiplyScalar(1 / ang), ang * dt);
    Q.multiply(_dq).normalize();         // giro medido en los ejes de la cámara
  }
  hist.push({ t, q: Q.clone() });
  if (hist.length > HIST) hist.splice(0, hist.length - HIST);
  if (++samples > 10) gyroState.ok = true;
}

function orientationAt(t, out) {
  if (!hist.length) return out.identity();
  if (t < hist[0].t - 50) return null;   // más viejo que el historial: no se sabe cuánto giró
  if (t >= hist[hist.length - 1].t) return out.copy(hist[hist.length - 1].q);
  if (t <= hist[0].t) return out.copy(hist[0].q);
  let lo = 0, hi = hist.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (hist[m].t <= t) lo = m; else hi = m; }
  const A = hist[lo], B = hist[hi], k = (t - A.t) / Math.max(1e-3, B.t - A.t);
  return out.copy(A.q).slerp(B.q, k);
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
/**
 * Giro que hay que aplicar a algo fijo frente a la cámara visto en el instante `t0` para verlo en `t1`
 * (en ejes de la cámara de three.js). Devuelve null si no hay giroscopio.
 */
export function cameraDelta(t0, t1, out = new THREE.Quaternion()) {
  if (!gyroState.ok || !(t0 > 0)) return null;
  if (!orientationAt(t0, _qa) || !orientationAt(t1, _qb)) return null;
  // punto fijo en el mundo: p(t) = Q(t)^-1 · p_mundo  →  p(t1) = Q(t1)^-1 · Q(t0) · p(t0)
  return out.copy(_qb).invert().multiply(_qa);
}

/** Igual que cameraDelta pero como matriz 3×3 en ejes de MindAR (x derecha, y abajo, z hacia adelante). */
const _m = new THREE.Matrix4(), _dqq = new THREE.Quaternion();
export function cameraDeltaCV(t0, t1) {
  const q = cameraDelta(t0, t1, _dqq);
  if (!q) return null;
  _m.makeRotationFromQuaternion(q);
  const e = _m.elements; // columna mayor
  const R = [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]];
  // F·R·F con F = diag(1,-1,-1)
  return [[R[0][0], -R[0][1], -R[0][2]], [-R[1][0], R[1][1], R[1][2]], [-R[2][0], R[2][1], R[2][2]]];
}

export function startGyro() {
  if (started) return; started = true;
  // Se escucha siempre (Android y la mayoría de navegadores lo dan sin preguntar)
  window.addEventListener('devicemotion', onMotion, { passive: true });
  const DM = window.DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') {
    // iPhone: el permiso solo se puede pedir tras un toque de la persona; si ya llegan datos no se pide nada
    const ask = () => {
      window.removeEventListener('touchend', ask); window.removeEventListener('click', ask);
      if (!gyroState.ok) DM.requestPermission().catch(() => {});
    };
    window.addEventListener('touchend', ask); window.addEventListener('click', ask);
  }
  window.__pipasGyro = { state: gyroState, cameraDelta, cameraDeltaCV };
}
