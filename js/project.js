/**
 * Pipas Mega RA — formato de proyecto (compartido por la app, el editor y la exportación)
 *
 * Sistema de coordenadas (igual en editor y en RA):
 *   - El empaque mide 1 unidad de ancho, centrado en el origen. Alto = 1 / aspecto de la imagen.
 *   - X a la derecha, Y hacia arriba, Z sale del empaque hacia la cámara.
 *   - Rotación en grados.
 */

export const SCHEMA_VERSION = 6;

// Orden de targets.mind: 0 = Pica Limón, 1 = Acid, 2 = Maraculimón, 3 = Verde
// Luego vienen grupos de 4 (uno por sabor, mismo orden), descritos en settings.targetsLayout:
//   'bolsa' = carátula de diseño · 'palabras' = recuadro "MEGA + sabor" (logoZone) · 'foto' = foto REAL de la bolsa
//   impresa, alineada a la carátula (realPhotos). Ej.: ['bolsa','palabras','foto'] → 12 marcadores.
export const FLAVOR_DEFAULTS = [
  { id: 'pica_limon', targetIndex: 0, name: 'Pipas Mega Pica Limón', short: 'Pica Limón', emoji: '🌶️',
    imageUrl: 'targets/target_pica_limon.png', realPhotos: ['targets/real_pica_limon.jpg'], logoZone: { x0: 0.17, x1: 0.9, y0: 0.25, y1: 0.47 }, aspect: 650 / 1024, color: '#ef4444', accent: '#22c55e',
    particles: { enabled: true, type: 'fire', color: '#f97316', color2: '#facc15' } },
  { id: 'acid', targetIndex: 1, name: 'Pipas Mega Acid', short: 'Mega Acid', emoji: '🍋',
    imageUrl: 'targets/target_acid.png', realPhotos: ['targets/real_acid.jpg'], logoZone: { x0: 0.28, x1: 0.86, y0: 0.23, y1: 0.48 }, aspect: 650 / 1024, color: '#84cc16', accent: '#c084fc',
    particles: { enabled: true, type: 'sparkles', color: '#a3e635', color2: '#c084fc' } },
  { id: 'maraculimon', targetIndex: 2, name: 'Pipas Mega Maraculimón', short: 'Maraculimón', emoji: '🍈',
    imageUrl: 'targets/target_maraculimon.png', realPhotos: ['targets/real_maraculimon.jpg'], logoZone: { x0: 0.16, x1: 0.89, y0: 0.25, y1: 0.42 }, aspect: 650 / 1024, color: '#facc15', accent: '#16a34a',
    particles: { enabled: true, type: 'sparkles', color: '#facc15', color2: '#a855f7' } },
  { id: 'verde', targetIndex: 3, name: 'Pipas Mega Verde', short: 'Mega Verde', emoji: '🍃',
    imageUrl: 'targets/target_verde.png', realPhotos: [], logoZone: { x0: 0.34, x1: 0.97, y0: 0.23, y1: 0.47 }, aspect: 650 / 1024, color: '#16a34a', accent: '#84cc16',
    particles: { enabled: true, type: 'leaves', color: '#22c55e', color2: '#bef264' } }
];

export const ELEMENT_TYPES = {
  text: 'Texto',
  image: 'Imagen / GIF',
  model: 'Modelo 3D',
  button: 'Botón 3D',
  hotspot: 'Punto interactivo'
};

// Modelos incluidos (no necesitan archivos). 'character' usa assets/personaje_saludando.glb.
export const BUILTIN_MODELS = {
  lime: 'Limón',
  chili: 'Ají en llamas',
  passion: 'Maracuyá',
  seed: 'Semilla de girasol',
  golden_seed: 'Semilla dorada',
  character: 'Personaje saludando',
  hola: 'Letrero ¡HOLA!',
  trophy: 'Trofeo',
  gem: 'Gema de premio',
  crown: 'Corona',
  rocket: 'Cohete',
  bullseye: 'Diana',
  frame: 'Marco de foto',
  box: 'Primitiva: Cubo',
  sphere: 'Primitiva: Esfera',
  cylinder: 'Primitiva: Cilindro',
  cone: 'Primitiva: Cono',
  torus: 'Primitiva: Dona',
  plane: 'Primitiva: Plano'
};
export const CHARACTER_URL = 'assets/personaje_saludando.glb';

