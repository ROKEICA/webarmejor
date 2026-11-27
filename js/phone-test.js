/**
 * Pipas Mega RA — MODO PRUEBA EN CELULAR (index.html?prueba=1)
 *
 * Mide el reconocimiento y el seguimiento con la cámara REAL y las bolsas REALES:
 *   1. Eliges el sabor que vas a apuntar y la fase (quieto / movimiento rápido / luz difícil).
 *   2. "Iniciar prueba" mide durante 20 s, 10 veces por segundo: si se ve el sabor correcto, otro sabor o nada,
 *      cuánto tarda en reconocer, cuántas veces se pierde, luz, reflejos y puntos de cada marcador.
 *   3. "Grabar video" guarda 15 s de lo que ve la cámara (sin contenido 3D) para repetir la prueba en computador.
 * Los resultados se acumulan y se pueden descargar (.json) o copiar para enviarlos.
 */
const PHASES = [
  ['quieto', '✋ Quieto'],
  ['rapido', '💨 Mover rápido'],
  ['luz', '💡 Luz difícil / reflejos'],
  ['lejos', '↔️ Lejos / inclinado']
];

export function installPhoneTest(state) {
  const ctl = () => state.mindar && state.mindar.controller;
  const flavors = state.project.flavors.slice().sort((a, b) => a.targetIndex - b.targetIndex);
  const results = loadResults();
  let sel = flavors[0].id, phase = 'quieto', run = null, rec = null;

  const css = document.createElement('style');
  css.textContent = `
  #ptest{position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;background:rgba(2,6,23,.92);color:#e2e8f0;
    font:13px/1.35 system-ui,sans-serif;border:1px solid #334155;border-radius:14px;padding:10px;max-height:55vh;overflow:auto}
  #ptest .row{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}
  #ptest button{border:1px solid #475569;background:#0f172a;color:#e2e8f0;border-radius:9px;padding:7px 9px;font-size:13px}
  #ptest button.on{background:#16a34a;border-color:#22c55e;color:#fff}
  #ptest button.go{background:#2563eb;border-color:#3b82f6;color:#fff;font-weight:600}
  #ptest button.rec{background:#b91c1c;border-color:#ef4444;color:#fff}
  #ptest .live{font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;color:#a5f3fc}
  #ptest table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
  #ptest td,#ptest th{border-bottom:1px solid #1e293b;padding:3px 4px;text-align:left}
  #ptest .ok{color:#4ade80}#ptest .bad{color:#f87171}#ptest .mid{color:#fbbf24}
  #ptest-min{position:fixed;right:10px;bottom:10px;z-index:10000;display:none}`;
  document.head.appendChild(css);

  const box = document.createElement('div'); box.id = 'ptest';
  document.body.appendChild(box);
  const minBtn = document.createElement('button'); minBtn.id = 'ptest-min'; minBtn.textContent = '🧪';
  minBtn.style.cssText += 'border-radius:50%;width:46px;height:46px;font-size:20px;border:0;background:#2563eb;color:#fff';
  minBtn.onclick = () => { box.style.display = ''; minBtn.style.display = 'none'; };
  document.body.appendChild(minBtn);

  function render() {
    const fl = flavors.map(f => `<button data-f="${f.id}" class="${f.id === sel ? 'on' : ''}">${f.emoji || ''} ${f.short}</button>`).join('');
    const ph = PHASES.map(([k, t]) => `<button data-p="${k}" class="${k === phase ? 'on' : ''}">${t}</button>`).join('');
    box.innerHTML = `
      <div class="row" style="justify-content:space-between"><b>🧪 Prueba con cámara real</b>
        <button id="pt-hide">Ocultar</button></div>
      <div>1. ¿Qué bolsa vas a apuntar?</div><div class="row">${fl}</div>
      <div>2. ¿Qué vas a probar?</div><div class="row">${ph}</div>
      <div class="row">
        <button class="go" id="pt-go">${run ? '⏹ Detener' : '▶ Iniciar prueba (20 s)'}</button>
        <button class="${rec ? 'rec' : ''}" id="pt-rec">${rec ? '⏹ Detener video' : '🎥 Grabar video (15 s)'}</button>
      </div>
      <div class="live" id="pt-live">${run ? '' : 'Apunta a la bolsa elegida y pulsa Iniciar. En "Mover rápido", mueve la bolsa de lado a lado y arriba/abajo.'}</div>
      ${table()}
      <div class="row">
        <button id="pt-dl">⬇ Descargar resultados</button><button id="pt-copy">📋 Copiar resumen</button><button id="pt-clear">🗑 Borrar</button>
      </div>`;
    box.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { if (!run) { sel = b.dataset.f; render(); } });
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { if (!run) { phase = b.dataset.p; render(); } });
    box.querySelector('#pt-go').onclick = () => run ? stop() : start();
    box.querySelector('#pt-rec').onclick = () => rec ? stopRec() : startRec();
    box.querySelector('#pt-dl').onclick = download;
    box.querySelector('#pt-copy').onclick = copySummary;
    box.querySelector('#pt-clear').onclick = () => { if (confirmClear()) { results.length = 0; saveResults(results); render(); } };
    box.querySelector('#pt-hide').onclick = () => { box.style.display = 'none'; minBtn.style.display = 'block'; };
  }

  function confirmClear() { return results.length === 0 || window.confirm('¿Borrar todos los resultados?'); }

  function table() {
    if (!results.length) return '';
    const cls = (v, good, mid) => v >= good ? 'ok' : v >= mid ? 'mid' : 'bad';
    const rows = results.slice(-12).reverse().map(r => `<tr>
      <td>${r.flavorShort}</td><td>${r.phaseLabel}</td>
      <td class="${cls(r.okPct, 90, 70)}">${r.okPct}%</td>
      <td class="${r.wrongPct ? 'bad' : 'ok'}">${r.wrongPct}%</td>
      <td>${r.firstS === null ? '—' : r.firstS + ' s'}</td>
      <td class="${r.losses > 2 ? 'bad' : r.losses ? 'mid' : 'ok'}">${r.losses}</td></tr>`).join('');
    return `<table><tr><th>Bolsa</th><th>Prueba</th><th>Visto</th><th>Error</th><th>1ª vez</th><th>Pérdidas</th></tr>${rows}</table>`;
  }

  function visibleFlavor() {
    const e = state.flavors.find(x => x.anchor && x.anchor.group.visible);
    return e ? e.flavor.id : null;
  }

  function start() {
    const c = ctl(); if (!c) return;
    const t0 = performance.now();
    run = { t0, samples: 0, ok: 0, wrong: 0, none: 0, first: null, losses: 0, last: null, wrongWho: {},
      luma: 0, glare: 0, maxPts: {}, src: { bolsa: 0, logo: 0 }, statsStart: { ...(c.__pipasStats || {}) }, rescuesStart: c.__rescues || 0 };
    run.timer = setInterval(sample, 100);
    run.end = setTimeout(stop, 20000);
    render();
  }

  function sample() {
    const c = ctl(); if (!c || !run) return;
    const v = visibleFlavor();
    run.samples++;
    if (!v) run.none++;
    else if (v === sel) { run.ok++; if (run.first === null) run.first = (performance.now() - run.t0) / 1000; }
    else { run.wrong++; run.wrongWho[v] = (run.wrongWho[v] || 0) + 1; }
    if (run.last === sel && v !== sel) run.losses++;
    run.last = v;
    const e = state.flavors.find(x => x.anchor && x.anchor.group.visible);
    if (e && e.anchor.source) run.src[e.anchor.source]++;
    const a = state.audit || {};
    run.luma += a.luma || 0; run.glare += a.glare || 0;
    const lm = c.__lastMatch;
    if (lm && lm.candidates) lm.candidates.forEach(cd => {
      const f = flavors[cd.targetIndex % flavors.length];
      const k = (f ? f.short : cd.targetIndex) + (cd.targetIndex >= flavors.length ? ' (palabras)' : '');
      run.maxPts[k] = Math.max(run.maxPts[k] || 0, cd.inliers);
    });
    const el = document.getElementById('pt-live');
    if (el) {
      const s = run.samples;
      el.textContent = `Midiendo… ${Math.round((performance.now() - run.t0) / 1000)} / 20 s\n` +
        `Visto correcto ${Math.round(run.ok / s * 100)}% · otro sabor ${Math.round(run.wrong / s * 100)}% · nada ${Math.round(run.none / s * 100)}%\n` +
        `Ahora: ${v ? (flavors.find(f => f.id === v) || {}).short : '—'} · pérdidas ${run.losses} · luz ${a.luma ?? '–'} · reflejos ${a.glare ?? '–'}%`;
    }
  }

  function stop() {
    if (!run) return;
    clearInterval(run.timer); clearTimeout(run.end);
    const c = ctl() || {};
    const s = Math.max(1, run.samples), f = flavors.find(x => x.id === sel);
    const st = c.__pipasStats || {}, st0 = run.statsStart;
    results.push({
      when: new Date().toISOString(), flavor: sel, flavorShort: f.short, phase, phaseLabel: PHASES.find(p => p[0] === phase)[1],
      seconds: Math.round((performance.now() - run.t0) / 100) / 10, samples: s,
      okPct: Math.round(run.ok / s * 100), wrongPct: Math.round(run.wrong / s * 100), nonePct: Math.round(run.none / s * 100),
      firstS: run.first === null ? null : Math.round(run.first * 10) / 10, losses: run.losses,
      wrongWho: run.wrongWho, avgLuma: Math.round(run.luma / s), avgGlare: Math.round(run.glare / s * 10) / 10,
      maxPoints: run.maxPts, seenBy: run.src,
      foundBy: { recorte: (st.moving || 0) - (st0.moving || 0), cuadroCompleto: (st.full || 0) - (st0.full || 0), antiBrillo: (st.norm || 0) - (st0.norm || 0) },
      rescues: (c.__rescues || 0) - run.rescuesStart,
      fps: state.audit && state.audit.fps, video: state.audit && state.audit.res, ua: navigator.userAgent
    });
    saveResults(results);
    run = null;
    render();
  }

  /* ---------------- grabación de la cámara (para repetir la prueba en computador) */
  function startRec() {
    const video = state.mindar && state.mindar.video;
    const stream = video && video.srcObject;
    if (!stream || !window.MediaRecorder) { alert('Este navegador no permite grabar la cámara.'); return; }
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const chunks = [];
    let mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined); }
    catch (e) { alert('No se pudo grabar: ' + e.message); return; }
    mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    mr.onstop = () => {
      const type = mr.mimeType || mime || 'video/webm';
      const ext = /mp4/.test(type) ? 'mp4' : 'webm';
      const f = flavors.find(x => x.id === sel);
      saveBlob(new Blob(chunks, { type }), `prueba_${f.id}_${phase}_${Date.now()}.${ext}`);
      rec = null; render();
    };
    mr.start(500);
    rec = { mr, timer: setTimeout(stopRec, 15000) };
    render();
  }
  function stopRec() { if (rec) { clearTimeout(rec.timer); try { rec.mr.stop(); } catch (e) { rec = null; render(); } } }

  /* ---------------- exportar */
  function summaryText() {
    if (!results.length) return 'Sin resultados.';
    const lines = results.map(r => `${r.flavorShort} | ${r.phaseLabel} | visto ${r.okPct}% | error ${r.wrongPct}% | 1ª ${r.firstS ?? '—'}s | pérdidas ${r.losses} | luz ${r.avgLuma} | reflejos ${r.avgGlare}% | puntos ${Object.entries(r.maxPoints).map(([k, v]) => k + ' ' + v).join(', ')}`);
    return 'Prueba Pipas Mega RA (' + (results[0].video || '') + ', ' + (results[0].fps || '?') + ' fps)\n' + lines.join('\n');
  }
  function copySummary() {
    const t = summaryText();
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(
      () => alert('Resumen copiado. Pégalo en el chat.'),
      () => window.prompt('Copia este resumen:', t));
  }
  function download() {
    saveBlob(new Blob([JSON.stringify({ app: 'pipas-mega-ra', results }, null, 2)], { type: 'application/json' }), 'resultados_prueba_pipas.json');
  }

  render();
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function loadResults() { try { return JSON.parse(localStorage.getItem('pipas_prueba') || '[]'); } catch (e) { return []; } }
function saveResults(r) { try { localStorage.setItem('pipas_prueba', JSON.stringify(r.slice(-200))); } catch (e) { /* sin almacenamiento */ } }
