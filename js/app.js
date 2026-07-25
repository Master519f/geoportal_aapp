(() => {
  var lb = document.getElementById('login-btn');
  var lu = document.getElementById('login-user');
  var lp = document.getElementById('login-pass');
  var ls = document.getElementById('login-screen');
  var as = document.getElementById('app-sidebar');
  var le = document.getElementById('login-error');
  if (lb && ls && as) {
    function doLogin() {
      if (lu.value.trim() === 'usuario' && lp.value.trim() === 'usuario') {
        ls.classList.add('hidden');
        as.style.display = 'flex';
      } else {
        le.style.display = 'block';
        lp.value = '';
        lp.focus();
      }
    }
    lb.onclick = doLogin;
    lp.onkeydown = function(e) { if (e.key === 'Enter') doLogin(); };
    lu.onkeydown = function(e) { if (e.key === 'Enter') doLogin(); };
  }
})();

const { createClient } = window.supabase || {};

let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
let SCHEMA = 'epmapaq';
let PROXY_BASE = '';
let FOTO_BUCKET = 'fotos-inspecciones';
let supabaseClient = null;
let supabasePublic = null;

async function loadConfig() {
  const isLocal = window.location.hostname === 'localhost';
  PROXY_BASE = isLocal ? '/proxy' : window.location.origin + '/api/proxy';
  try {
    const resp = await fetch('/api/config.js');
    const cfg = await resp.json();
    SUPABASE_URL = (cfg.SUPABASE_URL || '').trim() || SUPABASE_URL;
    SUPABASE_ANON_KEY = (cfg.SUPABASE_ANON_KEY || '').trim() || SUPABASE_ANON_KEY;
    SCHEMA = (cfg.SCHEMA || '').trim() || SCHEMA;
    FOTO_BUCKET = (cfg.FOTO_BUCKET || '').trim() || FOTO_BUCKET;
  } catch (_) {}
  if (!SUPABASE_URL) {
    SUPABASE_URL = 'https://befaumtpegfkwrephusu.supabase.co';
    SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlZmF1bXRwZWdma3dyZXBodXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NTgyMDksImV4cCI6MjA5ODQzNDIwOX0.qxC1yhCNWdJ6cIPmtXjj8CB7YLU07ZV68QSfthSIRoI';
  }
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SCHEMA } });
  supabasePublic = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let currentTable = null;
let map = null;
let layerControl = null;
let baseLayers = {};

const activeLayers = new Map();
const featureCache = new Map();
const LAYER_COLORS = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6'];

let isCreateMode = false;
let createPhase = '';
let pickedLatLng = null;
let tempMarker = null;

