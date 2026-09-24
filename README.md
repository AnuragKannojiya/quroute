# QuRoute — Hybrid Quantum-Classical Delivery Route Optimizer

**QuHack 2026 · UC-038: Last-Mile Delivery & Vehicle Routing**

QuRoute is a hybrid quantum-classical delivery route optimizer that demonstrates how QAOA (Quantum Approximate Optimization Algorithm) can tackle the Travelling Salesman Problem for last-mile delivery routing. Given a set of delivery stops, it builds a QUBO formulation, solves it with QAOA on a quantum simulator, and compares the result against classical baselines — all visualized on an interactive map.

> **Scope honesty:** At 6–8 stops, a classical solver is faster in wall-clock time. This project does **not** claim quantum advantage at demo scale — it demonstrates a correct, complete, working hybrid pipeline that scales with quantum hardware improvements rather than against them.

## Problem Context

From UC-038 (QAIC "100 Quantum Use Cases", Amaravati Quantum Valley, Government of Andhra Pradesh):

> Routing fleets across dynamic demand, traffic and time windows is combinatorially hard and costly when done sub-optimally. Quantum and quantum-inspired solvers tackle vehicle-routing and travelling-salesperson variants at practical scale, often hybridised with classical methods.

The number of distinct routes through *n* stops grows as (n−1)!/2 — factorial growth, not polynomial. At 6 stops: 60 routes. At 14 stops: over 3.1 billion. QAOA explores the solution space in superposition and samples low-cost configurations a greedy search would never reach.

## Architecture

```
Browser (Leaflet + Chart.js)
    │
    ▼ port 8080
Frontend (Nginx static + proxy)
    │
    ▼ port 3000
Backend (Node.js / Express)
    │  - validation, caching, fallback
    ▼ port 8001
Quantum Service (Python / FastAPI)
    ├── QUBO Builder (Qiskit TSP)
    ├── QAOA Solver (AerSimulator)
    ├── Greedy Baseline
    ├── Brute Force (n ≤ 10)
    ├── Metrics Calculator
    └── Demo Cache (fallback)
```

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Quick Start

### Prerequisites
- Docker and Docker Compose installed

### Run

```bash
# 1. Clone the repository
git clone <repo-url> && cd quroute

# 2. (Optional) Copy and edit environment config
cp .env.example .env

# 3. Build and start all services
docker-compose up --build

# 4. Open in browser
open http://localhost:8080
```

That's it — three commands to a working demo.

### First Use

1. Open `http://localhost:8080` in your browser
2. Click **"Load Vijayawada Demo"** to populate 6 delivery stops in Vijayawada, Andhra Pradesh
3. Click **"Optimize"** and wait ~5-10 seconds
4. View the three routes on the map and compare metrics in the panel

### Custom Stops

- **Click anywhere on the map** to add a delivery stop (enter a label in the popup)
- Remove stops with the **×** button in the sidebar
- Maximum 8 stops for the QAOA solver (n² = 64 qubits at n=8)
- Minimum 3 stops required

## Demo Data

The default demo uses 6 real locations in Vijayawada, Andhra Pradesh:

| Label | Latitude | Longitude |
|-------|----------|-----------|
| Depot (Vijayawada Bus Stand) | 16.5062 | 80.6480 |
| Governorpet | 16.5193 | 80.6305 |
| Benz Circle | 16.5041 | 80.6606 |
| Patamata | 16.5152 | 80.6689 |
| Auto Nagar | 16.4880 | 80.6390 |
| Poranki | 16.4737 | 80.6516 |

Distances are computed using **haversine (straight-line)** distance, not road-network routing. This simplification is labeled honestly in the UI.

## Fallback Mode (Demo Cache)

QuRoute includes a **cached fallback mode** to ensure demos never fail on stage:

- **Automatic:** If the quantum solver times out (>15s), the backend automatically falls back to pre-computed results
- **Manual:** Set `FALLBACK_MODE=true` in `.env` or pass `fallback_mode: true` in the API request
- **Honest:** The frontend shows a "Cached Result" indicator when serving cached data — cached results are never silently presented as live computations

The cache contains pre-computed results for 2-3 fixed instances using deterministic seeds, ensuring consistent demo quality.

## Real Hardware Validation

We validated the QAOA pipeline on real IBM Quantum hardware (not just simulation). See [docs/real-hardware-run.md](docs/real-hardware-run.md) for the full write-up including:
- Job ID and backend used
- Queue and execution times
- Result comparison with simulator
- Observations on noise impact