export const MATERIAL_PRESETS = {
  mate: { label: 'Mate', roughness: 0.9, metalness: 0 },
  plastico: { label: 'Plástico', roughness: 0.45, metalness: 0.05 },
  brillante: { label: 'Brillante', roughness: 0.15, metalness: 0.1 },
  metal: { label: 'Metal', roughness: 0.25, metalness: 0.9 },
  oro: { label: 'Oro', roughness: 0.2, metalness: 1, color: '#f5b301' },
  vidrio: { label: 'Vidrio', roughness: 0.05, metalness: 0, opacity: 0.45 },
  neon: { label: 'Neón', roughness: 0.3, metalness: 0, emissive: 0.9 }
};

export const PARTICLE_TYPES = {
  sparkles: 'Destellos',
  fire: 'Fuego / brasas',
  leaves: 'Hojas',
  bubbles: 'Burbujas',
  confetti: 'Confeti',
  stars: 'Estrellas'
};

export const ACTION_TYPES = {
  none: 'Nada',
  popup: 'Mostrar ventana',
  url: 'Abrir enlace',
  toggle_element: 'Mostrar / ocultar un elemento',
  toggle_hola: 'Mostrar / ocultar ¡HOLA!',
  sound: 'Reproducir sonido'
};

export const HUD_POSITIONS = {
  'top-left': 'Arriba izquierda', 'top-center': 'Arriba centro', 'top-right': 'Arriba derecha',
  'bottom-left': 'Abajo izquierda', 'bottom-center': 'Abajo centro', 'bottom-right': 'Abajo derecha'
};

export const STABILITY_PRESETS = {
  suave: { label: 'Bolsa flexible (menos temblor)', minCF: 0.0001, beta: 100, graceMs: 400 },
  normal: { label: 'Normal', minCF: 0.0005, beta: 500, graceMs: 250 },
  rapido: { label: 'Movimiento rápido (menos retraso)', minCF: 0.001, beta: 1500, graceMs: 150 },
  rigido: { label: 'Plano rígido (cajas, impresos)', minCF: 0.0003, beta: 800, graceMs: 250 },
  custom: { label: 'Personalizado', minCF: 0.0005, beta: 500, graceMs: 250 }
};