function openLightbox(src) {
  const lb = document.getElementById('image-lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.add('show');
}
function closeLightbox() {
  document.getElementById('image-lightbox').classList.remove('show');
}

let cameraCaptureFile = null;
let cameraStream = null;
let cameraFacingMode = 'environment';
let cameraOnCaptureCallback = null;

function openCameraModal(onCapture) {
  cameraOnCaptureCallback = onCapture;
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  const btnClose = document.getElementById('btn-camera-close');
  const btnCapture = document.getElementById('btn-camera-capture');
  const btnSwitch = document.getElementById('btn-camera-switch');

  modal.classList.add('show');
  startCameraStream();

  btnClose.onclick = () => closeCameraModal();
  btnCapture.onclick = () => capturePhoto();
  btnSwitch.onclick = () => { cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment'; startCameraStream(); };
  modal.onclick = (e) => { if (e.target === modal) closeCameraModal(); };
}

function closeCameraModal() {
  const modal = document.getElementById('camera-modal');
  modal.classList.remove('show');
  stopCameraStream();
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  video.srcObject = null;
}

async function startCameraStream() {
  stopCameraStream();
  const video = document.getElementById('camera-video');
  try {
    const constraints = { video: { facingMode: cameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false };
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = cameraStream;
  } catch (err) {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = cameraStream;
    } catch (err2) {
      alert('No se pudo acceder a la camara: ' + err2.message);
      closeCameraModal();
    }
  }
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (cameraFacingMode === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  canvas.toBlob(function(blob) {
    if (!blob) return;
    const file = new File([blob], 'foto_' + Date.now() + '.jpg', { type: 'image/jpeg' });
    cameraCaptureFile = file;
    if (cameraOnCaptureCallback) cameraOnCaptureCallback(file);
    closeCameraModal();
  }, 'image/jpeg', 0.9);
}

function unloadInspecciones() {
  const info = activeLayers.get('inspecciones');
  if (info) {
    if (info.layer) {
      if (info.visible) map.removeLayer(info.layer);
      if (layerControl) layerControl.removeLayer(info.layer);
    }
    if (info.labelLayerGroup && map.hasLayer(info.labelLayerGroup)) map.removeLayer(info.labelLayerGroup);
  }
  activeLayers.delete('inspecciones');
  featureCache.delete('inspecciones');
  renderLayersList();
}

async function deleteInspeccion(storeKey) {
  const data = popupFeatureData[storeKey];
  if (!data || !data.props.gid) return;
  if (!confirm('Est seguro de eliminar este registro de inspeccion?')) return;

  showStatus('info', 'Eliminando...');
  const gid = data.props.gid;
  const fotoUrl = data.props.foto;

  if (fotoUrl && fotoUrl.includes(FOTO_BUCKET)) {
    try {
      const urlParts = fotoUrl.split(FOTO_BUCKET + '/');
      if (urlParts[1]) {
        const filePath = decodeURIComponent(urlParts[1]);
        await supabasePublic.storage.from(FOTO_BUCKET).remove([filePath]);
      }
    } catch (_) {}
  }

  try {
    const { error } = await supabaseClient.from('inspecciones').delete().eq('gid', gid);
    if (error) throw error;
    showStatus('success', 'Registro eliminado exitosamente');
    map.closePopup();
    unloadInspecciones();
    loadTable('inspecciones');
  } catch (err) {
    showStatus('error', 'Error al eliminar: ' + (err.message || err));
  }
}
let currentTableColumns = [];
let currentGeomColName = null;

const GEOM_PATTERNS = /^(geom|geometry|the_geom|way|shape|geo|multipolygon|polygon|linestring|multilinestring|point|multipoint)$/i;

const LAYER_POPUP_CONFIG = {
  medidores: {
    fields: [
      { key: 'cod_client', label: 'SUMINISTRO' },
      { key: 'medidor', label: 'NUM. MEDIDOR' },
      { key: 'f_install', label: 'FECHA DE INSTALACION', type: 'date' },
      { key: 'estado', label: 'ESTADO', valueMap: { '05': 'Activo', '04': 'Desactivado' } },
      { key: 'ult_lect', label: 'ULTIMA LECTURA' },
      { key: 'obs', label: 'OBSERVACIONES' },
      { key: 'foto', label: 'NUMERO DE SERIE' },
      { key: 'foto_e', label: 'ESFERAS', type: 'image' },
      { key: 'marca', label: 'MARCA', valueMap: { '08': 'KRIEGER', '10': 'BAYLAN', '06': 'YOUNIO', '04': 'IBERCONTA' } },
      { key: 'foto_f', label: 'FACHADA DEL PREDIO', type: 'image' },
      { key: 'diametro_med', label: 'DIAMETRO', valueMap: { '01': '1/2"', '02': '3/4"', '03': '1"', '04': '1 1/2"', '05': '2"' } }
    ]
  },
  inspecciones: {
    fields: [
      { key: 'clv_cat', label: 'CLAVE CATASTRAL' },
      { key: 'fecha', label: 'FECHA', type: 'date' },
      { key: 'usuario', label: 'USUARIO' },
      { key: 'tecnico', label: 'TECNICO' },
      { key: 'obs', label: 'OBSERVACIONES' },
      { key: 'foto', label: 'FOTO', type: 'image' },
      { key: 'disp_agua', label: 'Posee sistema de AAPP', valueMap: { '1': 'SI', '2': 'NO' } }
    ]
  },
  catastro: {
    fields: [
      { key: 'id', label: 'ID' },
      { key: 'clave_nuev', label: 'Clave Catastral' },
      { key: 'provincia', label: 'Provincia' },
      { key: 'canton', label: 'Canton' },
      { key: 'parroquia', label: 'Parroquia' },
      { key: 'barrio', label: 'Barrio / Cdla / Sector' },
      { key: 'clave_ante', label: 'Ref. Catastro Anterior' },
      { key: 'mz_dir', label: 'Manzana' },
      { key: 'solar_dir', label: 'Solar / Lote / Villa' },
      { key: 'predio_mun', label: 'Ref. Catastro GADMQ' },
      { key: 'clave_ag', label: 'Geocodigo' },
      { key: 'cod_client', label: 'Suministro' },
      { key: 'nombres', label: 'Cliente' },
      { key: 'ruc_cedula', label: 'Doc Id Cliente' },
      { key: 'ag01tarifa', label: 'Categoria' },
      { key: 'ag01dispon', label: 'Tipo Conexion' },
      { key: 'ag01alcadi', label: 'Dispone AA.SS.' },
      { key: 'tarifa_ag', label: 'Costo Variable AAPP' },
      { key: 'total_deud', label: 'Deuda Actual' },
      { key: 'deuda_mese', label: 'Planillas Pendientes' },
      { key: 'ag01diameagua', label: 'Diametro guia' },
      { key: 'ag01tipoabaste', label: 'Tipo Abastecimiento' },
      { key: 'ag01tipoexoner', label: 'Tipo de Exoneracion' },
      { key: 'medidor', label: 'Nro. Medidor' }
    ]
  },
  redes: {
    fields: [
      { key: 'id_0', label: 'ID DEL TRAMO' },
      { key: 'cve_prop', label: 'TIPO DE TRAMO' },
      { key: 'diam_mm', label: 'DIAMETRO (mm)' },
      { key: 'diam_in', label: 'DIAMETRO (in)' },
      { key: 'material', label: 'MATERIAL DEL TRAMO' },
      { key: 'long_m', label: 'LONGITUD DEL TRAMO' },
      { key: 'status', label: 'CALIDAD DE LA RED' },
      { key: 'ano_const', label: 'AÑO DE INSTALACION' },
      { key: 'obra', label: 'OBRA REALIZADA POR' },
      { key: 'etiqueta_1', label: 'FUENTE DE ABASTECIMIENTO' },
      { key: 'etiqueta_2', label: 'ESTADO DE ABASTECIMIENTO' },
      { key: 'etiqueta_3', label: 'OBSERVACIONES' }
    ]
  },
  parroquias: {
    fields: [
      { key: 'dpa_parroq', label: 'Codigo Parroquia' },
      { key: 'dpa_despar', label: 'Nombre Parroquia' },
      { key: 'dpa_canton', label: 'Canton' },
      { key: 'dpa_descan', label: 'Nombre Canton' },
      { key: 'dpa_provin', label: 'Provincia' },
      { key: 'dpa_despro', label: 'Nombre Provincia' },
      { key: 'dpa_anio', label: 'Anio' }
    ]
  }
};

const LAYER_FORM_CONFIG = {
  inspecciones: {
    fields: [
      { key: 'id', label: 'ID', type: 'text', auto: true },
      { key: 'clv_cat', label: 'Clave Catastral', type: 'text' },
      { key: 'fecha', label: 'Fecha', type: 'date' },
      { key: 'usuario', label: 'Usuario', type: 'text' },
      { key: 'tecnico', label: 'Tecnico', type: 'text' },
      { key: 'obs', label: 'Observaciones', type: 'textarea' },
      { key: 'disp_agua', label: 'Posee sistema de AAPP', type: 'select', options: { '1': 'SI', '2': 'NO' } },
      { key: 'foto', label: 'Foto', type: 'image' }
    ]
  }
};

const LAYER_STYLES = {
  medidores: {
    labelField: 'medidor',
    labelScaleMax: 100,
    labelDirection: 'right',
    legendItems: [
      { label: 'Activo', fill: '#03DEF2', type: 'circle' },
      { label: 'Desactivado', fill: '#FF3B00', type: 'circle' },
      { label: 'No registrado', fill: '#B2DF8A', type: 'circle' }
    ],
    styleForFeature(props) {
      if (props.estado === '05') return { fillColor: '#03DEF2', fillOpacity: 1, color: '#325780', radius: 4, weight: 1 };
      if (props.estado === '04') return { fillColor: '#FF3B00', fillOpacity: 1, color: '#232323', radius: 4, weight: 1 };
      if (props.cod_client === null || props.cod_client === undefined) return { fillColor: '#B2DF8A', fillOpacity: 0.97, color: '#232323', radius: 4, weight: 1 };
      return { fillColor: '#aaa', fillOpacity: 0.8, color: '#fff', radius: 4, weight: 1 };
    }
  },
  inspecciones: {
    legendItems: [
      { label: 'Inspeccion', fill: '#7D8FB7', type: 'circle' }
    ],
    styleForFeature() { return { fillColor: '#7D8FB7', fillOpacity: 0.9, color: '#353535', radius: 6, weight: 1 }; }
  },
  catastro: {
    tooltipField: 'clave_nuev',
    legendItems: [
      { label: 'AV / AC', fill: '#6CFFFA', outline: '#2ECBFF', type: 'polygon', dashArray: '5,2' },
      { label: 'Sin dato solar', fill: 'transparent', outline: '#E31A1C', type: 'outline' },
      { label: 'Con dato cat.', fill: 'transparent', outline: '#00FFFA', type: 'outline' }
    ],
    styleForFeature(props) {
      const sd = props.solar_dir;
      if (sd === 'AV' || sd === 'AC') return { fillColor: '#6CFFFA', fillOpacity: 1, color: '#2ECBFF', weight: 0.26, dashArray: '5,2' };
      if (sd != null) return { fillColor: '#6FFDE5', fillOpacity: 0, color: '#00FFFA', weight: 0.5 };
      if (props.Text != null) return { fillColor: '#FDBF6F', fillOpacity: 0, color: '#FF7F00', weight: 0.5 };
      return { fillColor: '#8D5A99', fillOpacity: 0, color: '#E31A1C', weight: 0.5 };
    }
  },
  redes: {
    labelExpression: (p) => {
      const d = p.diam_mm || '?';
      const m = { '01': 'PVC', '02': 'A-C', '03': 'HD', '04': 'PVC U/Z' }[p.material] || 'DESCONOCIDO';
      return '\u03A6= ' + d + 'mm //' + m;
    },
    labelScaleMax: 50,
    legendItems: [
      { label: '< 200mm', fill: '#0E1AF5', type: 'line', weight: 1 },
      { label: '>= 200mm', fill: '#0E1AF5', type: 'line', weight: 5 },
      { label: 'Sin diametro', fill: '#AC0EE6', type: 'line' }
    ],
    styleForFeature(props) {
      const d = Number(props.diam_mm) || 0;
      return { color: d === 0 ? '#AC0EE6' : '#0E1AF5', weight: d >= 200 ? 5 : 1, opacity: 1 };
    }
  },
  parroquias: {
    legendItems: [
      { label: 'Quevedo', fill: '#D86158', type: 'polygon' },
      { label: 'San Carlos', fill: '#60E6F0', type: 'polygon' },
      { label: 'La Esperanza', fill: '#B57AE4', type: 'polygon' }
    ],
    labelExpression: (p) => (p.dpa_parroq || '') + '.- ' + (p.dpa_despar || ''),
    labelScaleMax: 250,
    styleForFeature(props) {
      const o = 0.25;
      const code = (props.dpa_parroq || '').substring(0, 6);
      if (code === '120550') return { fillColor: '#D86158', fillOpacity: o, color: '#32DB32', weight: 0.26, opacity: o };
      if (code === '120553') return { fillColor: '#60E6F0', fillOpacity: o, color: '#32DB32', weight: 0.26, opacity: o };
      if (code === '120555') return { fillColor: '#B57AE4', fillOpacity: o, color: '#32DB32', weight: 0.26, opacity: o };
      return { fillColor: '#beb297', fillOpacity: o, color: '#232323', weight: 0.26, opacity: o };
    }
  }
};

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function getMapScale() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const mpp = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
  return Math.round(mpp * 200);
}

function showStatus(type, msg) {
  const el = document.getElementById('status');
  el.className = 'status-overlay show ' + type;
  el.textContent = msg;
  if (type === 'success') setTimeout(() => el.classList.remove('show'), 4000);
}

function showLoading(msg) {
  const el = document.getElementById('loading-overlay');
  el.textContent = msg;
  el.classList.add('show');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('show');
}

const LAYER_ORDER = ['medidores', 'inspecciones', 'catastro', 'redes', 'parroquias'];

function renderTableList() {
  renderLayersList();
}

function getLayerColor(name) {
  const ls = LAYER_STYLES[name];
  if (ls && ls.legendItems && ls.legendItems.length > 0) {
    for (const item of ls.legendItems) {
      if (item.fill && item.fill !== 'transparent') return item.fill;
    }
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return LAYER_COLORS[Math.abs(hash) % LAYER_COLORS.length];
}

function getLoadedIds(name) {
  if (!featureCache.has(name)) featureCache.set(name, new Map());
  return featureCache.get(name);
}

function getFeatureId(row) {
  return row.id ?? row.gid ?? row.objectid ?? row.ogc_fid ?? row.objectid_1 ?? '';
}

function renderLayersList() {
  const ul = document.getElementById('layers-list');
  ul.innerHTML = '';
  LAYER_ORDER.forEach(name => {
    const isActive = activeLayers.has(name);
    const info = isActive ? activeLayers.get(name) : null;
    const visible = info ? info.visible : false;
    const color = isActive ? info.color : getLayerColor(name);
    const count = info ? info.loadedCount : 0;

    const li = document.createElement('li');
    li.className = isActive ? 'active' : '';
    li.innerHTML = `
      <span class="layer-color" style="background:${color}"></span>
      <span class="layer-name">${esc(name)}</span>
      <label class="toggle-switch">
        <input type="checkbox" ${visible ? 'checked' : ''} data-layer="${esc(name)}">
        <span class="toggle-slider"></span>
      </label>
      <span class="layer-count">${count ? count + ' feat.' : ''}</span>
      ${isActive ? `<div class="layer-actions">
        <button class="zoom-btn" title="Zoom a capa" data-action="zoom" data-layer="${esc(name)}">&#9879;</button>
        <button class="remove-btn" title="Remover capa" data-action="remove" data-layer="${esc(name)}">&times;</button>
      </div>` : ''}
    `;

    const toggle = li.querySelector('input[type="checkbox"]');
    toggle.addEventListener('change', function() {
      const n = this.dataset.layer;
      const lInfo = activeLayers.get(n);
      if (this.checked) {
        if (!lInfo) {
          loadTable(n);
        } else if (!lInfo.visible) {
          lInfo.visible = true;
          if (lInfo.layer) map.addLayer(lInfo.layer);
          if (lInfo.labelLayerGroup) map.addLayer(lInfo.labelLayerGroup);
          updateLabelVisibility();
          renderLayersList();
          updateCreateBtn();
        }
      } else {
        if (lInfo && lInfo.visible) {
          lInfo.visible = false;
          if (lInfo.layer) map.removeLayer(lInfo.layer);
          if (lInfo.labelLayerGroup && map.hasLayer(lInfo.labelLayerGroup)) map.removeLayer(lInfo.labelLayerGroup);
          renderLayersList();
          updateCreateBtn();
        }
      }
    });

    const zoomBtn = li.querySelector('[data-action="zoom"]');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', function() {
        const n = this.dataset.layer;
        const lInfo = activeLayers.get(n);
        if (lInfo && lInfo.totalBounds && lInfo.totalBounds.isValid()) {
          map.fitBounds(lInfo.totalBounds, { padding: [30, 30] });
        }
      });
    }

    const removeBtn = li.querySelector('[data-action="remove"]');
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        removeLayer(this.dataset.layer);
      });
    }

    ul.appendChild(li);
  });
}

function removeLayer(name) {
  const info = activeLayers.get(name);
  if (!info) return;
  if (info.visible) map.removeLayer(info.layer);
  if (info.labelLayerGroup && map.hasLayer(info.labelLayerGroup)) map.removeLayer(info.labelLayerGroup);
  activeLayers.delete(name);
  featureCache.delete(name);
  layerControl.removeLayer(info.layer);
  renderLayersList();

  if (activeLayers.size === 0) {
    document.getElementById('geo-info-section').style.display = 'none';
    document.getElementById('feature-count').textContent = '';
    document.getElementById('search-section').style.display = 'none';
    document.getElementById('create-btn').classList.remove('show');
    currentTable = null;
    clearSearch();
  } else {
    const remaining = [...activeLayers.keys()];
    selectInfoLayer(remaining[remaining.length - 1]);
  }
  updateCreateBtn();
  updateSearchTableSelect();
  updateLegend();
}

function updateCreateBtn() {
  document.getElementById('create-btn').classList.toggle('show', activeLayers.has('inspecciones'));
}

function selectInfoLayer(name) {
  const info = activeLayers.get(name);
  if (!info) return;
  currentTable = name;
  document.getElementById('search-input').value = '';
  document.getElementById('search-section').style.display = 'block';
  updateCreateBtn();
  document.getElementById('geo-info-section').style.display = 'block';
  document.getElementById('geo-info-text').innerHTML =
    `Tabla: <strong>${esc(name)}</strong><br>` +
    `Columna geom: <strong>${esc(info.geoCol)}</strong><br>` +
    `Features: <strong>${info.loadedCount}</strong>`;
  document.getElementById('geo-badge-container').innerHTML = `<span class="geo-badge">GEO: ${esc(info.geoCol)}</span>`;
  document.getElementById('feature-attr-panel').innerHTML = '';
  document.getElementById('feature-count').textContent = `${info.loadedCount} features`;
}

