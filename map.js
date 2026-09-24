/**
 * QuRoute Map — stops, routes, multi-vehicle, animation, QPU toggle.
 */

const BACKEND_URL = '';
const MAX_STOPS = 8;

const VEHICLE_COLORS = ['#34d399', '#6fa3ec', '#ec6fa0'];
const VEHICLE_NAMES = ['Alpha', 'Bravo', 'Charlie'];

const DEMO_STOPS = [
  { id: '0', lat: 16.5062, lng: 80.6480, label: 'Depot (Vijayawada Bus Stand)' },
  { id: '1', lat: 16.5193, lng: 80.6305, label: 'Governorpet' },
  { id: '2', lat: 16.5041, lng: 80.6606, label: 'Benz Circle' },
  { id: '3', lat: 16.5152, lng: 80.6689, label: 'Patamata' },
  { id: '4', lat: 16.4880, lng: 80.6390, label: 'Auto Nagar' },
  { id: '5', lat: 16.4737, lng: 80.6516, label: 'Poranki' },
];

// ── State ────────────────────────────────────────────────────────────
let stops = [];
let markers = [];
let routeLayers = [];
let legendControl = null;
let pendingLatLng = null;
let numVehicles = 1;
let computeMode = 'simulator'; // 'simulator' | 'qpu'
let lastData = null;

// Animation state
let animRunning = false;
let animPaused = false;
let animFrame = null;
let truckMarkers = [];
let animRoutes = []; // Array of {coords: [[lat,lng],...], color: string}

// ── Map ──────────────────────────────────────────────────────────────
const map = L.map('map', {
  center: [16.5062, 80.6480],
  zoom: 13,
  zoomControl: true,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(map);

// ── DOM ──────────────────────────────────────────────────────────────
const stopList = document.getElementById('stop-list');
const stopCountText = document.getElementById('stop-count-text');
const btnOptimize = document.getElementById('btn-optimize');
const btnLoadDemo = document.getElementById('btn-load-demo');
const loadingSpinner = document.getElementById('loading-spinner');
const cachedIndicator = document.getElementById('cached-indicator');
const metricsPanel = document.getElementById('metrics-panel');
const labelPopup = document.getElementById('label-popup');
const labelInput = document.getElementById('label-input');
const btnAddLabel = document.getElementById('btn-add-label');
const animControls = document.getElementById('anim-controls');
const btnPlay = document.getElementById('btn-play');
const btnReset = document.getElementById('btn-reset');
const animProgress = document.getElementById('anim-progress');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');

// ── Segmented Controls ──────────────────────────────────────────────
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    computeMode = btn.dataset.mode;
    const qpuInfo = document.getElementById('qpu-info');
    if (computeMode === 'qpu') {
      qpuInfo.classList.remove('hidden');
    } else {
      qpuInfo.classList.add('hidden');
    }
  });
});

document.querySelectorAll('[data-vehicles]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-vehicles]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    numVehicles = parseInt(btn.dataset.vehicles);
    // Re-render if we have data
    if (lastData) {
      renderRoutes(lastData);
      if (typeof updateMetrics === 'function') updateMetrics(lastData);
    }
  });
});