let idCounter = 0;
export function newId(prefix = 'el') {
  idCounter++;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function defaultAction() {
  return { type: 'none', title: '', text: '', url: '', target: '' };
}

export function defaultElement(type, overrides = {}) {
  const base = {
    id: newId(type),
    type,
    name: ELEMENT_TYPES[type] || type,
    visible: true,
    group: '',
    position: { x: 0, y: 0, z: 0.05 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    opacity: 1,
    billboard: false,
    anim: { spin: 0, float: 0, pulse: false },
    action: defaultAction()
  };
  const byType = {
    text: { text: {
      content: 'Nuevo texto', color: '#ffffff', gradient: false, color2: '#38bdf8', angle: 90,
      stroke: '#020617', strokeWidth: 8, font: 'PipasDisplay', width: 0.7, height: 0.14,
      background: '', depth: 0
    } },
    image: { image: { url: 'assets/sample.gif', width: 0.5, speed: 1 } },
    model: {
      model: { kind: 'lime', url: '', color: '', texture: '' },
      material: { preset: '', roughness: null, metalness: null, emissive: 0 },
      anim: { spin: 45, float: 0, pulse: false }
    },
    button: { button: { label: 'Ver más', icon: '', color: '#84cc16', textColor: '#020617', width: 0.6, height: 0.16, shape: 'pill', depth: 0.02 },
      action: { ...defaultAction(), type: 'url', url: 'https://' } },
    hotspot: { hotspot: { color: '#a5f3fc', size: 0.08 }, anim: { spin: 0, float: 0, pulse: true },
      action: { ...defaultAction(), type: 'popup', title: 'Información', text: 'Escribe aquí el mensaje.' } }
  };
  return deepMerge(deepMerge(base, byType[type] || {}), overrides);
}

export function defaultHudButton(color = '#84cc16') {
  return {
    id: newId('hud'),
    label: 'Nuevo botón',
    icon: '✨',
    color,
    textColor: '#020617',
    shape: 'pill',
    size: 'md',
    position: 'bottom-center',
    show: 'tracking', // 'tracking' = solo con el empaque detectado, 'always' = siempre
    action: { ...defaultAction(), type: 'popup', title: 'Pipas Mega', text: 'Texto configurado para este botón.' }
  };
}

export function defaultProject() {
  return {
    schema: SCHEMA_VERSION,
    name: 'Pipas Mega RA',
    updatedAt: new Date().toISOString(),
    settings: {
      stability: 'normal',
      custom: { minCF: 0.0005, beta: 500, graceMs: 250 },
      medalStableMs: 600,
      colorCheck: true,
      autoContrast: true,
      logoTargets: true,
      auditPanel: true,
      sound: true,
      simulator: true
    },
    ui: {
      loading: {
        title: 'PIPAS MEGA', subtitle: 'Experiencia de Realidad Aumentada', statusText: 'Inicializando cámara y motor 3D…',
        bgColor: '#090d16', cardColor: '#121a2d', titleColor: '#84cc16', accent: '#84cc16', accent2: '#22d3ee', logoUrl: ''
      },
      finale: {
        enabled: true,
        imageUrl: 'assets/medalla_premio_final.svg',
        title: '¡COLECCIÓN MEGA COMPLETADA!',
        subtitle: '¡Escaneaste los 4 empaques Pipas Mega y desbloqueaste las 4 medallas!',
        buttonText: '🎉 ¡Seguir explorando!',
        buttonUrl: ''
      },
      hola: { text: '¡HOLA!', color: '#facc15', textColor: '#020617', showButton: true },
      help: 'Apunta la cámara a cualquiera de los 4 empaques Pipas Mega. Toca los objetos 3D para ver información. Escanea los 4 para ganar el premio.',
      fonts: [{ family: 'PipasDisplay', url: 'assets/pipas_display.ttf' }]
    },
    flavors: FLAVOR_DEFAULTS.map(f => ({
      id: f.id, targetIndex: f.targetIndex, name: f.name, short: f.short, emoji: f.emoji,
      imageUrl: f.imageUrl, aspect: f.aspect, logoZone: clone(f.logoZone), realPhotos: clone(f.realPhotos || []), color: f.color, accent: f.accent,
      hint: `Apunta la cámara a tu empaque de ${f.name}`,
      lights: { ambientColor: '#ffffff', ambient: 0.75, directional: 0.9 },
      particles: clone(f.particles),
      hudButtons: [],
      elements: []
    }))
  };
}

/** Normaliza cualquier proyecto (nuevo o antiguo) al esquema actual. */
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return defaultProject();
  if (Array.isArray(raw.flavors) && (raw.schema === 5 || raw.schema === SCHEMA_VERSION)) {
    const base = defaultProject();
    const p = deepMerge(base, { ...raw, flavors: undefined, schema: SCHEMA_VERSION });
    if (Array.isArray(raw.ui?.fonts)) p.ui.fonts = clone(raw.ui.fonts);
    p.flavors = base.flavors.map(bf => {
      const rf = raw.flavors.find(f => f.id === bf.id) || {};
      const merged = deepMerge(bf, { ...rf, elements: undefined, hudButtons: undefined });
      merged.targetIndex = bf.targetIndex; // el orden de targets.mind no es editable
      merged.elements = (Array.isArray(rf.elements) ? rf.elements : []).filter(isObj)
        .map(e => sanitizeElement(deepMerge(defaultElement(ELEMENT_TYPES[e.type] ? e.type : 'text'), e)));
      merged.hudButtons = (Array.isArray(rf.hudButtons) ? rf.hudButtons : []).filter(isObj).map(b => deepMerge(defaultHudButton(), b));
      if (!(merged.aspect > 0.1 && merged.aspect < 10)) merged.aspect = bf.aspect;
      return merged;
    });
    if (!Array.isArray(p.ui.fonts)) p.ui.fonts = [];
    return p;
  }
  if (Array.isArray(raw.scenes)) return migrateLegacyProject(raw);
  return defaultProject();
}

/* ------------------------------------------------------------------ validación */
const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : def));
const clampNum = (v, def, lo, hi) => Math.max(lo, Math.min(hi, num(v, def)));