function updateSearchTableSelect() {
  const sel = document.getElementById('search-table-select');
  sel.innerHTML = '';
  if (activeLayers.size === 0) {
    document.getElementById('search-section').style.display = 'none';
    return;
  }
  document.getElementById('search-section').style.display = 'block';
  activeLayers.forEach((info, name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentTable) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function listTables() {
  const loading = document.getElementById('loading-tables');
  loading.style.display = 'none';
  renderLayersList();
}

function detectGeoColumns(data) {
  if (!data || data.length === 0) return [];
  const cols = Object.keys(data[0]);
  const found = cols.filter(c => GEOM_PATTERNS.test(c));
  if (found.length > 0) return found;
  return cols.filter(c => {
    const val = data[0][c];
    if (!val || typeof val !== 'object') return false;
    return !!(val.type || val.coordinates || val.features);
  });
}

function parseGeoJSON(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch (_) { return null; }
  }
  if (val.type === 'Feature') return val;
  if (val.type === 'FeatureCollection') return val;
  if (val.type && val.coordinates) return { type: 'Feature', geometry: val, properties: {} };
  if (val.features) return val;
  return null;
}

function convertToGeoJSON(data, geoCol) {
  if (!data || data.length === 0) return { type: 'FeatureCollection', features: [] };
  const features = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const parsed = parseGeoJSON(row[geoCol]);
    if (!parsed) continue;
    if (parsed.type === 'Feature') {
      if (!parsed.properties || Object.keys(parsed.properties).length === 0) {
        const props = { ...row };
        delete props[geoCol];
        parsed.properties = props;
      }
      features.push(parsed);
    } else {
      features.push(parsed);
    }
  }
  return { type: 'FeatureCollection', features };
}

function initMap() {
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap', maxZoom: 22
  });
  const googleStreets = L.tileLayer('https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google Maps', maxZoom: 22
  });
  const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google Satellite', maxZoom: 22
  });
  const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: '&copy; Google Hybrid', maxZoom: 22
  });

  baseLayers = {
    'OpenStreetMap': osm,
    'Google Calles': googleStreets,
    'Google Satelite': googleSatellite,
    'Google Hibrido': googleHybrid
  };

  map = L.map('map', {
    center: [-1.015581, -79.465635],
    zoom: 17,
    preferCanvas: true,
    zoomControl: false,
    layers: [osm]
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false, maxWidth: 200 }).addTo(map);
  layerControl = L.control.layers(baseLayers, null, { position: 'topright', collapsed: false }).addTo(map);
  legendControl = new LegendControl({ position: 'topright' });
  legendControl.addTo(map);

  map.on('zoomend', updateLabelVisibility);

  setTimeout(() => map.invalidateSize(), 100);
}

async function loadTable(name) {
  if (activeLayers.has(name)) {
    showStatus('info', `"${name}" ya esta activa en el mapa`);
    selectInfoLayer(name);
    return;
  }

  currentTable = name;
  document.getElementById('search-input').value = '';
  document.getElementById('search-section').style.display = 'block';

  showLoading('Consultando ' + name + '...');

  try {
    const { count, error: countError } = await supabaseClient.from(name).select('*', { count: 'exact', head: true });
    if (countError) throw countError;

    if (count === 0) {
      hideLoading();
      const emptyInfo = {
        layer: null,
        geoCol: null,
        loadedCount: 0,
        color: getLayerColor(name),
        visible: false,
        totalBounds: null,
        _allData: [],
        labelLayerGroup: null,
        labelScaleMax: 0
      };
      activeLayers.set(name, emptyInfo);
      showStatus('success', `"${name}" esta vacia`);
      document.getElementById('geo-info-section').style.display = 'block';
      document.getElementById('geo-info-text').innerHTML = `Tabla: <strong>${esc(name)}</strong><br><span style="color:#fbbf24;">Tabla vacia.</span>`;
      document.getElementById('geo-badge-container').innerHTML = '';
      updateCreateBtn();
      renderLayersList();
      updateSearchTableSelect();
      return;
    }

    const PAGE_SIZE = 1000;
    const totalPages = Math.ceil(count / PAGE_SIZE);
    let allData = [];

    for (let page = 0; page < totalPages; page++) {
      showLoading(`${name}... (${page + 1}/${totalPages} — ${allData.length}/${count})`);
      const { data: pageData, error } = await supabaseClient.from(name).select('*').range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      if (pageData) allData = allData.concat(pageData);
      if (!pageData || pageData.length < PAGE_SIZE) break;
    }

    hideLoading();
    if (allData.length === 0) { showStatus('error', 'Sin datos en ' + name); return; }

    const geoColumns = detectGeoColumns(allData);
    if (geoColumns.length === 0) {
      showStatus('error', `"${name}" no tiene columna geometrica`);
      document.getElementById('geo-info-section').style.display = 'block';
      document.getElementById('geo-info-text').innerHTML = `Tabla: <strong>${esc(name)}</strong><br><span style="color:#f87171;">Sin columna geometrica</span>`;
      return;
    }

    const geoJSON = convertToGeoJSON(allData, geoColumns[0]);
    if (geoJSON.features.length === 0) {
      showStatus('error', 'No se pudieron parsear geometrias de: ' + geoColumns[0]);
      return;
    }

    const baseColor = getLayerColor(name);
    const geoLayer = createGeoJSONLayer(geoJSON, name, baseColor).addTo(map);

    let totalBounds;
    try { totalBounds = geoLayer.getBounds(); } catch (_) { totalBounds = null; }

    const layerInfo = {
      layer: geoLayer,
      geoCol: geoColumns[0],
      loadedCount: geoJSON.features.length,
      color: baseColor,
      visible: true,
      totalBounds: totalBounds,
      _allData: allData,
      labelLayerGroup: null,
      labelScaleMax: (LAYER_STYLES[name] && LAYER_STYLES[name].labelScaleMax) || 0
    };

    const labelGroup = buildLabelLayer(geoLayer, name);
    if (labelGroup) {
      layerInfo.labelLayerGroup = labelGroup;
    }

    activeLayers.set(name, layerInfo);
    layerControl.addOverlay(geoLayer, name);
    updateLabelVisibility();
    updateCreateBtn();

    const cache = getLoadedIds(name);
    for (const row of allData) {
      const id = getFeatureId(row);
      if (id) cache.set(id, row);
    }

    setTimeout(() => map.invalidateSize(), 150);

    renderLayersList();
    selectInfoLayer(name);
    updateSearchTableSelect();
    updateLegend();
    showStatus('success', `${geoJSON.features.length} features de "${name}" cargados`);

  } catch (err) {
    hideLoading();
    const msg = err.message || String(err);
    showStatus('error', msg);
    if (msg.includes('permission denied') || msg.includes('401')) {
      document.getElementById('setup-details').style.display = 'block';
    }
  }
}

function updateLabelVisibility() {
  if (!map) return;
  const scale = getMapScale();
  activeLayers.forEach((info) => {
    if (!info.labelLayerGroup) return;
    const scaleMax = info.labelScaleMax;
    if (scaleMax && scale > scaleMax) {
      if (map.hasLayer(info.labelLayerGroup)) map.removeLayer(info.labelLayerGroup);
    } else {
      if (!map.hasLayer(info.labelLayerGroup)) map.addLayer(info.labelLayerGroup);
    }
  });
}

function showFeatureInInfoPanel(layerName, props) {
  const panel = document.getElementById('feature-attr-panel');
  const section = document.getElementById('geo-info-section');
  section.style.display = 'block';
  const popupConfig = LAYER_POPUP_CONFIG[layerName];

  let html = `<div class="attr-panel-header" style="border-left:4px solid ${getLayerColor(layerName)};padding-left:8px;margin-bottom:6px;"><strong>${esc(layerName)}</strong></div>`;
  html += '<table class="attr-panel-table">';

  const fields = popupConfig && popupConfig.fields ? popupConfig.fields : null;
  const keys = Object.keys(props).filter(k => !/^(geom|geometry|the_geom|way|shape|geo|location)$/i.test(k));

  if (fields) {
    for (const f of fields) {
      if (f.auto) continue;
      const v = props[f.key];
      if (v === undefined) continue;
      let display;
      if (v === null || v === '') {
        display = '<em class="popup-null">Sin dato</em>';
      } else if (f.type === 'image' && v) {
        display = `<img src="${esc(String(v))}" class="popup-image" onerror="this.style.display='none'" onclick="openLightbox('${esc(String(v))}')" style="cursor:pointer">`;
      } else if (f.type === 'date' && v) {
        const d = new Date(v);
        display = isNaN(d.getTime()) ? esc(String(v)) : esc(d.toLocaleDateString('es-EC'));
      } else if (f.valueMap && f.valueMap[String(v)]) {
        display = esc(f.valueMap[String(v)]);
      } else {
        display = esc(String(v));
      }
      html += `<tr><td>${esc(f.label)}</td><td>${display}</td></tr>`;
    }
  } else {
    for (const k of keys) {
      const v = props[k];
      const display = v === null ? '<em class="popup-null">Sin dato</em>' : (typeof v === 'object' ? esc(JSON.stringify(v)) : esc(String(v)));
      html += `<tr><td>${esc(k)}</td><td>${display}</td></tr>`;
    }
  }

  html += '</table>';
  panel.innerHTML = html;
  document.getElementById('geo-info-text').innerHTML = `Tabla: <strong>${esc(layerName)}</strong>`;
  document.getElementById('geo-badge-container').innerHTML = '';
}