// ── Numbered Marker ─────────────────────────────────────────────────
function createNumberedIcon(number) {
  return L.divIcon({
    className: 'numbered-marker-wrapper',
    html: `<div class="numbered-marker">${number}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

// ── Truck Marker for Animation ──────────────────────────────────────
function createTruckIcon(color) {
  const svg = `<svg viewBox="0 0 24 24" width="24" height="24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="6" width="15" height="10" rx="2" fill="${color}"/>
    <rect x="14" y="9" width="8" height="7" rx="1" fill="${color}" opacity="0.7"/>
    <circle cx="6" cy="18" r="2" fill="#fff" stroke="${color}" stroke-width="1"/>
    <circle cx="18" cy="18" r="2" fill="#fff" stroke="${color}" stroke-width="1"/>
  </svg>`;
  return L.divIcon({
    className: 'truck-marker',
    html: svg,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// ── Stop Management ─────────────────────────────────────────────────
function addStop(lat, lng, label) {
  if (stops.length >= MAX_STOPS) {
    alert(`Maximum ${MAX_STOPS} stops allowed.`);
    return;
  }
  const stop = {
    id: String(stops.length),
    lat: parseFloat(lat.toFixed(4)),
    lng: parseFloat(lng.toFixed(4)),
    label: label || `Stop ${stops.length}`,
  };
  stops.push(stop);
  const marker = L.marker([stop.lat, stop.lng], {
    icon: createNumberedIcon(stops.length),
  }).addTo(map);
  marker.bindPopup(`<b>${stop.label}</b><br>Lat: ${stop.lat}, Lng: ${stop.lng}`);
  markers.push(marker);
  updateStopList();
  updateOptimizeButton();
}

function removeStop(index) {
  stops.splice(index, 1);
  map.removeLayer(markers[index]);
  markers.splice(index, 1);
  markers.forEach((marker, i) => {
    marker.setIcon(createNumberedIcon(i + 1));
    const stop = stops[i];
    stop.id = String(i);
    marker.setPopupContent(`<b>${stop.label}</b><br>Lat: ${stop.lat}, Lng: ${stop.lng}`);
  });
  updateStopList();
  updateOptimizeButton();
  clearRoutes();
}

function clearAllStops() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  stops = [];
  updateStopList();
  updateOptimizeButton();
  clearRoutes();
  lastData = null;
}

function updateStopList() {
  stopCountText.textContent = `${stops.length}/${MAX_STOPS}`;
  if (stops.length === 0) {
    stopList.innerHTML = '<p class="stop-list-empty">Click the map to place delivery stops</p>';
    return;
  }
  stopList.innerHTML = stops.map((stop, i) => `
    <div class="stop-item">
      <div class="stop-item-info">
        <span class="stop-number">${i + 1}</span>
        <span class="stop-label" title="${stop.label}">${stop.label}</span>
      </div>
      <button class="stop-remove" onclick="removeStop(${i})" title="Remove">×</button>
    </div>
  `).join('');
}

function updateOptimizeButton() {
  btnOptimize.disabled = stops.length < 3;
}

// ── Map Click → Add Stop ────────────────────────────────────────────
map.on('click', function (e) {
  if (stops.length >= MAX_STOPS) return;
  pendingLatLng = e.latlng;
  const pt = map.latLngToContainerPoint(e.latlng);
  const rect = document.getElementById('map').getBoundingClientRect();
  labelPopup.style.left = (rect.left + pt.x + 10) + 'px';
  labelPopup.style.top = (rect.top + pt.y - 20) + 'px';
  labelPopup.classList.remove('hidden');
  labelInput.value = '';
  labelInput.focus();
});

btnAddLabel.addEventListener('click', function () {
  if (pendingLatLng) {
    addStop(pendingLatLng.lat, pendingLatLng.lng, labelInput.value.trim() || `Stop ${stops.length}`);
    labelPopup.classList.add('hidden');
    pendingLatLng = null;
  }
});

labelInput.addEventListener('keypress', e => { if (e.key === 'Enter') btnAddLabel.click(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { labelPopup.classList.add('hidden'); pendingLatLng = null; }
});

// ── Load Demo ───────────────────────────────────────────────────────
btnLoadDemo.addEventListener('click', function () {
  clearAllStops();
  DEMO_STOPS.forEach(s => addStop(s.lat, s.lng, s.label));
  const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
  map.fitBounds(bounds.pad(0.2));
});

// ── Multi-Vehicle Tour Splitting ────────────────────────────────────
function splitTourForVehicles(tour, nVehicles) {
  if (nVehicles <= 1) return [tour];
  // tour starts at depot (index 0). Split non-depot stops evenly.
  const depot = tour[0];
  const deliveries = tour.slice(1);
  const perVehicle = Math.ceil(deliveries.length / nVehicles);
  const routes = [];
  for (let v = 0; v < nVehicles; v++) {
    const chunk = deliveries.slice(v * perVehicle, (v + 1) * perVehicle);
    if (chunk.length > 0) {
      routes.push([depot, ...chunk, depot]);
    }
  }
  return routes;
}

// ── Route Rendering ─────────────────────────────────────────────────
function clearRoutes() {
  routeLayers.forEach(layer => map.removeLayer(layer));
  routeLayers = [];
  if (legendControl) { map.removeControl(legendControl); legendControl = null; }
  stopAnimation();
  animControls.classList.add('hidden');
  animRoutes = [];
}

function tourToLatLngs(tour) {
  const coords = tour.map(i => [stops[i].lat, stops[i].lng]);
  coords.push(coords[0]);
  return coords;
}

function renderRoutes(data) {
  clearRoutes();
  const { quantum, classical_greedy, brute_force_optimal } = data;

  // Determine vehicle split for QAOA tour
  const qaoaTour = quantum && quantum.tour ? quantum.tour : null;
  const vehicleTours = qaoaTour ? splitTourForVehicles(qaoaTour, numVehicles) : [];

  // Draw optimal (dashed, behind)
  if (brute_force_optimal && !brute_force_optimal.skipped && brute_force_optimal.tour) {
    const line = L.polyline(tourToLatLngs(brute_force_optimal.tour), {
      color: '#e5b94e', weight: 2.5, opacity: 0.5, dashArray: '6, 5',
    }).addTo(map);
    routeLayers.push(line);
  }

  // Draw greedy
  if (classical_greedy && classical_greedy.tour) {
    const line = L.polyline(tourToLatLngs(classical_greedy.tour), {
      color: '#ec6fa0', weight: 2.5, opacity: 0.6,
    }).addTo(map);
    routeLayers.push(line);
  }

  // Draw QAOA — one polyline per vehicle
  animRoutes = [];
  vehicleTours.forEach((vTour, vi) => {
    const color = VEHICLE_COLORS[vi % VEHICLE_COLORS.length];
    const coords = vTour.map(i => [stops[i].lat, stops[i].lng]);
    // Close loop only if last !== first (splitTour already does this)
    const line = L.polyline(coords, {
      color, weight: numVehicles > 1 ? 3.5 : 4, opacity: 0.9,
    }).addTo(map);
    routeLayers.push(line);
    animRoutes.push({ coords, color });
  });

  // Legend
  legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'route-legend');
    let html = '<h4>Routes</h4>';
    if (numVehicles > 1) {
      vehicleTours.forEach((_, vi) => {
        const c = VEHICLE_COLORS[vi % VEHICLE_COLORS.length];
        html += `<div class="legend-item"><span class="legend-line" style="background:${c}"></span> Vehicle ${VEHICLE_NAMES[vi]}</div>`;
      });
    } else {
      html += '<div class="legend-item"><span class="legend-line" style="background:#34d399"></span> QAOA</div>';
    }
    html += '<div class="legend-item"><span class="legend-line" style="background:#ec6fa0"></span> Greedy</div>';
    if (brute_force_optimal && !brute_force_optimal.skipped) {
      html += '<div class="legend-item"><span class="legend-line-dashed" style="border-color:#e5b94e"></span> Optimal</div>';
    }
    div.innerHTML = html;
    return div;
  };
  legendControl.addTo(map);

  // Show animation controls
  if (animRoutes.length > 0) {
    animControls.classList.remove('hidden');
    animProgress.style.width = '0%';
  }
}

// ── Route Animation ─────────────────────────────────────────────────
function interpolateAlongPath(coords, t) {
  // t in [0, 1]. Returns [lat, lng] at fraction t along the polyline.
  if (coords.length < 2) return coords[0];
  let totalDist = 0;
  const segments = [];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i-1][0];
    const dy = coords[i][1] - coords[i-1][1];
    const d = Math.sqrt(dx*dx + dy*dy);
    segments.push(d);
    totalDist += d;
  }
  if (totalDist === 0) return coords[0];
  let target = t * totalDist;
  let cumul = 0;
  for (let i = 0; i < segments.length; i++) {
    if (cumul + segments[i] >= target) {
      const frac = (target - cumul) / segments[i];
      const lat = coords[i][0] + frac * (coords[i+1][0] - coords[i][0]);
      const lng = coords[i][1] + frac * (coords[i+1][1] - coords[i][1]);
      return [lat, lng];
    }
    cumul += segments[i];
  }
  return coords[coords.length - 1];
}

function startAnimation() {
  if (animRoutes.length === 0) return;
  stopAnimation();
  animRunning = true;
  animPaused = false;
  playIcon.classList.add('hidden');
  pauseIcon.classList.remove('hidden');

  // Create truck markers
  truckMarkers = animRoutes.map(route => {
    const m = L.marker(route.coords[0], {
      icon: createTruckIcon(route.color),
      zIndexOffset: 2000,
    }).addTo(map);
    return m;
  });

  const duration = 4000; // 4 seconds per full loop
  let startTime = null;

  function animate(timestamp) {
    if (!animRunning) return;
    if (animPaused) { animFrame = requestAnimationFrame(animate); return; }
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const t = Math.min(elapsed / duration, 1);

    animProgress.style.width = (t * 100) + '%';

    truckMarkers.forEach((marker, i) => {
      const pos = interpolateAlongPath(animRoutes[i].coords, t);
      marker.setLatLng(pos);
    });

    if (t < 1) {
      animFrame = requestAnimationFrame(animate);
    } else {
      // Animation complete
      animRunning = false;
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  }

  animFrame = requestAnimationFrame(animate);
}

function stopAnimation() {
  animRunning = false;
  animPaused = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  truckMarkers.forEach(m => map.removeLayer(m));
  truckMarkers = [];
  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');
}

btnPlay.addEventListener('click', () => {
  if (animRunning && !animPaused) {
    // Pause
    animPaused = true;
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  } else if (animRunning && animPaused) {
    // Resume
    animPaused = false;
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else {
    startAnimation();
  }
});

btnReset.addEventListener('click', () => {
  stopAnimation();
  animProgress.style.width = '0%';
});

// ── Optimize API Call ───────────────────────────────────────────────
btnOptimize.addEventListener('click', async function () {
  if (stops.length < 3) return;

  btnOptimize.disabled = true;
  loadingSpinner.classList.remove('hidden');
  cachedIndicator.classList.add('hidden');
  metricsPanel.classList.add('hidden');
  stopAnimation();

  try {
    const response = await fetch(`${BACKEND_URL}/api/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stops: stops,
        reps: 2,
        shots: 1024,
        seed: 42,
        fallback_mode: false,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    lastData = data;

    renderRoutes(data);
    if (typeof updateMetrics === 'function') updateMetrics(data);

    if (data.quantum && data.quantum.cached) cachedIndicator.classList.remove('hidden');
    if (data.fallback_used) cachedIndicator.classList.remove('hidden');

    metricsPanel.classList.remove('hidden');

  } catch (err) {
    console.error('Optimization failed:', err);
    alert(`Optimization failed: ${err.message}`);
  } finally {
    loadingSpinner.classList.add('hidden');
    updateOptimizeButton();
  }
});

// ── Close Metrics ───────────────────────────────────────────────────
document.getElementById('btn-close-metrics').addEventListener('click', () => {
  metricsPanel.classList.add('hidden');
});

// ── Init ─────────────────────────────────────────────────────────────
updateStopList();
updateOptimizeButton();