/** Corrige valores que romperían la escena (números no válidos, escala 0, opacidad fuera de rango). */
function sanitizeElement(e) {
  for (const k of ['position', 'rotation']) {
    if (!isObj(e[k])) e[k] = { x: 0, y: 0, z: 0 };
    for (const ax of ['x', 'y', 'z']) e[k][ax] = num(e[k][ax], 0);
  }
  if (!isObj(e.scale)) e.scale = { x: 1, y: 1, z: 1 };
  for (const ax of ['x', 'y', 'z']) { const s = num(e.scale[ax], 1); e.scale[ax] = Math.abs(s) < 1e-4 ? 1e-4 : s; }
  e.opacity = clampNum(e.opacity, 1, 0, 1);
  if (!isObj(e.anim)) e.anim = { spin: 0, float: 0, pulse: false };
  e.anim.spin = num(e.anim.spin, 0); e.anim.float = num(e.anim.float, 0);
  if (!isObj(e.action)) e.action = defaultAction();
  return e;
}

const MAX_ASSET_BYTES = 24 * 1024 * 1024;   // Cloudflare Pages: máx. 25 MiB por archivo
const isAllowedUrl = (u) => typeof u === 'string' && (isLocalPath(u) || /^(https:|data:)/i.test(u));

/**
 * Revisa lo que el editor va a guardar. errors = rompería la app (no se guarda); warnings = conviene revisarlo.
 * Si se pasa `assetInfo(path)` (async → { ok, size }), también comprueba que existan los archivos locales y su peso.
 */