function createGeoJSONLayer(geoJSON, name, color) {
  const layerStyle = LAYER_STYLES[name];

  const style = (feature) => {
    if (layerStyle && layerStyle.styleForFeature) {
      return layerStyle.styleForFeature(feature.properties || {});
    }
    const t = feature.geometry ? feature.geometry.type : '';
    if (t.includes('Polygon') || t.includes('MultiPolygon')) {
      return { fillColor: color, fillOpacity: 0.3, color: color, weight: 2 };
    }
    if (t.includes('Line') || t.includes('MultiLine')) {
      return { color: color, weight: 3, opacity: 0.8 };
    }
    return { fillColor: color, fillOpacity: 0.8, color: '#fff', radius: 6, weight: 1 };
  };

  const pointToLayer = (feature, latlng) => {
    if (layerStyle && layerStyle.styleForFeature) {
      const s = layerStyle.styleForFeature(feature.properties || {});
      return L.circleMarker(latlng, { ...s, bubblingMouseEvents: true });
    }
    return L.circleMarker(latlng, { radius: 6, fillColor: color, fillOpacity: 0.8, color: '#fff', weight: 1 });
  };

  const onEachFeature = (feature, layer) => {
    const props = feature.properties || {};
    const popupConfig = LAYER_POPUP_CONFIG[name];

    let popup = `<div class="popup-header" style="border-left:4px solid ${color};padding-left:8px;margin-bottom:6px;"><strong>${esc(name)}</strong></div>`;

    if (popupConfig && popupConfig.fields) {
      popup += '<table class="popup-table">';
      for (const field of popupConfig.fields) {
        const v = props[field.key];
        if (v === undefined) continue;
        let display;
        if (v === null || v === '') {
          display = '<em class="popup-null">Sin dato</em>';
        } else if (field.type === 'image' && v) {
          display = `<img src="${esc(String(v))}" class="popup-image" onerror="this.style.display='none'" onclick="openLightbox('${esc(String(v))}')" style="cursor:pointer">`;
        } else if (field.type === 'date' && v) {
          const d = new Date(v);
          display = isNaN(d.getTime()) ? esc(String(v)) : esc(d.toLocaleDateString('es-EC'));
        } else if (field.valueMap && field.valueMap[String(v)]) {
          display = esc(field.valueMap[String(v)]);
        } else {
          display = esc(String(v));
        }
        popup += `<tr><td>${esc(field.label)}</td><td>${display}</td></tr>`;
      }
      popup += '</table>';
    } else {
      const keys = Object.keys(props).filter(k => !GEOM_PATTERNS.test(k));
      if (keys.length > 0) {
        popup += '<table class="popup-table">';
        for (const k of keys) {
          const v = props[k];
          const display = v === null ? '<em class="popup-null">Sin dato</em>' : (typeof v === 'object' ? esc(JSON.stringify(v)) : esc(String(v)));
          popup += `<tr><td>${esc(k)}</td><td>${display}</td></tr>`;
        }
        popup += '</table>';
      }
    }

    if (popup.includes('<td>')) {
      if (name === 'inspecciones' && props.gid != null) {
        const coords = feature.geometry && feature.geometry.coordinates;
        const lng = coords ? coords[0] : '';
        const lat = coords ? coords[1] : '';
        const storeKey = 'insp_' + props.gid;
        popupFeatureData[storeKey] = { props, lat, lng };
        popup += `<div style="margin-top:8px;text-align:center;display:flex;gap:8px;justify-content:center;"><button class="popup-edit-btn" onclick="openEditModal('${storeKey}')">Editar</button><button class="popup-delete-btn" onclick="deleteInspeccion('${storeKey}')">Eliminar</button></div>`;
      }
      layer.bindPopup(popup, { maxWidth: 360, maxHeight: 300 });
    }

    layer.on('click', function() {
      showFeatureInInfoPanel(name, props);
    });

    if (layerStyle) {
      if (layerStyle.tooltipField) {
        const val = props[layerStyle.tooltipField];
        if (val !== null && val !== undefined) {
          layer.bindTooltip(String(val), { permanent: false, direction: 'center', sticky: true });
        }
      }
      if (layerStyle.labelField) {
        const val = props[layerStyle.labelField];
        if (val !== null && val !== undefined) {
          layer._labelText = String(val);
          layer._labelDir = layerStyle.labelDirection || 'center';
        }
      } else if (layerStyle.labelExpression) {
        const val = layerStyle.labelExpression(props);
        if (val && val.length > 3) {
          layer._labelText = val;
          layer._labelDir = layerStyle.labelDirection || 'center';
        }
      } else if (layerStyle.labelFields) {
        const labels = layerStyle.labelFields
          .filter(lf => lf.condition(props))
          .map(lf => String(props[lf.field]))
          .filter(v => v && v !== 'null');
        if (labels.length > 0) {
          layer._labelText = labels.join(' | ');
          layer._labelDir = layerStyle.labelDirection || 'center';
        }
      }
    }
  };

  return L.geoJSON(geoJSON, { style, pointToLayer, onEachFeature, bubblingMouseEvents: true });
}

function buildLabelLayer(geoLayer, name) {
  const layerStyle = LAYER_STYLES[name];
  if (!layerStyle) return null;
  const hasLabels = layerStyle.labelField || layerStyle.labelExpression || layerStyle.labelFields;
  if (!hasLabels) return null;

  const group = L.layerGroup();
  const dir = layerStyle.labelDirection || 'center';

  geoLayer.eachLayer((layer) => {
    if (!layer._labelText) return;
    const props = layer.feature ? layer.feature.properties : {};
    let latlng;
    if (layer.getLatLng) {
      latlng = layer.getLatLng();
    } else if (layer.getBounds) {
      latlng = layer.getBounds().getCenter();
    }
    if (!latlng) return;

    const anchorMap = {
      right: 'left',
      left: 'right',
      top: 'center',
      bottom: 'center',
      center: 'center'
    };
    const anchor = anchorMap[dir] || 'center';

    const icon = L.divIcon({
      className: 'layer-label layer-label-' + dir,
      html: '<span>' + esc(layer._labelText) + '</span>',
      iconSize: null,
      iconAnchor: anchor === 'center' ? [0, 0] : undefined
    });

    group.addLayer(L.marker(latlng, { icon, interactive: false, bubblingMouseEvents: true }));
  });

  return group;
}

const LegendControl = L.Control.extend({
  onAdd() {
    const div = L.DomUtil.create('div', 'leaflet-control legend-control');
    div.innerHTML = '<div class="legend-title">Simbologia</div><div id="legend-content"></div>';
    return div;
  }
});

let legendControl;

function updateLegend() {
  const container = document.getElementById('legend-content');
  if (!container) return;
  container.innerHTML = '';

  activeLayers.forEach((info, name) => {
    const layerStyle = LAYER_STYLES[name];
    if (!layerStyle || !layerStyle.legendItems) return;

    const group = document.createElement('div');
    group.className = 'legend-group';
    group.innerHTML = `<div class="legend-layer-name">${esc(name)}</div>`;

    layerStyle.legendItems.forEach(item => {
      const row = document.createElement('div');
      row.className = 'legend-item';

      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';

      if (item.type === 'circle') {
        swatch.style.cssText = `background:${item.fill};border-radius:50%;width:12px;height:12px;border:1px solid #555;`;
      } else if (item.type === 'line') {
        const w = item.weight || 3;
        swatch.style.cssText = `background:transparent;border-top:${w}px solid ${item.fill};width:16px;height:0;margin-top:6px;border-radius:0;`;
      } else if (item.type === 'outline') {
        swatch.style.cssText = `background:transparent;border:2px solid ${item.outline};width:14px;height:14px;border-radius:2px;`;
      } else {
        swatch.style.cssText = `background:${item.fill};border:1px solid ${item.outline || '#555'};width:14px;height:14px;border-radius:2px;`;
        if (item.dashArray) swatch.style.borderStyle = 'dashed';
      }

      const label = document.createElement('span');
      label.className = 'legend-label';
      label.textContent = item.label;

      row.appendChild(swatch);
      row.appendChild(label);
      group.appendChild(row);
    });

    container.appendChild(group);
  });
}

let searchHighlightMarker = null;

function performSearch() {
  const sel = document.getElementById('search-table-select');
  const tableName = sel.value;
  const query = document.getElementById('search-input').value.trim();
  const resultsDiv = document.getElementById('search-results');

  if (!tableName) { resultsDiv.innerHTML = ''; return; }
  if (!query) { resultsDiv.innerHTML = '<p style="color:#666;font-size:11px;">Escriba algo para buscar.</p>'; return; }

  const info = activeLayers.get(tableName);
  if (!info || !info._allData) {
    resultsDiv.innerHTML = '<p style="color:#fbbf24;font-size:11px;">Cargue la capa primero.</p>';
    return;
  }

  const lowerQuery = query.toLowerCase();
  const matches = [];
  const seenIds = new Set();

  for (const row of info._allData) {
    const id = getFeatureId(row);
    if (id && seenIds.has(id)) continue;

    const matchFields = [];
    for (const [key, val] of Object.entries(row)) {
      if (GEOM_PATTERNS.test(key)) continue;
      if (val === null || val === undefined) continue;
      const strVal = String(val).toLowerCase();
      if (strVal.includes(lowerQuery)) {
        matchFields.push(key);
      }
    }

    if (matchFields.length > 0) {
      if (id) seenIds.add(id);
      matches.push({ id, row, matchFields });
    }
  }

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<p style="color:#f87171;font-size:11px;">Sin resultados para "' + esc(query) + '"</p>';
    return;
  }

  let html = '<div class="search-count">' + matches.length + ' resultado(s)</div>';
  matches.forEach(({ id, row, matchFields }, idx) => {
    const label = matchFields.map(k => k + ': ' + String(row[k]).substring(0, 40)).join(' | ');
    const detail = matchFields.join(', ');
    html += '<div class="search-item" data-idx="' + idx + '">' +
      '<div class="item-label">' + esc(label) + '</div>' +
      '<div class="item-detail">Coincide en: ' + esc(detail) + '</div>' +
      '</div>';
  });

  resultsDiv.innerHTML = html;

  resultsDiv.querySelectorAll('.search-item').forEach((el, idx) => {
    el.addEventListener('click', () => {
      const { row } = matches[idx];
      zoomToFeature(row, tableName);
    });
  });
}

function zoomToFeature(row, tableName) {
  const info = activeLayers.get(tableName);
  const geoCol = info?.geoCol || 'geom';
  const g = row[geoCol];
  if (!g) { showStatus('info', 'Feature sin geometria'); return; }

  const parsed = parseGeoJSON(g);
  if (!parsed || !parsed.geometry) return;
  const geom = parsed.geometry;

  let coords;
  if (geom.type === 'Point') coords = geom.coordinates;
  else if (geom.coordinates) coords = geom.coordinates.flat(Infinity).slice(0, 2);
  else return;

  const latlng = L.latLng(coords[1], coords[0]);
  map.setView(latlng, Math.max(map.getZoom(), 16));

  if (searchHighlightMarker) { map.removeLayer(searchHighlightMarker); searchHighlightMarker = null; }

  const targetFeatureId = getFeatureId(row);
  let targetLayer = null;
  if (info && info.layer) {
    info.layer.eachLayer((layer) => {
      const lid = layer.feature ? getFeatureId(layer.feature.properties) : '';
      if (String(lid) === String(targetFeatureId)) targetLayer = layer;
    });
  }

  if (targetLayer && targetLayer.setStyle) {
    const originalStyle = {};
    const flashColor = '#f59e0b';
    const flashStyle = { color: flashColor, weight: 4, opacity: 1, fillOpacity: 0.4, fillColor: flashColor };
    let flashes = 0;
    const maxFlashes = 6;
    const interval = setInterval(() => {
      if (!targetLayer || flashes >= maxFlashes) {
        clearInterval(interval);
        if (targetLayer && targetLayer.setStyle) {
          const ls = LAYER_STYLES[tableName];
          if (ls && ls.styleForFeature) {
            targetLayer.setStyle(ls.styleForFeature(row));
          } else {
            targetLayer.setStyle({ weight: 1, opacity: 0.8 });
          }
        }
        return;
      }
      if (flashes % 2 === 0) {
        targetLayer.setStyle(flashStyle);
      } else {
        if (targetLayer.setStyle) {
          const ls = LAYER_STYLES[tableName];
          if (ls && ls.styleForFeature) {
            targetLayer.setStyle(ls.styleForFeature(row));
          } else {
            targetLayer.setStyle({ weight: 1, opacity: 0.8 });
          }
        }
      }
      flashes++;
    }, 300);
  }

  searchHighlightMarker = null;
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  if (searchHighlightMarker) { map.removeLayer(searchHighlightMarker); searchHighlightMarker = null; }
}

