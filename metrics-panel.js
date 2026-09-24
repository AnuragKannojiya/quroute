/**
 * QuRoute Metrics Panel — metrics, chart, multi-vehicle breakdown.
 */

let costChart = null;

function updateMetrics(data) {
  const { quantum, classical_greedy, brute_force_optimal, metrics } = data;

  // ── Live Badge ────────────────────────────────────────────────────
  const liveBadge = document.getElementById('live-badge');
  const mode = typeof computeMode !== 'undefined' ? computeMode : 'simulator';
  if (liveBadge) {
    if (quantum.cached || data.fallback_used) {
      liveBadge.textContent = 'Cached · Fallback';
      liveBadge.style.color = '#e5b94e';
      liveBadge.style.borderColor = 'rgba(229,185,78,0.2)';
      liveBadge.style.background = 'rgba(229,185,78,0.06)';
    } else if (mode === 'qpu') {
      liveBadge.textContent = 'Live · IBM Quantum';
      liveBadge.style.color = '#6fa3ec';
      liveBadge.style.borderColor = 'rgba(111,163,236,0.2)';
      liveBadge.style.background = 'rgba(111,163,236,0.08)';
    } else if (quantum.solver_used === 'qaoa_aer') {
      liveBadge.textContent = 'Live · QAOA Circuit';
      liveBadge.style.color = '#34d399';
      liveBadge.style.borderColor = 'rgba(52,211,153,0.18)';
      liveBadge.style.background = 'rgba(52,211,153,0.08)';
    } else {
      liveBadge.textContent = 'Live · Quantum-Inspired';
      liveBadge.style.color = '#34d399';
      liveBadge.style.borderColor = 'rgba(52,211,153,0.18)';
      liveBadge.style.background = 'rgba(52,211,153,0.08)';
    }
  }

  // ── Route Costs ───────────────────────────────────────────────────
  document.getElementById('metric-qaoa-cost').textContent =
    `${quantum.cost_km.toFixed(2)} km`;

  document.getElementById('metric-greedy-cost').textContent =
    `${classical_greedy.cost_km.toFixed(2)} km`;

  if (brute_force_optimal && !brute_force_optimal.skipped && brute_force_optimal.cost_km != null) {
    document.getElementById('metric-optimal-cost').textContent =
      `${brute_force_optimal.cost_km.toFixed(2)} km`;
  } else {
    document.getElementById('metric-optimal-cost').textContent = 'N/A';
  }

  // ── Performance ───────────────────────────────────────────────────
  const improvementEl = document.getElementById('metric-improvement');
  const improvement = metrics.improvement_over_greedy_pct;
  if (improvement > 0) {
    improvementEl.textContent = `+${improvement.toFixed(1)}%`;
    improvementEl.className = 'kpi-value metric-positive';
  } else if (improvement < 0) {
    improvementEl.textContent = `${improvement.toFixed(1)}%`;
    improvementEl.className = 'kpi-value metric-negative';
  } else {
    improvementEl.textContent = '0.0%';
    improvementEl.className = 'kpi-value metric-neutral';
  }

  const gapEl = document.getElementById('metric-gap');
  if (metrics.optimality_gap_pct != null) {
    gapEl.textContent = metrics.optimality_gap_pct === 0
      ? '0.0%'
      : `${metrics.optimality_gap_pct.toFixed(1)}%`;
    gapEl.className = 'kpi-value ' + (metrics.optimality_gap_pct === 0 ? 'metric-positive' : 'metric-neutral');
  } else {
    gapEl.textContent = 'N/A';
    gapEl.className = 'kpi-value';
  }

  // ── Circuit ───────────────────────────────────────────────────────
  document.getElementById('metric-qubits').textContent = quantum.qubit_count;
  document.getElementById('metric-depth').textContent = quantum.circuit_depth;
  document.getElementById('metric-valid-rate').textContent =
    `${(quantum.valid_sample_rate * 100).toFixed(1)}%`;

  // ── Environmental ─────────────────────────────────────────────────
  document.getElementById('metric-fuel').textContent =
    `${metrics.estimated_fuel_liters.toFixed(2)} L`;
  document.getElementById('metric-co2').textContent =
    `${metrics.estimated_co2_kg.toFixed(2)} kg`;

  const fuelSaved = metrics.fuel_saved_liters || 0;
  const co2Saved = metrics.co2_saved_kg || 0;
  document.getElementById('metric-fuel-saved').textContent =
    fuelSaved > 0 ? `${fuelSaved.toFixed(2)} L` : '—';
  document.getElementById('metric-co2-saved').textContent =
    co2Saved > 0 ? `${co2Saved.toFixed(2)} kg` : '—';

  // ── Multi-Vehicle Breakdown ───────────────────────────────────────
  const nv = typeof numVehicles !== 'undefined' ? numVehicles : 1;
  const breakdownSection = document.getElementById('vehicle-breakdown');
  const detailsDiv = document.getElementById('vehicle-details');

  if (nv > 1 && quantum.tour) {
    breakdownSection.classList.remove('hidden');
    const vehicleColors = ['#34d399', '#6fa3ec', '#ec6fa0'];
    const vehicleNames = ['Alpha', 'Bravo', 'Charlie'];
    const stopsArr = typeof stops !== 'undefined' ? stops : [];
    const tour = quantum.tour;
    const depot = tour[0];
    const deliveries = tour.slice(1);
    const perVehicle = Math.ceil(deliveries.length / nv);

    let html = '';
    for (let v = 0; v < nv; v++) {
      const chunk = deliveries.slice(v * perVehicle, (v + 1) * perVehicle);
      if (chunk.length === 0) continue;
      const fullRoute = [depot, ...chunk, depot];

      // Calculate route distance
      let dist = 0;
      for (let j = 1; j < fullRoute.length; j++) {
        const a = stopsArr[fullRoute[j-1]];
        const b = stopsArr[fullRoute[j]];
        if (a && b) dist += haversine(a.lat, a.lng, b.lat, b.lng);
      }

      const stopNames = chunk.map(i => stopsArr[i] ? stopsArr[i].label : `Stop ${i}`);
      html += `
        <div class="vehicle-card" style="border-left-color:${vehicleColors[v]}">
          <div class="vehicle-card-header">
            <span class="vehicle-card-title">Vehicle ${vehicleNames[v]}</span>
            <span class="vehicle-card-cost">${dist.toFixed(2)} km</span>
          </div>
          <div class="vehicle-card-stops">${stopNames.join(' → ')}</div>
        </div>`;
    }
    detailsDiv.innerHTML = html;
  } else {
    breakdownSection.classList.add('hidden');
  }

  // ── Chart ─────────────────────────────────────────────────────────
  renderCostChart(data);
}

