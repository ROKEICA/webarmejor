/**
 * Pipas Mega RA — parche del worker de MindAR 1.2.5 (script clásico: cargar ANTES de MindAR).
 *
 * MindAR original prueba los targets en orden y se queda con el PRIMERO que coincide (>= 6 puntos).
 * Como los 4 empaques comparten logo, mascota y semilla, eso puede confundir sabores. Este parche:
 *   - evalúa TODOS los marcadores (bolsas de diseño, palabras "MEGA + sabor" y fotos reales de las bolsas),
 *   - el sabor lo decide el LOGO cuando se ve (las letras y el arte de cada sabor son únicos);
 *     si no se ve el logo, gana la bolsa completa con más coincidencias (mínimo 6 puntos, como MindAR),
 *   - descarta poses degeneradas,
 *   - usa el color solo como desempate cuando dos sabores tienen casi los mismos puntos (±15 %).
 * Los umbrales internos de MindAR (3 px, ratio 0.7, radio 10 px) se dejan intactos.
 */
(function () {
  var FIND = "let t=-1,s=null,r=null;for(let f=0;f<e.length;f++){const g=e[f],{keyframeIndex:a,screenCoords:j,worldCoords:w,debugExtra:y}=Gt.matchDetection(Kt[g],n.featurePoints);if(r=y,a!==-1){const m=St.estimate({screenCoords:j,worldCoords:w});m&&(t=g,s=m);break}}postMessage({type:\"matchDone\",targetIndex:t,modelViewTransform:s,debugExtra:r});";
  var REPLACE = [
    'const _validPose=m=>{if(!m||!m[0]||!m[1]||!m[2])return false;const nx=m[1][0]*m[2][1]-m[2][0]*m[1][1],ny=m[2][0]*m[0][1]-m[0][0]*m[2][1],nz=m[0][0]*m[1][1]-m[1][0]*m[0][1];const nLen=Math.hypot(nx,ny,nz);if(!isFinite(nLen)||nLen<1e-5)return false;const c0=Math.hypot(m[0][0],m[1][0],m[2][0]),c1=Math.hypot(m[0][1],m[1][1],m[2][1]);if(c0<1e-4||c1<1e-4)return false;const ratio=c0/c1;if(ratio<0.22||ratio>4.5)return false;const sinTheta=nLen/(c0*c1);if(sinTheta<0.35)return false;return true;};',
    // NF = número de sabores; los marcadores van en grupos de NF y n.layout dice qué es cada grupo
    // ('bolsa' = diseño, 'palabras' = recuadro "MEGA + sabor", 'foto' = foto real de la bolsa)
    'const NF=(n.nFlavors|0)>0?(n.nFlavors|0):0;const LY=Array.isArray(n.layout)?n.layout:null;const _fl=g=>NF>0?g%NF:g;const _isLogo=g=>NF>0&&(LY?LY[Math.floor(g/NF)]==="palabras":g>=NF);const _isBlur=g=>NF>0&&!!LY&&LY[Math.floor(g/NF)]==="borroso";',
    'let t=-1,s=null,r=null,cands=[];',
    'for(let f=0;f<e.length;f++){const g=e[f],{keyframeIndex:a,screenCoords:j,worldCoords:w,debugExtra:y}=Gt.matchDetection(Kt[g],n.featurePoints);if(r=y,a!==-1&&j&&j.length>=6){const m=St.estimate({screenCoords:j,worldCoords:w});if(m&&_validPose(m))cands.push({targetIndex:g,flavor:_fl(g),logo:_isLogo(g),blur:_isBlur(g),inliers:j.length,modelViewTransform:m});}}',
    'cands.sort((A,B)=>B.inliers-A.inliers);',
    'const dom=n.dominantColorTarget;',
    // Marcadores BORROSOS (bolsa desenfocada por movimiento): pesan menos. Solo cuentan con >=8 coincidencias y si no
    // hay un marcador nítido de otro sabor con casi los mismos puntos (el color no sirve aquí: con desenfoque se mezcla).
    'cands=cands.filter(c=>{if(!c.blur)return true;if(c.inliers<8)return false;const o=cands.find(x=>!x.blur&&x.flavor!==c.flavor);return !(o&&o.inliers>=c.inliers*0.7);});',
    'const _tie=list=>{let b=list[0];if(list.length>1&&dom!==undefined&&dom!==-1&&b.flavor!==dom){const alt=list.find(c=>c.flavor===dom);if(alt&&alt.inliers>=b.inliers*0.85)b=alt;}return b;};',
    'let decidedBy="bolsa";',
    'if(cands.length){',
    // 1) El LOGO decide el sabor (solo se miran las letras/arte "MEGA + sabor")
    '  const full=cands.filter(c=>!c.logo),logos=cands.filter(c=>c.logo);let flavor=-1;',
    '  if(logos.length){const bl=_tie(logos);const bf=full[0];',
    // las palabras deciden si son evidencia clara: >=12 puntos, o >=8 sin una bolsa de otro sabor con más puntos
    '    const otherFull=full.find(c=>c.flavor!==bl.flavor);',
    '    if((bl.inliers>=12||(bl.inliers>=8&&!(otherFull&&otherFull.inliers>=bl.inliers)))&&!(otherFull&&otherFull.inliers>=bl.inliers*3+10)){flavor=bl.flavor;decidedBy="logo";}}',
    // 2) Sin logo claro: la bolsa completa con más puntos (color solo como desempate)
    '  if(flavor===-1)flavor=_tie(full.length?full:cands).flavor;',
    // Pose: se prefiere la bolsa completa de ese sabor (más estable); si no, el logo
    '  const mine=cands.filter(c=>c.flavor===flavor);const best=mine.find(c=>!c.logo&&!c.blur)||mine.find(c=>!c.logo)||mine[0];',
    '  t=best.targetIndex;s=best.modelViewTransform;}',
    'postMessage({type:"matchDone",targetIndex:t,modelViewTransform:s,decidedBy:decidedBy,candidates:cands.map(c=>({targetIndex:c.targetIndex,flavor:c.flavor,logo:c.logo,inliers:c.inliers})),debugExtra:r});'
  ].join('');
  // Umbrales tolerantes a reflejos, arrugas e inclinación (los mismos de la app original, "Anti-Glare Foil Kernel"):
  //   Hough más ancho, inliers a 7.5 px (antes 3), prueba de proporción 0.80 (antes 0.7), radio de búsqueda 24 px,
  //   y se exige un mínimo de 6 coincidencias tras la homografía para no aceptar poses débiles.
  var TOLERANT = [
    ['ct=1,vt=o=>{', 'ct=1.55,vt=o=>{'],
    ['Xe=.01,Ue=10,$e=20,Le=10', 'Xe=.035,Ue=14,$e=75,Le=36'],
    ['$t=3,Lt=6,Ke=8,Ot=.7', '$t=7.5,Lt=6,Ke=18,Ot=.80'],
    ['g=10*10', 'g=24*24'],
    ['const y=Yt({H:w,matches:j,threshold:$t});return s&&(r.inlierMatches2=y),{H:w,matches:y,debugExtra:r}',
     'const y=Yt({H:w,matches:j,threshold:$t});if(y.length<6)return{debugExtra:r};return s&&(r.inlierMatches2=y),{H:w,matches:y,debugExtra:r}']
  ];
  function patch(src) {
    if (typeof src !== 'string' || src.indexOf('matchDetection') === -1) return src;
    if (src.indexOf(FIND) === -1) { console.warn('[Pipas RA] Worker de MindAR no reconocido: se usa sin parche'); return src; }
    // Probado con videos de las bolsas reales: los umbrales tolerantes hacen que los 4 sabores "se parezcan"
    // (p. ej. Pica 41 / Acid 39 / Verde 30 puntos en el mismo cuadro) y confunden el sabor. Quedan APAGADOS;
    // se pueden activar con window.PIPAS_TOLERANT_MATCH = true antes de cargar este archivo.
    var tolerant = window.PIPAS_TOLERANT_MATCH === true;
    if (tolerant) TOLERANT.forEach(function (r) {
      if (src.indexOf(r[0]) === -1) console.warn('[Pipas RA] Umbral no encontrado:', r[0].slice(0, 30));
      else src = src.replace(r[0], function () { return r[1]; });
    });
    window.__PIPAS_WORKER_PATCHED__ = tolerant ? 'tolerante' : true;
    return src.replace(FIND, function () { return REPLACE; });
  }
  var OrigBlob = window.Blob;
  function PatchedBlob(parts, options) {
    if (parts && typeof parts[0] === 'string') parts = [patch(parts[0])].concat(Array.prototype.slice.call(parts, 1));
    return new OrigBlob(parts, options);
  }
  PatchedBlob.prototype = OrigBlob.prototype;
  window.Blob = PatchedBlob;
  var OrigWorker = window.Worker;
  function PatchedWorker(url, options) {
    if (typeof url === 'string' && url.indexOf('data:application/javascript;base64,') === 0) {
      var code = atob(url.split(',')[1]);
      if (code.indexOf('matchDetection') !== -1) url = 'data:application/javascript;base64,' + btoa(patch(code));
    }
    return new OrigWorker(url, options);
  }
  PatchedWorker.prototype = OrigWorker.prototype;
  window.Worker = PatchedWorker;
})();