function cancelPickLocation() {
  exitCreateMode();
  document.getElementById('pick-location-bar').classList.remove('show');
  pickedLatLng = null;
  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
  showStatus('info', 'Creacion cancelada');
}

function openCreateModal() {
  if (!activeLayers.has('inspecciones')) return;
  pickedLatLng = null;
  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
  editingRecordId = null;
  createPhase = 'picking';
  enterCreateMode();
  document.getElementById('pick-location-bar').classList.add('show');
  showStatus('info', 'Seleccione la ubicacion en el mapa haciendo clic');
}

const popupFeatureData = {};
let editingRecordId = null;

function openEditModal(storeKey) {
  const data = popupFeatureData[storeKey];
  if (!data) return;
  const props = data.props;
  const formConfig = LAYER_FORM_CONFIG.inspecciones;
  editingRecordId = props.gid;

  currentTableColumns = Object.keys(props);
  const GEOM_COL_PATTERNS = /^(geom|geometry|the_geom|way|shape|geo|location)$/i;
  currentGeomColName = currentTableColumns.find(c => GEOM_COL_PATTERNS.test(c)) || null;

  if (data.lat && data.lng) {
    pickedLatLng = L.latLng(data.lat, data.lng);
  }

  const modal = document.getElementById('create-modal');
  const formFields = document.getElementById('modal-form-fields');
  document.getElementById('modal-title').textContent = 'Editar registro - inspecciones';
  formFields.innerHTML = '';

  if (formConfig) {
    formConfig.fields.forEach(f => {
      const val = props[f.key] != null ? String(props[f.key]) : '';
      const label = document.createElement('label');
      label.textContent = f.label;
      formFields.appendChild(label);

      if (f.auto) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + f.key;
        inp.value = val;
        inp.disabled = true;
        inp.style.opacity = '0.4';
        formFields.appendChild(inp);
      } else if (f.type === 'date') {
        const inp = document.createElement('input');
        inp.type = 'date';
        inp.id = 'field-' + f.key;
        if (val) {
          const d = new Date(val);
          inp.value = isNaN(d.getTime()) ? val : d.toISOString().split('T')[0];
        }
        formFields.appendChild(inp);
      } else if (f.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.id = 'field-' + f.key;
        ta.placeholder = f.label;
        ta.rows = 3;
        ta.value = val;
        formFields.appendChild(ta);
      } else if (f.type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'image-field-wrap';
        wrap.id = 'field-wrap-' + f.key;
        if (val) {
          const preview = document.createElement('img');
          preview.src = val;
          preview.className = 'image-preview';
          preview.onerror = () => preview.style.display = 'none';
          wrap.appendChild(preview);
        }
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.id = 'field-' + f.key;
        inp.className = 'image-input';
        inp.addEventListener('change', function() {
          const existing = wrap.querySelector('.image-preview');
          if (this.files && this.files.length > 0) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (existing) { existing.src = ev.target.result; existing.style.display = 'block'; }
              else { const p = document.createElement('img'); p.src = ev.target.result; p.className = 'image-preview'; wrap.insertBefore(p, inp); }
            };
            reader.readAsDataURL(this.files[0]);
          }
        });
        wrap.appendChild(inp);
        const hint = document.createElement('small');
        hint.className = 'image-hint';
        hint.textContent = val ? 'Seleccione nueva imagen para cambiar' : 'Seleccione una imagen';
        wrap.appendChild(hint);
        formFields.appendChild(wrap);
      } else if (f.type === 'select') {
        const sel = document.createElement('select');
        sel.id = 'field-' + f.key;
        sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
          Object.entries(f.options).map(([optVal, lbl]) =>
            `<option value="${optVal}">${lbl}</option>`
          ).join('');
        sel.value = val;
        formFields.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + f.key;
        inp.placeholder = f.label;
        inp.value = val;
        formFields.appendChild(inp);
      }
    });
  }

  if (currentGeomColName) {
    const geomDiv = document.createElement('div');
    geomDiv.className = 'geom-picker';
    geomDiv.innerHTML = `
      <p>Ubicacion en el mapa (${currentGeomColName})</p>
      <div class="coords" id="geom-coords"></div>
      <button type="button" class="btn-edit-geom" id="btn-edit-location">Cambiar ubicacion</button>
    `;
    formFields.appendChild(geomDiv);
    geomDiv.querySelector('#btn-edit-location').addEventListener('click', editLocation);
    updateGeomDisplay();
  }

  modal.classList.add('show');
}

function editLocation() {
  document.getElementById('create-modal').classList.remove('show');
  createPhase = 'editing';
  enterCreateMode();
  document.getElementById('pick-location-bar').classList.add('show');
  showStatus('info', 'Haga clic en el mapa para cambiar la ubicacion');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('show');
  exitCreateMode();
  document.getElementById('pick-location-bar').classList.remove('show');
  pickedLatLng = null;
  editingRecordId = null;
  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
}