export async function validateProject(p, assetInfo = null) {
  const errors = [], warnings = [];
  if (!p || !Array.isArray(p.flavors) || p.flavors.length !== FLAVOR_DEFAULTS.length) {
    errors.push(`El proyecto debe tener ${FLAVOR_DEFAULTS.length} sabores.`);
    return { errors, warnings };
  }
  const S = p.settings || {};
  if (S.stability === 'custom') {
    const c = S.custom || {};
    if (!(num(c.minCF, NaN) > 0 && c.minCF <= 0.1)) errors.push('Estabilidad personalizada: minCF debe estar entre 0.00001 y 0.1.');
    if (!(num(c.beta, NaN) >= 0 && c.beta <= 10000)) errors.push('Estabilidad personalizada: beta debe estar entre 0 y 10000.');
    if (!(num(c.graceMs, NaN) >= 40 && c.graceMs <= 5000)) errors.push('Estabilidad personalizada: gracia debe estar entre 40 y 5000 ms.');
  }
  if (S.medalStableMs != null && !(num(S.medalStableMs, NaN) >= 0 && S.medalStableMs <= 20000)) errors.push('Tiempo de medalla: debe estar entre 0 y 20000 ms.');
  const urls = [];
  const checkUrl = (u, where, required = false) => {
    if (!u) { if (required) errors.push(`${where}: falta el archivo.`); return; }
    if (!isAllowedUrl(u)) { errors.push(`${where}: el enlace debe ser https:// o un archivo del proyecto (${String(u).slice(0, 60)}).`); return; }
    if (isLocalPath(u)) urls.push({ u: u.split('?')[0].split('#')[0].replace(/^\.\//, ''), where });
  };
  const checkAction = (a, where, ids) => {
    if (!a || a.type === 'none' || !a.type) return;
    if (!ACTION_TYPES[a.type]) errors.push(`${where}: acción desconocida "${a.type}".`);
    if (a.type === 'url' && !/^https:\/\/[^\s/]+\.[^\s]+/i.test(a.url || '')) errors.push(`${where}: el enlace de la acción debe empezar con https:// y ser una dirección completa.`);
    if (a.type === 'toggle_element' && ids && !ids.has(a.target)) warnings.push(`${where}: la acción muestra/oculta un elemento que ya no existe.`);
  };
  for (const f of p.flavors) {
    const F = f.short || f.name || f.id;
    checkUrl(f.imageUrl, `${F} · carátula`);
    const ids = new Set();
    for (const e of f.elements || []) {
      const W = `${F} · ${e.name || e.type}`;
      if (!ELEMENT_TYPES[e.type]) { errors.push(`${W}: tipo de elemento desconocido "${e.type}".`); continue; }
      if (ids.has(e.id)) errors.push(`${W}: identificador repetido (${e.id}).`);
      ids.add(e.id);
      for (const k of ['position', 'rotation', 'scale']) for (const ax of ['x', 'y', 'z']) {
        const v = e[k] && e[k][ax];
        if (typeof v !== 'number' || !isFinite(v)) errors.push(`${W}: ${k}.${ax} no es un número.`);
        else if (k === 'position' && Math.abs(v) > 20) warnings.push(`${W}: está muy lejos del empaque (${k}.${ax} = ${v}).`);
        else if (k === 'scale' && (Math.abs(v) < 1e-3 || Math.abs(v) > 50)) errors.push(`${W}: escala ${ax} fuera de rango (0.001 a 50).`);
      }
      if (e.type === 'image') {
        checkUrl(e.image && e.image.url, `${W} · imagen`, true);
        if (!(num(e.image && e.image.width, NaN) > 0)) errors.push(`${W}: el ancho de la imagen debe ser mayor que 0.`);
      }
      if (e.type === 'model') {
        if (e.model && e.model.url) checkUrl(e.model.url, `${W} · modelo`);
        else if (!BUILTIN_MODELS[e.model && e.model.kind]) errors.push(`${W}: modelo incluido desconocido "${e.model && e.model.kind}".`);
        if (e.model && e.model.texture) checkUrl(e.model.texture, `${W} · textura`);
      }
      if (e.type === 'text' && !String((e.text && e.text.content) || '').trim()) warnings.push(`${W}: el texto está vacío.`);
    }
    for (const e of f.elements || []) checkAction(e.action, `${F} · ${e.name || e.type}`, ids);
    for (const b of f.hudButtons || []) checkAction(b.action, `${F} · botón "${b.label || ''}"`, ids);
  }
  checkUrl(p.ui && p.ui.finale && p.ui.finale.imageUrl, 'Premio final · imagen');
  if (p.ui && p.ui.finale && p.ui.finale.buttonUrl && !/^https:\/\//i.test(p.ui.finale.buttonUrl)) errors.push('Premio final: el enlace del botón debe empezar con https://.');
  checkUrl(p.ui && p.ui.loading && p.ui.loading.logoUrl, 'Pantalla de carga · logo');
  ((p.ui && p.ui.fonts) || []).forEach(fn => checkUrl(fn && fn.url, `Fuente ${fn && fn.family}`, true));
  if (assetInfo) {
    const seen = new Set();
    await Promise.all(urls.filter(x => !seen.has(x.u) && seen.add(x.u)).map(async ({ u, where }) => {
      const info = await assetInfo(u).catch(() => null);
      if (!info || !info.ok) errors.push(`${where}: no se encuentra el archivo ${u}.`);
      else if (info.size > MAX_ASSET_BYTES) errors.push(`${where}: ${u} pesa ${(info.size / 1048576).toFixed(1)} MB (máximo 24 MB en Cloudflare).`);
      else if (info.size > 5 * 1048576) warnings.push(`${where}: ${u} pesa ${(info.size / 1048576).toFixed(1)} MB; tardará en cargar en datos móviles.`);
    }));
  }
  return { errors, warnings };
}

/* ------------------------------------------------------------------ migración v3 → v6 */
const LEGACY_PARTICLES = {
  acid_sparkles: { type: 'sparkles', color: '#a3e635', color2: '#c084fc' },
  spicy_flames: { type: 'fire', color: '#f97316', color2: '#facc15' },
  passion_sparkles: { type: 'sparkles', color: '#facc15', color2: '#a855f7' },
  green_sparkles: { type: 'leaves', color: '#22c55e', color2: '#bef264' }
};

function migrateLegacyAction(act) {
  if (!act) return defaultAction();
  switch (act.action) {
    case 'open_url': return { ...defaultAction(), type: 'url', url: act.url || '' };
    case 'show_popup': return { ...defaultAction(), type: 'popup', title: act.popupTitle || '', text: act.popupText || '' };
    case 'toggle_model': return { ...defaultAction(), type: 'toggle_element', target: act.targetId || act.target || '' };
    case 'toggle_hola': return { ...defaultAction(), type: 'toggle_hola' };
    default: return defaultAction();
  }
}

export function migrateLegacyProject(old) {
  const p = defaultProject();
  p.name = old.name || p.name;
  const ui = old.uiDesign || {};
  if (ui.loadingScreen) {
    const l = ui.loadingScreen;
    Object.assign(p.ui.loading, {
      title: l.title || p.ui.loading.title, subtitle: l.subtitle || p.ui.loading.subtitle,
      statusText: l.statusText || p.ui.loading.statusText, bgColor: l.bgColor || p.ui.loading.bgColor,
      cardColor: l.cardColor || p.ui.loading.cardColor, titleColor: l.titleColor || p.ui.loading.titleColor,
      accent: l.barColor1 || p.ui.loading.accent, accent2: l.barColor2 || p.ui.loading.accent2, logoUrl: l.logoUrl || ''
    });
  }
  if (ui.finalMedalsScreen) {
    const f = ui.finalMedalsScreen;
    Object.assign(p.ui.finale, {
      enabled: f.enabled !== false, imageUrl: f.imageUrl || p.ui.finale.imageUrl, title: f.title || p.ui.finale.title,
      subtitle: f.subtitle || p.ui.finale.subtitle, buttonText: f.buttonText || p.ui.finale.buttonText
    });
  }
  if (Array.isArray(ui.customFonts) && ui.customFonts.length) {
    p.ui.fonts = ui.customFonts.filter(f => f && f.url).map(f => ({ family: f.family || f.name, url: f.url }));
  }

  for (const flavor of p.flavors) {
    const t = (old.targets || []).find(x => x.id === flavor.id);
    if (t) {
      if (t.primaryColor) flavor.color = t.primaryColor;
      if (t.secondaryColor) flavor.accent = t.secondaryColor;
      if (t.scanInstruction) flavor.hint = t.scanInstruction;
    }
    const scene = old.scenes.find(s => s.flavorId === flavor.id);
    if (!scene) continue;
    flavor.lights = {
      ambientColor: scene.ambientLightColor || '#ffffff',
      ambient: round(Math.min(2, (scene.ambientLightIntensity ?? 1.2) * 0.6)),
      directional: round(Math.min(2, (scene.directionalLightIntensity ?? 1.5) * 0.6))
    };
    const lp = LEGACY_PARTICLES[scene.particlesType];
    flavor.particles = { ...flavor.particles, ...(lp || {}), enabled: scene.particlesEnabled !== false };
    flavor.hudButtons = (scene.hudButtons || []).map(b => deepMerge(defaultHudButton(), {
      id: b.id || newId('hud'), label: b.label || 'Botón', icon: b.icon || '', color: b.buttonColor || flavor.color,
      textColor: b.textColor || '#020617', shape: b.shape || 'pill', size: b.size || 'md', position: b.position || 'bottom-center',
      action: migrateLegacyAction((b.actions || [])[0])
    }));
    const k = 1 / (scene.targetImage?.widthMeters || 0.08);
    for (const e of scene.elements || []) {
      const el = migrateLegacyElement(e, k);
      if (el) flavor.elements.push(el);
    }
  }
  return p;
}

function migrateLegacyElement(e, k) {
  const tr = e.transform || {};
  const P = tr.position || { x: 0, y: 0, z: 0 };
  const R = tr.rotation || { x: 0, y: 0, z: 0 };
  const S = tr.scale || { x: 1, y: 1, z: 1 };
  const meters = Math.abs(P.x) < 0.25 && Math.abs(P.y) < 0.25;
  const layout = k * 0.8;
  const pos = { x: round(meters ? P.x * layout : P.x), y: round(meters ? P.y * layout - 0.03 : P.y), z: 0.05 };
  const common = {
    id: e.id || newId(e.type), name: e.name || e.type, visible: e.visible !== false,
    position: pos, rotation: { x: R.x || 0, y: R.y || 0, z: R.z || 0 },
    action: migrateLegacyAction((e.actions || [])[0]),
    opacity: e.opacity ?? 1
  };

  switch (e.type) {
    case 'text': {
      const isTitle = (e.fontSize || 0) >= 20 || /title/i.test(e.id || '');
      return defaultElement('text', {
        ...common, position: { ...pos, z: isTitle ? 0.045 : 0.035 },
        text: {
          content: e.text || '',
          color: e.gradientEnabled && e.gradientColor1 ? e.gradientColor1 : (e.color || '#ffffff'),
          gradient: !!e.gradientEnabled, color2: e.gradientColor2 || '#38bdf8', angle: e.gradientAngle ?? 90,
          stroke: e.strokeColor || '#020617', strokeWidth: e.strokeWidth ?? 8, font: e.fontFamily || 'PipasDisplay',
          width: isTitle ? 0.68 : 0.64, height: isTitle ? 0.145 : 0.115,
          background: (e.transparentBg === false && e.backgroundColor && e.backgroundColor !== 'transparent') ? e.backgroundColor : '',
          // la versión anterior usaba depth3d (m) × 5 en unidades del empaque
          depth: typeof e.depth3d === 'number' && e.depth3d > 0 ? round(Math.min(0.08, (e.depth3d > 0.1 ? e.depth3d * 0.001 : e.depth3d) * 5)) : 0
        },
        scale: { x: S.x || 1, y: S.y || 1, z: S.z || 1 }
      });
    }
    case 'model3d':
    case 'primitive': {
      const s = (S.x < 0.25) ? S.x * k * 0.78 : S.x;
      const kindMap = { lime: 'lime', lime_verde: 'lime', chili: 'chili', passion: 'passion', seed: 'seed', golden_seed: 'golden_seed',
        waving_character: 'character', hola: 'hola', trophy: 'trophy', gem: 'gem', crown: 'crown', rocket: 'rocket',
        bullseye: 'bullseye', target: 'bullseye', frame: 'frame', box: 'box', sphere: 'sphere', cylinder: 'cylinder', cone: 'cone', torus: 'torus' };
      return defaultElement('model', {
        ...common, position: { ...pos, z: 0.07 },
        scale: { x: round(s), y: round(s), z: round(s) },
        model: {
          kind: e.modelUrl ? '' : (kindMap[e.modelKind] || kindMap[e.primitiveType] || 'lime'),
          url: e.modelUrl || '', color: e.modelKind === 'lime_verde' ? '#22c55e' : (e.color && e.type === 'primitive' ? e.color : ''),
          texture: e.textureUrl || ''
        },
        material: { preset: '', roughness: e.roughness ?? null, metalness: e.metalness ?? null, emissive: 0 },
        anim: { spin: e.autoRotate ? 45 * (e.rotateSpeed || 1) : 0, float: e.floatAnim ? 0.03 : 0, pulse: false }
      });
    }
    case 'hotspot':
      return defaultElement('hotspot', { ...common, position: { ...pos, z: 0.08 }, hotspot: { color: e.color || '#a5f3fc', size: 0.08 } });
    case 'button':
      return defaultElement('button', {
        ...common, position: { ...pos, z: 0.05 },
        button: { label: e.label || 'Ver más', icon: '', color: e.buttonColor || '#84cc16', textColor: e.textColor || '#020617',
          width: 0.6, height: 0.16, shape: e.shape || 'pill', depth: 0.02 }
      });
    case 'gif':
    case 'image': {
      let hh = e.height || 0.04;
      if (hh < 0.2) hh *= 10;
      const aspect = e.aspectRatio || 1;
      const url = e.imageUrl || e.url || '';
      if (!url) return null;
      return defaultElement('image', {
        ...common, position: { ...pos, y: Math.min(0.75, Math.max(-0.75, pos.y)), z: 0.055 },
        billboard: !!e.billboard,
        image: { url, width: round(hh * aspect * (S.x || 1)), speed: e.speed || 1 }
      });
    }
    default:
      return null;
  }
}

/**
 * Archivos locales que necesita la app de RA publicada.
 * Las carátulas se incluyen porque las usa el simulador 3D (el exportador las reduce).
 */
export function collectProjectAssets(project) {
  const set = new Set(['targets/targets.mind']);
  const add = (u) => { if (isLocalPath(u)) set.add(stripQuery(u)); };
  project.flavors.forEach(f => {
    add(f.imageUrl);
    (f.realPhotos || []).forEach(add);
    f.elements.forEach(e => {
      if (e.type === 'image') add(e.image?.url);
      if (e.type === 'model') {
        add(e.model?.url);
        add(e.model?.texture);
        if (!e.model?.url && e.model?.kind === 'character') add(CHARACTER_URL);
      }
    });
  });
  add(project.ui.finale.imageUrl);
  add(project.ui.loading.logoUrl);
  (project.ui.fonts || []).forEach(f => add(f.url));
  return Array.from(set);
}

export function isLocalPath(u) {
  return typeof u === 'string' && u.length > 0 && !/^(https?:|data:|blob:|\/\/)/i.test(u);
}
function stripQuery(u) { return u.split('?')[0].split('#')[0].replace(/^\.\//, ''); }

/**
 * Grupos de marcadores dentro de targets.mind (cada grupo = 1 marcador por sabor, en orden de targetIndex).
 * Lo guarda el editor al recompilar (settings.targetsLayout); si falta, se deduce del número de marcadores.
 */
export function resolveTargetsLayout(project, nTargets) {
  const NF = project.flavors.length;
  const saved = project.settings && project.settings.targetsLayout;
  if (Array.isArray(saved) && saved.length * NF === nTargets) return saved.slice();
  const groups = Math.max(1, Math.round(nTargets / NF));
  const out = ['bolsa'];
  if (groups >= 2) out.push('palabras');
  // el editor agrega al final 4 grupos de bolsa desenfocada (4 direcciones) después de las fotos
  // y después 2 grupos de bolsa inclinada (ladoX, ladoY)
  const TILT = ['ladoX', 'ladoX2', 'ladoY', 'ladoXY'];
  const tilt = groups >= 11 ? 4 : (groups >= 9 ? 2 : 0), blur = groups >= 7 ? 4 : 0;
  while (out.length < groups - blur - tilt) out.push('foto');
  while (out.length < groups - tilt) out.push('borroso');
  if (tilt === 4) out.push(...TILT); else if (tilt === 2) out.push('ladoX', 'ladoY');
  return out;
}

export function deepMerge(a, b) {
  if (b === undefined) return clone(a);
  if (!isObj(a) || !isObj(b)) return clone(b);
  const out = clone(a);
  for (const k of Object.keys(b)) {
    if (b[k] === undefined) continue;
    out[k] = isObj(out[k]) && isObj(b[k]) ? deepMerge(out[k], b[k]) : clone(b[k]);
  }
  return out;
}
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
export function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function round(v) { return Math.round(v * 1000) / 1000; }

export function stabilityParams(settings) {
  if (settings.stability === 'custom') return { ...STABILITY_PRESETS.custom, ...(settings.custom || {}) };
  return STABILITY_PRESETS[settings.stability] || STABILITY_PRESETS.normal;
}

/** fetch con tiempo límite y reintentos (conexiones móviles lentas o que se cortan). */
export async function fetchRetry(url, opts = {}, { tries = 3, timeoutMs = 10000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac && setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: ac && ac.signal });
      if (r.ok || r.status === 404) return r;   // 404 no mejora reintentando
      last = new Error('HTTP ' + r.status);
    } catch (e) { last = e; }
    finally { clearTimeout(timer); }
    if (i < tries - 1) await new Promise(res => setTimeout(res, 600 * (i + 1)));
  }
  throw last;
}

/** Carga el proyecto publicado (data/project.json) con respaldo. */
export async function loadPublishedProject() {
  try {
    const r = await fetchRetry('data/project.json?v=' + Date.now(), { cache: 'no-store' }, { tries: 3, timeoutMs: 8000 });
    if (r.ok) return normalizeProject(await r.json());
  } catch (e) { console.error('No se pudo cargar data/project.json:', e && e.message); }
  if (window.EMBEDDED_PROJECT) return normalizeProject(window.EMBEDDED_PROJECT);
  return defaultProject();
}