// Simple haversine for vehicle breakdown
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function renderCostChart(data) {
  const canvas = document.getElementById('cost-chart');
  if (!canvas) return;

  const { quantum, classical_greedy, brute_force_optimal } = data;

  const labels = ['QAOA', 'Greedy'];
  const values = [quantum.cost_km, classical_greedy.cost_km];
  const colors = ['#34d399', '#ec6fa0'];

  if (brute_force_optimal && !brute_force_optimal.skipped && brute_force_optimal.cost_km != null) {
    labels.push('Optimal');
    values.push(brute_force_optimal.cost_km);
    colors.push('#e5b94e');
  }

  if (costChart) costChart.destroy();

  costChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Route Cost (km)',
        data: values,
        backgroundColor: colors.map(c => c + '25'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#191922',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleFont: { family: 'Inter', size: 11 },
          bodyFont: { family: 'JetBrains Mono', size: 10 },
          padding: 8,
          callbacks: {
            label: ctx => `${ctx.parsed.y.toFixed(2)} km`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true, text: 'km',
            color: '#55576b', font: { size: 9, family: 'Inter' },
          },
          ticks: { color: '#55576b', font: { size: 9, family: 'JetBrains Mono' } },
          grid: { color: 'rgba(255,255,255,0.03)' },
        },
        x: {
          ticks: { color: '#8b8da0', font: { size: 10, weight: '600', family: 'Inter' } },
          grid: { display: false },
        },
      },
    },
  });
}