function stampImage(file, latlng, clvCat) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const barH = Math.max(40, Math.round(img.height * 0.06));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, img.height - barH, img.width, barH);

        const fontSize = Math.max(14, Math.round(barH * 0.42));
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';

        const lat = latlng.lat.toFixed(6);
        const lng = latlng.lng.toFixed(6);
        const parts = ['EPMAPAQ'];
        if (clvCat) parts.push(`Clv: ${clvCat}`);
        parts.push(`${lat}, ${lng}`);
        const text = parts.join('  |  ');

        let textW = ctx.measureText(text).width;
        if (textW > img.width - 20) {
          const scale = (img.width - 20) / textW;
          ctx.font = `bold ${Math.round(fontSize * scale)}px Arial, sans-serif`;
          textW = ctx.measureText(text).width;
        }
        const tx = (img.width - textW) / 2;
        const ty = img.height - barH / 2;
        ctx.fillText(text, tx, ty);

        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.90);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveRecord() {
  if (!pickedLatLng) {
    showStatus('error', 'Debe seleccionar un punto en el mapa');
    return;
  }

  const btn = document.getElementById('btn-save-record');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  const formConfig = LAYER_FORM_CONFIG[currentTable] || LAYER_FORM_CONFIG['inspecciones'];
  const imageFields = formConfig ? formConfig.fields.filter(f => f.type === 'image') : [];

  for (const imgField of imageFields) {
    const wrap = document.getElementById('field-wrap-' + imgField.key);
    const fileInputs = wrap ? wrap.querySelectorAll('.image-input[type="file"]') : [document.getElementById('field-' + imgField.key)];
    let fileInput = null;
    for (const inp of fileInputs) {
      if (inp.files && inp.files.length > 0) { fileInput = inp; break; }
    }
    const file = fileInput ? fileInput.files[0] : (cameraCaptureFile || null);
    if (file) {
      btn.textContent = 'Subiendo imagen...';
      cameraCaptureFile = null;
      const ext = file.name.split('.').pop();
      const path = `inspecciones/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const clvEl = document.getElementById('field-clv_cat');
      const clvVal = clvEl ? clvEl.value.trim() : '';
      const watermarkedBlob = await stampImage(file, pickedLatLng, clvVal);

      const { error: uploadError } = await supabasePublic.storage
        .from(FOTO_BUCKET)
        .upload(path, watermarkedBlob, { contentType: watermarkedBlob.type || 'image/png' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabasePublic.storage
        .from(FOTO_BUCKET)
        .getPublicUrl(path);
      imgField._uploadUrl = urlData.publicUrl;
    }
  }

  const record = {};
  for (const col of currentTableColumns) {
    if (col === currentGeomColName) continue;
    const imgDef = imageFields.find(f => f.key === col);
    if (imgDef && imgDef._uploadUrl) {
      record[col] = imgDef._uploadUrl;
      delete imgDef._uploadUrl;
      continue;
    }
    const el = document.getElementById('field-' + col);
    if (!el) continue;
    if (el.type === 'file') continue;
    const val = el.value.trim();
    if (val === '' && el.disabled) continue;
    if (val !== '') record[col] = val;
  }

  if (currentGeomColName) {
    const wkt = `SRID=4326;POINT(${pickedLatLng.lng} ${pickedLatLng.lat})`;
    record[currentGeomColName] = wkt;
  }

  try {
    let error;
    if (editingRecordId) {
      ({ error } = await supabaseClient.from('inspecciones').update(record).eq('gid', editingRecordId));
    } else {
      ({ error } = await supabaseClient.from('inspecciones').insert(record).select());
    }
    if (error) throw error;
    showStatus('success', editingRecordId ? 'Registro actualizado exitosamente' : 'Registro guardado exitosamente');
    closeCreateModal();
    unloadInspecciones();
    loadTable('inspecciones');
  } catch (err) {
    showStatus('error', 'Error al guardar: ' + (err.message || err));
  }

  btn.disabled = false;
  btn.textContent = 'Guardar';
}

document.getElementById('btn-search').addEventListener('click', performSearch);
document.getElementById('btn-clear-search').addEventListener('click', clearSearch);
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') performSearch();
});
document.getElementById('search-table-select').addEventListener('change', clearSearch);
document.getElementById('create-btn').addEventListener('click', openCreateModal);
document.getElementById('btn-close-modal').addEventListener('click', closeCreateModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeCreateModal);
document.getElementById('btn-save-record').addEventListener('click', saveRecord);
document.getElementById('btn-cancel-pick').addEventListener('click', cancelPickLocation);

function onMapClick(e) {
  if (!isCreateMode) return;
  pickedLatLng = e.latlng;
  if (tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker(pickedLatLng, {
    bubblingMouseEvents: true,
    icon: L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,0.5);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    })
  }).addTo(map);
  tempMarker.bindPopup(`<b>Punto seleccionado</b><br>${pickedLatLng.lat.toFixed(6)}, ${pickedLatLng.lng.toFixed(6)}`).openPopup();

  if (createPhase === 'picking') {
    exitCreateMode();
    document.getElementById('pick-location-bar').classList.remove('show');
    showOpenFormModal().then(() => autofillFromCatastro(pickedLatLng));
  } else if (createPhase === 'editing') {
    exitCreateMode();
    document.getElementById('pick-location-bar').classList.remove('show');
    reopenModalWithCoords();
    autofillFromCatastro(pickedLatLng);
  }
}

function updateGeomDisplay() {
  const el = document.getElementById('geom-coords');
  if (!el) return;
  if (pickedLatLng) {
    el.textContent = `Lat: ${pickedLatLng.lat.toFixed(6)} | Lng: ${pickedLatLng.lng.toFixed(6)}`;
  } else {
    el.textContent = 'No seleccionado';
  }
}

function pointInPolygon(point, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i][0], yi = coords[i][1];
    const xj = coords[j][0], yj = coords[j][1];
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function findCatastroAtPoint(latlng) {
  const info = activeLayers.get('catastro');
  if (!info || !info.layer) return null;
  const pt = [latlng.lng, latlng.lat];
  let found = null;
  info.layer.eachLayer(layer => {
    if (found) return;
    if (layer.feature && layer.feature.geometry) {
      const geom = layer.feature.geometry;
      if (geom.type === 'Polygon') {
        if (pointInPolygon(pt, geom.coordinates[0])) found = layer.feature.properties;
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (pointInPolygon(pt, poly[0])) { found = layer.feature.properties; break; }
        }
      }
    }
  });
  return found;
}

function autofillFromCatastro(latlng) {
  const props = findCatastroAtPoint(latlng);
  if (!props) return;
  const clvEl = document.getElementById('field-clv_cat');
  const usrEl = document.getElementById('field-usuario');
  if (clvEl && props.clave_nuev) { clvEl.value = props.clave_nuev; }
  if (usrEl && props.nombres) { usrEl.value = props.nombres; }
}

async function fetchTableColumns() {
  try {
    const { data } = await supabaseClient.from('inspecciones').select('*').limit(1);
    if (data && data.length > 0) return Object.keys(data[0]);
  } catch (_) {}

  try {
    const { data: colsData } = await supabasePublic
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', SCHEMA)
      .eq('table_name', 'inspecciones')
      .order('ordinal_position');
    if (colsData && colsData.length > 0) return colsData.map(c => c.column_name);
  } catch (_) {}

  try {
    const { data: rpcData } = await supabaseClient.rpc('get_table_columns', { p_table: 'inspecciones' });
    if (rpcData && rpcData.length > 0) return rpcData.map(c => c.column_name || c);
  } catch (_) {}

  return ['id', 'nombre', 'descripcion', 'fecha', 'geom'];
}

function buildFormFields(formFields, columns, existingValues) {
  formFields.innerHTML = '';
  const GEOM_COL_PATTERNS = /^(geom|geometry|the_geom|way|shape|geo|location)$/i;
  currentTableColumns = columns;
  currentGeomColName = columns.find(c => GEOM_COL_PATTERNS.test(c)) || null;

  const formConfig = LAYER_FORM_CONFIG[currentTable];

  if (formConfig) {
    currentTableColumns = formConfig.fields.map(f => f.key);
    if (currentGeomColName) currentTableColumns.push(currentGeomColName);
    formConfig.fields.forEach(f => {
      const savedVal = existingValues ? (existingValues[f.key] || '') : '';
      const label = document.createElement('label');
      label.textContent = f.label;
      formFields.appendChild(label);

      if (f.auto) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + f.key;
        inp.value = '';
        inp.disabled = true;
        inp.placeholder = 'Auto-generado';
        inp.style.opacity = '0.4';
        formFields.appendChild(inp);
      } else if (f.type === 'date') {
        const inp = document.createElement('input');
        inp.type = 'date';
        inp.id = 'field-' + f.key;
        if (savedVal) inp.value = savedVal;
        formFields.appendChild(inp);
      } else if (f.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.id = 'field-' + f.key;
        ta.placeholder = f.label;
        ta.rows = 3;
        if (savedVal) ta.value = savedVal;
        formFields.appendChild(ta);
      } else if (f.type === 'image') {
        const wrap = document.createElement('div');
        wrap.className = 'image-field-wrap';
        wrap.id = 'field-wrap-' + f.key;
        if (savedVal) {
          const preview = document.createElement('img');
          preview.src = savedVal;
          preview.className = 'image-preview';
          preview.onerror = () => preview.style.display = 'none';
          wrap.appendChild(preview);
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'image-btn-row';

        const galleryBtn = document.createElement('button');
        galleryBtn.type = 'button';
        galleryBtn.className = 'image-btn image-btn-gallery';
        galleryBtn.textContent = 'Elegir archivo';

        const cameraBtn = document.createElement('button');
        cameraBtn.type = 'button';
        cameraBtn.className = 'image-btn image-btn-camera';
        cameraBtn.textContent = 'Tomar foto';

        const galleryInput = document.createElement('input');
        galleryInput.type = 'file';
        galleryInput.accept = 'image/*';
        galleryInput.id = 'field-' + f.key;
        galleryInput.className = 'image-input';
        galleryInput.style.display = 'none';

        function showPreview(file) {
          if (!file) return;
          const existing = wrap.querySelector('.image-preview');
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (existing) { existing.src = ev.target.result; existing.style.display = 'block'; }
            else { const p = document.createElement('img'); p.src = ev.target.result; p.className = 'image-preview'; wrap.insertBefore(p, btnRow); }
          };
          reader.readAsDataURL(file);
        }

        galleryInput.addEventListener('change', function() {
          if (this.files && this.files.length > 0) {
            cameraCaptureFile = null;
            showPreview(this.files[0]);
          }
        });

        galleryBtn.addEventListener('click', () => galleryInput.click());

        cameraBtn.addEventListener('click', () => {
          openCameraModal((file) => {
            galleryInput.value = '';
            cameraCaptureFile = file;
            showPreview(file);
          });
        });

        btnRow.appendChild(galleryBtn);
        btnRow.appendChild(cameraBtn);
        wrap.appendChild(btnRow);
        wrap.appendChild(galleryInput);
        const hint = document.createElement('small');
        hint.className = 'image-hint';
        hint.textContent = savedVal ? 'Seleccione nueva imagen para cambiar' : 'Archivo o camara';
        wrap.appendChild(hint);
        formFields.appendChild(wrap);
      } else if (f.type === 'select') {
        const sel = document.createElement('select');
        sel.id = 'field-' + f.key;
        sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
          Object.entries(f.options).map(([val, lbl]) =>
            `<option value="${val}">${lbl}</option>`
          ).join('');
        if (savedVal) sel.value = savedVal;
        formFields.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + f.key;
        inp.placeholder = f.label;
        if (savedVal) inp.value = savedVal;
        formFields.appendChild(inp);
      }
    });
  } else {
    const IGNORE_COLS = /^(id|gid|objectid|ogc_fid|created_at|updated_at|inserted_at)$/i;
    columns.forEach(col => {
      if (currentGeomColName && col === currentGeomColName) return;
      const isId = IGNORE_COLS.test(col);
      const savedVal = existingValues ? (existingValues[col] || '') : '';
      const label = document.createElement('label');
      label.textContent = col + (isId ? ' (auto/ID)' : '');
      formFields.appendChild(label);
      if (isId) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + col;
        inp.placeholder = 'Generado automaticamente (dejar vacio)';
        inp.disabled = true;
        inp.style.opacity = '0.4';
        formFields.appendChild(inp);
      } else if (/^(fecha|date|timestamp|created|updated)/i.test(col)) {
        const inp = document.createElement('input');
        inp.type = 'datetime-local';
        inp.id = 'field-' + col;
        if (savedVal) inp.value = savedVal;
        formFields.appendChild(inp);
      } else if (/^(descripcion|observacion|obs|nota|comment|detalle)/i.test(col)) {
        const ta = document.createElement('textarea');
        ta.id = 'field-' + col;
        ta.placeholder = 'Ingrese ' + col;
        if (savedVal) ta.value = savedVal;
        formFields.appendChild(ta);
      } else if (/^(tipo|category|estado|status|clase)/i.test(col)) {
        const sel = document.createElement('select');
        sel.id = 'field-' + col;
        sel.innerHTML = '<option value="">-- Seleccionar --</option><option value="Pendiente">Pendiente</option><option value="Aprobado">Aprobado</option><option value="Rechazado">Rechazado</option><option value="En proceso">En proceso</option>';
        if (savedVal) sel.value = savedVal;
        formFields.appendChild(sel);
      } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.id = 'field-' + col;
        inp.placeholder = 'Ingrese ' + col;
        if (savedVal) inp.value = savedVal;
        formFields.appendChild(inp);
      }
    });
  }

  if (currentGeomColName) {
    const geomDiv = document.createElement('div');
    geomDiv.className = 'geom-picker';
    geomDiv.innerHTML = `
      <p>Ubicacion en el mapa (${currentGeomColName})</p>
      <div class="coords" id="geom-coords">No seleccionado</div>
      <button type="button" class="btn-edit-geom" id="btn-edit-location">Cambiar ubicacion</button>
    `;
    formFields.appendChild(geomDiv);
    geomDiv.querySelector('#btn-edit-location').addEventListener('click', editLocation);
  }

  updateGeomDisplay();
}

async function showOpenFormModal() {
  currentTable = 'inspecciones';
  const modal = document.getElementById('create-modal');
  const formFields = document.getElementById('modal-form-fields');
  document.getElementById('modal-title').textContent = 'Nuevo registro - inspecciones';
  formFields.innerHTML = '<p style="color:#888;font-size:12px;">Cargando campos...</p>';
  modal.classList.add('show');
  const columns = await fetchTableColumns();
  buildFormFields(formFields, columns, null);
}

function reopenModalWithCoords() {
  const formFields = document.getElementById('modal-form-fields');
  const existingValues = {};
  for (const col of currentTableColumns) {
    if (currentGeomColName && col === currentGeomColName) continue;
    const el = document.getElementById('field-' + col);
    if (el) existingValues[col] = el.value;
  }
  buildFormFields(formFields, currentTableColumns, existingValues);
  document.getElementById('create-modal').classList.add('show');
}

function enterCreateMode() {
  if (!map) return;
  isCreateMode = true;
  map.getContainer().classList.add('map-click-active');
  map.on('click', onMapClick);
}

function exitCreateMode() {
  if (!map) return;
  isCreateMode = false;
  map.getContainer().classList.remove('map-click-active');
  map.off('click', onMapClick);
}

const routeState = {
  points: [],
  markers: [],
  routeLine: null,
  routeClickMode: false,
  generatedLink: '',
  dragIdx: null
};

function openRoutePanel() {
  document.getElementById('route-panel').classList.add('open');
  loadDefaultRoutePoints();
}

function closeRoutePanel() {
  document.getElementById('route-panel').classList.remove('open');
  exitRouteClickMode();
}

function exitRouteClickMode() {
  routeState.routeClickMode = false;
  map.getContainer().classList.remove('map-click-active');
  map.off('click', onRouteMapClick);
  document.getElementById('mode-click').classList.remove('active');
  document.getElementById('mode-coords').classList.add('active');
  showRouteInputSection('coords');
}

function showRouteInputSection(mode) {
  document.querySelectorAll('.route-input-section').forEach(s => s.style.display = 'none');
  document.getElementById('route-input-' + mode).style.display = 'flex';
}

async function resolveGoogleMapsShortLink(url) {
  if (!url.includes('maps.app.goo.gl') && !url.includes('goo.gl/maps')) return null;

  const timeout = window.location.hostname === 'localhost' ? 20000 : 25000;

  const proxies = [
    (u) => PROXY_BASE + '?url=' + encodeURIComponent(u),
  ];

  for (const buildUrl of proxies) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const resp = await fetch(buildUrl(url), { signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.ok && data.url) return data.url;
    } catch (_) {}
  }
  return null;
}

function decodeHTML(s) {
  return s.replace(/&amp;/g, '&').replace(/%2B/gi, '+').replace(/%2C/gi, ',');
}

function parseGoogleMapsLink(url) {
  const decoded = url.replace(/%2B/gi, '+').replace(/%2C/gi, ',');
  const patterns = [
    /maps\/search\/(-?\d+\.?\d*)\s*,\s*\+?(-?\d+\.?\d*)/,
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /!2d(-?\d+\.?\d*),!3d(-?\d+\.?\d*)/,
    /!3d(-?\d+\.?\d*),!2d(-?\d+\.?\d*)/,
    /!1d(-?\d+\.?\d*),!2d(-?\d+\.?\d*)/,
    /!2d(-?\d+\.?\d*),!1d(-?\d+\.?\d*)/,
    /q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /center=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /place\/[^@]*@(-?\d+\.?\d*),(-?\d+\.?\d*)/
  ];
  for (const pat of patterns) {
    const m = decoded.match(pat);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  try {
    const u = new URL(decoded);
    const ll = u.searchParams.get('ll') || u.searchParams.get('center');
    if (ll) {
      const parts = ll.split(',');
      if (parts.length === 2) return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
    }
  } catch (_) {}
  return null;
}

function getCentroid(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === 'Point') return { lat: geom.coordinates[1], lng: geom.coordinates[0] };
  let coords;
  if (geom.type === 'Polygon') coords = geom.coordinates[0];
  else if (geom.type === 'MultiPolygon') coords = geom.coordinates[0][0];
  else return null;
  let cx = 0, cy = 0, n = coords.length;
  for (const c of coords) { cx += c[0]; cy += c[1]; }
  return { lat: cy / n, lng: cx / n };
}

function addRoutePoint(lat, lng, label, type) {
  const idx = routeState.points.length;
  const point = { lat, lng, label: label || `Punto ${idx + 1}`, type: type || 'stop' };
  routeState.points.push(point);
  renderRoutePoints();
  updateRouteMarkers();
}

function removeRoutePoint(idx) {
  routeState.points.splice(idx, 1);
  renderRoutePoints();
  updateRouteMarkers();
}

function moveRoutePoint(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= routeState.points.length) return;
  const temp = routeState.points[idx];
  routeState.points[idx] = routeState.points[newIdx];
  routeState.points[newIdx] = temp;
  reorderRoutePointsDOM(idx, newIdx);
  updateRouteMarkers();
}

function reorderRoutePointsDOM(fromIdx, toIdx) {
  const list = document.getElementById('route-points-list');
  const count = document.getElementById('route-point-count');
  const items = Array.from(list.querySelectorAll('.route-point-item'));

  const firstRects = items.map(el => el.getBoundingClientRect());

  const moved = items[fromIdx];
  if (toIdx > fromIdx) {
    list.insertBefore(moved, items[toIdx].nextSibling);
  } else {
    list.insertBefore(moved, items[toIdx]);
  }

  const afterItems = Array.from(list.querySelectorAll('.route-point-item'));
  afterItems.forEach((el, i) => {
    const lastRect = el.getBoundingClientRect();
    const firstRect = firstRects[items.indexOf(el)];
    if (firstRect) {
      const dy = firstRect.top - lastRect.top;
      if (Math.abs(dy) > 1) {
        el.style.transform = `translateY(${dy}px)`;
        el.style.transition = 'none';
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.3s ease';
          el.style.transform = '';
          el.addEventListener('transitionend', () => {
            el.style.transition = '';
          }, { once: true });
        });
      }
    }
  });

  afterItems.forEach((el, i) => {
    el.dataset.idx = i;
    const marker = el.querySelector('.route-point-marker');
    const isFirst = i === 0;
    const isLast = i === routeState.points.length - 1 && routeState.points.length > 1;
    marker.className = 'route-point-marker ' + (isFirst ? 'start' : isLast ? 'end' : 'stop');
    marker.textContent = isFirst ? 'I' : isLast ? 'F' : i;
    el.className = 'route-point-item ' + (isFirst ? 'point-start' : isLast ? 'point-end' : 'point-stop');
    const label = el.querySelector('.route-point-label');
    if (label) label.dataset.idx = i;
    const zoomBtn = el.querySelector('.route-point-zoom');
    if (zoomBtn) zoomBtn.dataset.idx = i;
    const delBtn = el.querySelector('.route-point-del');
    if (delBtn) delBtn.dataset.idx = i;
  });

  count.textContent = routeState.points.length;
  document.getElementById('btn-trazar-ruta').disabled = routeState.points.length < 2;
}

let routeFlashLayer = null;

function zoomAndFlashPoint(idx) {
  const pt = routeState.points[idx];
  if (!pt) return;
  map.setView([pt.lat, pt.lng], Math.max(map.getZoom(), 18));

  const latlng = L.latLng(pt.lat, pt.lng);
  let closestLayer = null;
  let closestDist = Infinity;

  activeLayers.forEach((info) => {
    if (!info.visible || !info.layer) return;
    info.layer.eachLayer((layer) => {
      let layerLatlng;
      if (layer.getLatLng) layerLatlng = layer.getLatLng();
      else if (layer.getBounds) layerLatlng = layer.getBounds().getCenter();
      if (!layerLatlng) return;
      const dist = latlng.distanceTo(layerLatlng);
      if (dist < closestDist) { closestDist = dist; closestLayer = layer; }
    });
  });

  if (closestLayer && closestDist < 500 && closestLayer.setStyle) {
    const flashColor = '#f59e0b';
    const flashStyle = { color: flashColor, weight: 4, opacity: 1, fillOpacity: 0.4, fillColor: flashColor };
    let flashes = 0;
    const maxFlashes = 6;
    const interval = setInterval(() => {
      if (!closestLayer || flashes >= maxFlashes) {
        clearInterval(interval);
        if (closestLayer && closestLayer.setStyle) {
          const tableName = activeLayers.keys().next().value;
          for (const [name, info] of activeLayers) {
            if (info.layer && closestLayer._map) {
              info.layer.eachLayer((l) => {
                if (l === closestLayer) {
                  const ls = LAYER_STYLES[name];
                  if (ls && ls.styleForFeature && closestLayer.feature) {
                    closestLayer.setStyle(ls.styleForFeature(closestLayer.feature.properties));
                  }
                }
              });
            }
          }
        }
        return;
      }
      if (flashes % 2 === 0) closestLayer.setStyle(flashStyle);
      else {
        for (const [name, info] of activeLayers) {
          if (info.layer) {
            info.layer.eachLayer((l) => {
              if (l === closestLayer && l.setStyle && l.feature) {
                const ls = LAYER_STYLES[name];
                if (ls && ls.styleForFeature) l.setStyle(ls.styleForFeature(l.feature.properties));
              }
            });
          }
        }
      }
      flashes++;
    }, 300);
  }
}

function renderRoutePoints() {
  const list = document.getElementById('route-points-list');
  const count = document.getElementById('route-point-count');
  count.textContent = routeState.points.length;
  list.innerHTML = '';

  routeState.points.forEach((pt, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === routeState.points.length - 1 && routeState.points.length > 1;
    const cls = isFirst ? 'point-start' : isLast ? 'point-end' : 'point-stop';
    const markerCls = isFirst ? 'start' : isLast ? 'end' : 'stop';
    const markerText = isFirst ? 'I' : isLast ? 'F' : idx;

    const item = document.createElement('div');
    item.className = 'route-point-item ' + cls;
    item.draggable = true;
    item.dataset.idx = idx;

    item.innerHTML = `
      <div class="route-drag-handle">&#9776;</div>
      <div class="route-point-marker ${markerCls}">${markerText}</div>
      <div class="route-point-info">
        <div class="route-point-label" contenteditable="true" data-idx="${idx}">${esc(pt.label)}</div>
        <div class="route-point-coords">${pt.lat.toFixed(6)}, ${pt.lng.toFixed(6)}</div>
      </div>
      <div class="route-point-actions">
        <button class="route-point-zoom" title="Zoom y flash" data-idx="${idx}">&#128269;</button>
        <button class="route-point-del" title="Eliminar" data-idx="${idx}">&times;</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll('.route-point-del').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); removeRoutePoint(parseInt(btn.dataset.idx)); });
  });

  list.querySelectorAll('.route-point-zoom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomAndFlashPoint(parseInt(btn.dataset.idx));
    });
  });

  list.querySelectorAll('.route-point-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      routeState.dragIdx = parseInt(item.dataset.idx);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      routeState.dragIdx = null;
      list.querySelectorAll('.route-point-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const fromIdx = routeState.dragIdx;
      const toIdx = parseInt(item.dataset.idx);
      if (fromIdx === null || fromIdx === toIdx) return;
      const moved = routeState.points.splice(fromIdx, 1)[0];
      routeState.points.splice(toIdx, 0, moved);
      reorderRoutePointsDOM(fromIdx, toIdx);
      updateRouteMarkers();
    });
  });

  list.querySelectorAll('.route-point-label').forEach(label => {
    label.addEventListener('blur', () => {
      const idx = parseInt(label.dataset.idx);
      const newText = label.textContent.trim();
      if (newText && routeState.points[idx]) {
        routeState.points[idx].label = newText;
      }
    });
    label.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
    });
    label.addEventListener('click', (e) => e.stopPropagation());
  });

  document.getElementById('btn-trazar-ruta').disabled = routeState.points.length < 2;
}

