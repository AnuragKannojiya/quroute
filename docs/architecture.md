# QuRoute Architecture

## System Overview

QuRoute is a hybrid quantum-classical delivery route optimizer built as a three-service architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (User)                          │
│  Leaflet Map + Metrics Panel + Chart.js                        │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTP (port 8080)
┌───────────────▼─────────────────────────────────────────────────┐
│              Frontend (Nginx)                                   │
│  Static file server + reverse proxy                             │
│  Proxies /api/* → backend:3000                                  │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTP (port 3000)
┌───────────────▼─────────────────────────────────────────────────┐
│              Backend (Node.js / Express)                         │
│  - Input validation                                             │
│  - Response caching (in-memory, 5 min TTL)                      │
│  - Timeout handling with automatic fallback                     │
│  - Request ID tracking                                          │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTP (port 8001)
┌───────────────▼─────────────────────────────────────────────────┐
│          Quantum Service (Python / FastAPI)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ QUBO Builder  │  │ QAOA Solver  │  │   Greedy     │          │
│  │ (Qiskit TSP)  │  │ (AerSim)     │  │  Baseline    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Brute Force  │  │   Metrics    │  │  Demo Cache  │          │
│  │ (n ≤ 10)     │  │  Calculator  │  │  (Fallback)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

1. **User places stops** on the Leaflet map (click or load demo)
2. **Frontend** sends `POST /api/optimize` with stops array to backend
3. **Backend** validates input, checks cache, forwards to quantum service
4. **Quantum Service**:
   a. Builds haversine distance matrix from lat/lng coordinates
   b. Encodes as QUBO using Qiskit's TSP application (n² binary variables)
   c. Solves with QAOA (COBYLA optimizer, AerSimulator, configurable reps/shots)
   d. Solves with nearest-neighbor greedy baseline
   e. Solves with brute-force permutation search (if n ≤ 10)
   f. Computes comparison metrics and fuel/CO₂ estimates
5. **Backend** caches result, returns to frontend
6. **Frontend** renders three routes on map + metrics panel

## QAOA Pipeline Detail

```
Distance Matrix → Qiskit TSP Application → QuadraticProgram (QUBO)
                                                    │
                                                    ▼
                                        MinimumEigenOptimizer
                                                    │
                                            ┌───────┴───────┐
                                            │     QAOA      │
                                            │  p=2 (reps)   │
                                            │  COBYLA opt   │
                                            │  1024 shots   │
                                            └───────┬───────┘
                                                    │
                                                    ▼
                                            AerSimulator
                                                    │
                                                    ▼
                                        Decode bitstrings
                                        Filter valid tours
                                        Return lowest cost
```

## Qubit Scaling

Under the TSP one-hot encoding, the number of qubits = n² where n is the number of stops:

| Stops | Qubits | Feasible Routes | Simulator Feasibility |
|-------|--------|----------------|-----------------------|
| 3     | 9      | 1              | Trivial               |
| 4     | 16     | 3              | Fast                  |
| 5     | 25     | 12             | Fast                  |
| 6     | 36     | 60             | ~5-10s                |
| 7     | 49     | 360            | ~15-30s               |
| 8     | 64     | 2520           | ~30-60s (limit)       |

## Fallback / Demo Cache

The `demo_cache.py` module stores pre-computed results for fixed demo instances.
Activated via `FALLBACK_MODE=true` environment variable or `fallback_mode: true` 
in the request. The backend also auto-activates fallback if the quantum service
times out (default 15s threshold).

The frontend shows a "Cached Result" indicator when serving cached data — it
never silently presents cached results as live computations.