This is a credibility artifact — real hardware is too slow/queue-bound for interactive demos but validates the pipeline on actual quantum processors.

## API Reference

### `POST /api/optimize`

**Request:**
```json
{
  "stops": [
    {"id": "0", "lat": 16.5062, "lng": 80.6480, "label": "Depot"},
    {"id": "1", "lat": 16.5193, "lng": 80.6305, "label": "Stop A"}
  ],
  "reps": 2,
  "shots": 1024,
  "seed": 42,
  "fallback_mode": false
}
```

**Response:**
```json
{
  "distance_matrix_km": [[0, 3.2], [3.2, 0]],
  "quantum": {
    "tour": [0, 1],
    "cost_km": 3.2,
    "circuit_depth": 12,
    "qubit_count": 4,
    "valid_sample_rate": 0.62,
    "cached": false
  },
  "classical_greedy": {"tour": [0, 1], "cost_km": 3.2},
  "brute_force_optimal": {"tour": [0, 1], "cost_km": 3.2, "skipped": false},
  "metrics": {
    "improvement_over_greedy_pct": 0.0,
    "optimality_gap_pct": 0.0,
    "estimated_fuel_liters": 0.96,
    "estimated_co2_kg": 2.57
  }
}
```

## Testing

```bash
# Run quantum service tests
docker-compose exec quantum-service pytest tests/ -v

# Or locally (requires Python 3.11 + dependencies)
cd quantum-service
pip install -r requirements.txt
pytest tests/ -v
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Quantum / Optimization | Python 3.11, Qiskit, qiskit-optimization, qiskit-aer |
| Quantum Service API | FastAPI + Uvicorn |
| Backend Orchestration | Node.js 20, Express |
| Frontend | Leaflet.js, vanilla JS, Chart.js |
| Classical Validation | itertools (brute force), Python (greedy) |
| Containerization | Docker, Docker Compose |
| Real Hardware (one-off) | qiskit-ibm-runtime |

## Known Limitations

Stated plainly, as they should be:

1. **No quantum advantage at demo scale.** At 6-8 stops, classical solvers are faster. This demonstrates a working pipeline, not quantum speedup.
2. **Haversine distances only.** Road-network routing (OSRM/GraphHopper) is out of scope. Distances are labeled as "straight-line km."
3. **Maximum ~8 stops** for the QAOA path (64 qubits). The simulator becomes impractically slow beyond this.
4. **QAOA is stochastic.** Results vary between runs (with different seeds). The valid sample rate is often low — this is an honest and expected QAOA characteristic, not a bug.
5. **No user authentication**, no database, no mobile optimization — this is a hackathon demo.
6. **Fuel/CO₂ estimates are indicative**, using standard conversion factors (~0.3 L/km, ~2.68 kg CO₂/L), not verified for specific vehicles.
7. **Real hardware is not in the live demo path** — too slow/queue-bound for interactive use.

## Project Structure

```
quroute/
├── quantum-service/          # Python/FastAPI quantum solver
│   ├── app.py                # FastAPI endpoints
│   ├── qubo_builder.py       # Distance matrix → QUBO
│   ├── qaoa_solver.py        # QAOA solver (AerSimulator)
│   ├── classical_baseline.py # Greedy nearest-neighbor
│   ├── brute_force.py        # Exact solver (n ≤ 10)
│   ├── metrics.py            # Comparison metrics + fuel/CO₂
│   ├── demo_cache.py         # Pre-computed fallback results
│   ├── tests/                # pytest test suite
│   ├── requirements.txt
│   └── Dockerfile
├── backend/                  # Node.js/Express orchestration
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/optimize.js
│   │   ├── services/quantumClient.js
│   │   ├── services/geocoding.js
│   │   └── middleware/errorHandler.js
│   ├── package.json
│   └── Dockerfile
├── frontend/                 # Leaflet.js + Chart.js UI
│   ├── index.html
│   ├── map.js
│   ├── metrics-panel.js
│   ├── style.css
│   ├── nginx.conf
│   └── Dockerfile
├── docs/
│   ├── architecture.md
│   └── real-hardware-run.md
├── docker-compose.yml
├── .env.example
└── README.md
```

## License

MIT

---

*Built for QuHack 2026 — Quantique. Problem Statement UC-038.*
*Amaravati Quantum Valley, Government of Andhra Pradesh.*