function updateRouteMarkers() {
  routeState.markers.forEach(m => map.removeLayer(m));
  routeState.markers = [];

  routeState.points.forEach((pt, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === routeState.points.length - 1 && routeState.points.length > 1;
    const color = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#f59e0b';
    const label = isFirst ? 'I' : isLast ? 'F' : String(idx);

    const icon = L.divIcon({
      className: '',
      html: `<div style="width:24px;height:24px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;">${label}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([pt.lat, pt.lng], { icon, draggable: true }).addTo(map);
    marker._routeIdx = idx;
    marker.on('dragend', function() {
      const pos = this.getLatLng();
      routeState.points[this._routeIdx].lat = pos.lat;
      routeState.points[this._routeIdx].lng = pos.lng;
      renderRoutePoints();
    });
    routeState.markers.push(marker);
  });
}

async function loadDefaultRoutePoints() {
  if (routeState.points.length > 0) return;
  try {
    const { data, error } = await supabaseClient.from('catastro').select('*').eq('clave_nuev', '1205050801062001').limit(1);
    if (error || !data || data.length === 0) return;
    const row = data[0];
    const geoCol = detectGeoColumns([row])[0];
    if (!geoCol) return;
    const parsed = parseGeoJSON(row[geoCol]);
    if (!parsed) return;
    const centroid = getCentroid(parsed);
    if (!centroid) return;
    addRoutePoint(centroid.lat, centroid.lng, 'Punto Inicio (predeterminado)', 'start');
  } catch (_) {}
}

function buildGoogleMapsLink() {
  if (routeState.points.length < 2) return '';
  const origin = routeState.points[0];
  let url = `https://www.google.com/maps/dir/${origin.lat},${origin.lng}`;
  for (let i = 1; i < routeState.points.length; i++) {
    const p = routeState.points[i];
    url += `/${p.lat},${p.lng}`;
  }
  return url;
}

async function traceRoute() {
  if (routeState.points.length < 2) return;

  if (routeState.routeLine) { map.removeLayer(routeState.routeLine); routeState.routeLine = null; }

  const coords = routeState.points.map(p => `${p.lng},${p.lat}`).join(';');

  try {
    showStatus('info', 'Calculando ruta...');
    const resp = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`);
    const data = await resp.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      showStatus('error', 'No se pudo calcular la ruta');
      return;
    }

    const route = data.routes[0];
    const routeCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);

    routeState.routeLine = L.polyline(routeCoords, {
      color: '#3b82f6',
      weight: 5,
      opacity: 0.85
    }).addTo(map);

    map.fitBounds(routeState.routeLine.getBounds(), { padding: [40, 40] });

    const distKm = (route.distance / 1000).toFixed(2);
    const durMin = Math.round(route.duration / 60);

    routeState.generatedLink = buildGoogleMapsLink();

    const resultDiv = document.getElementById('route-result');
    resultDiv.style.display = 'flex';
    document.getElementById('route-info').innerHTML =
      `<strong>Distancia:</strong> ${distKm} km<br>` +
      `<strong>Tiempo estimado:</strong> ${durMin} min<br>` +
      `<strong>Puntos:</strong> ${routeState.points.length}`;

    showStatus('success', `Ruta: ${distKm} km, ${durMin} min`);

  } catch (err) {
    showStatus('error', 'Error al calcular ruta: ' + (err.message || err));
  }
}

function clearRoute() {
  routeState.points = [];
  routeState.markers.forEach(m => map.removeLayer(m));
  routeState.markers = [];
  if (routeState.routeLine) { map.removeLayer(routeState.routeLine); routeState.routeLine = null; }
  routeState.generatedLink = '';
  routeState.dragIdx = null;
  exitRouteClickMode();
  document.getElementById('route-result').style.display = 'none';
  document.getElementById('route-points-list').innerHTML = '';
  document.getElementById('route-point-count').textContent = '0';
  document.getElementById('btn-trazar-ruta').disabled = true;
  document.getElementById('route-search-results').innerHTML = '';
  document.getElementById('route-search-input').value = '';
  document.getElementById('input-gmaps-link').value = '';
  document.getElementById('input-lat').value = '';
  document.getElementById('input-lng').value = '';
}

function onRouteMapClick(e) {
  addRoutePoint(e.latlng.lat, e.latlng.lng, `Punto ${routeState.points.length + 1}`, 'stop');
}

function searchRouteLayer(tableName, query) {
  const resultsDiv = document.getElementById('route-search-results');
  if (!query) { resultsDiv.innerHTML = ''; return; }

  let allData = [];
  if (tableName === 'catastro' && activeLayers.has('catastro')) {
    allData = activeLayers.get('catastro')._allData || [];
  } else if (tableName === 'medidores' && activeLayers.has('medidores')) {
    allData = activeLayers.get('medidores')._allData || [];
  }

  if (allData.length === 0) {
    resultsDiv.innerHTML = '<p style="color:#fbbf24;font-size:11px;">Cargue la capa primero.</p>';
    return;
  }

  const lower = query.toLowerCase();
  const matches = [];
  const seen = new Set();

  for (const row of allData) {
    const id = getFeatureId(row);
    if (id && seen.has(id)) continue;
    for (const [k, v] of Object.entries(row)) {
      if (GEOM_PATTERNS.test(k) || v === null) continue;
      if (String(v).toLowerCase().includes(lower)) {
        if (id) seen.add(id);
        let centroid = null;
        const geoCol = detectGeoColumns([row])[0];
        if (geoCol) {
          const parsed = parseGeoJSON(row[geoCol]);
          if (parsed && parsed.geometry) {
            if (parsed.geometry.type === 'Point') {
              centroid = { lat: parsed.geometry.coordinates[1], lng: parsed.geometry.coordinates[0] };
            } else {
              centroid = getCentroid(parsed);
            }
          }
        }
        const label = row.clave_nuev || row.medidor || row.cod_client || row.nombres || String(v).substring(0, 30);
        matches.push({ id, label, centroid, row });
        break;
      }
    }
    if (matches.length >= 20) break;
  }

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<p style="color:#f87171;font-size:11px;">Sin resultados</p>';
    return;
  }

  resultsDiv.innerHTML = '';
  matches.forEach(m => {
    const item = document.createElement('div');
    item.className = 'route-stop-search-item';
    item.textContent = m.label + (m.centroid ? ` (${m.centroid.lat.toFixed(5)}, ${m.centroid.lng.toFixed(5)})` : ' (sin geo)');
    item.addEventListener('click', () => {
      if (m.centroid) {
        addRoutePoint(m.centroid.lat, m.centroid.lng, m.label, 'stop');
        map.setView([m.centroid.lat, m.centroid.lng], Math.max(map.getZoom(), 16));
      } else {
        showStatus('error', 'Elemento sin geometria');
      }
    });
    resultsDiv.appendChild(item);
  });
}

document.getElementById('btn-trazar-rutas').addEventListener('click', openRoutePanel);
document.getElementById('btn-close-route-panel').addEventListener('click', closeRoutePanel);

document.querySelectorAll('.route-mode-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.route-mode-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const mode = this.dataset.mode;
    showRouteInputSection(mode);

    if (mode === 'click') {
      routeState.routeClickMode = true;
      map.getContainer().classList.add('map-click-active');
      map.on('click', onRouteMapClick);
    } else {
      routeState.routeClickMode = false;
      map.getContainer().classList.remove('map-click-active');
      map.off('click', onRouteMapClick);
    }
  });
});

document.getElementById('btn-add-coord').addEventListener('click', () => {
  const lat = parseFloat(document.getElementById('input-lat').value);
  const lng = parseFloat(document.getElementById('input-lng').value);
  if (isNaN(lat) || isNaN(lng)) { showStatus('error', 'Coordenadas invalidas'); return; }
  addRoutePoint(lat, lng, `Punto ${routeState.points.length + 1}`, 'stop');
  document.getElementById('input-lat').value = '';
  document.getElementById('input-lng').value = '';
});

document.getElementById('btn-parse-gmaps').addEventListener('click', async () => {
  const inputEl = document.getElementById('input-gmaps-link');
  const url = inputEl.value.trim();
  if (!url) { showStatus('info', 'Ingrese un link de Google Maps'); return; }

  let coords = parseGoogleMapsLink(url);
  if (coords) {
    addRoutePoint(coords.lat, coords.lng, 'Parada GMaps', 'stop');
    inputEl.value = '';
    showStatus('success', `Coordenadas extraidas: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
    return;
  }

  const isShort = url.includes('maps.app.goo.gl') || url.includes('goo.gl/maps');
  if (isShort) {
    showStatus('info', 'Resolviendo link corto...');
    const resolved = await resolveGoogleMapsShortLink(url);
    if (resolved) {
      coords = parseGoogleMapsLink(resolved);
      if (coords) {
        addRoutePoint(coords.lat, coords.lng, 'Parada GMaps', 'stop');
        inputEl.value = '';
        showStatus('success', `Coordenadas extraidas: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
        return;
      }
    }
    inputEl.value = '';
    inputEl.placeholder = 'Pegue aqui la URL completa de Google Maps...';
    inputEl.focus();
    showStatus('info', 'No se pudo resolver automaticamente. Abra el link en su navegador, copie la URL de la barra de direcciones y peguela aqui.');
  } else {
    showStatus('error', 'No se pudieron extraer coordenadas. Use formato: https://www.google.com/maps/search/-1.016,-79.456');
  }
});

document.getElementById('input-gmaps-link').addEventListener('paste', (e) => {
  setTimeout(() => {
    const inputEl = e.target;
    const val = inputEl.value.trim();
    if (!val) return;
    const coords = parseGoogleMapsLink(val);
    if (coords) {
      addRoutePoint(coords.lat, coords.lng, 'Parada GMaps', 'stop');
      inputEl.value = '';
      inputEl.placeholder = 'Ingrese otro link de Google Maps...';
      showStatus('success', `Coordenadas extraidas: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`);
    }
  }, 100);
});

document.getElementById('btn-route-search').addEventListener('click', () => {
  const table = document.getElementById('route-search-table').value;
  const query = document.getElementById('route-search-input').value.trim();
  searchRouteLayer(table, query);
});
document.getElementById('route-search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const table = document.getElementById('route-search-table').value;
    const query = document.getElementById('route-search-input').value.trim();
    searchRouteLayer(table, query);
  }
});

document.getElementById('btn-trazar-ruta').addEventListener('click', traceRoute);
document.getElementById('btn-clear-route').addEventListener('click', clearRoute);

document.getElementById('btn-copy-gmaps-link').addEventListener('click', () => {
  if (!routeState.generatedLink) return;
  navigator.clipboard.writeText(routeState.generatedLink).then(() => {
    showStatus('success', 'Link copiado al portapapeles');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = routeState.generatedLink;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showStatus('success', 'Link copiado');
  });
});

(async () => {
  try {
    await loadConfig();
    initMap();
    listTables();
    if (window.location.protocol === 'file:') {
      const notice = document.createElement('div');
      notice.style.cssText = 'position:fixed;bottom:0;left:300px;right:0;z-index:998;background:rgba(153,27,27,0.95);color:#fecaca;padding:10px 20px;font-size:12px;text-align:center;';
      notice.innerHTML = '<strong>Servidor requerido para links cortos.</strong> Cierre esta pagina, ejecute <code>start-server.bat</code> y abra <a href="http://localhost:8000" style="color:#86efac;">http://localhost:8000</a>';
      document.body.appendChild(notice);
    }
  } catch (err) {
    console.error('GeoPortal init error:', err);
    document.getElementById('loading-tables').textContent = 'Error de inicializacion: ' + err.message;
  }
})();
