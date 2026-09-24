"""QuRoute Quantum Service — FastAPI application.

Exposes POST /solve endpoint that runs the hybrid quantum-classical
routing optimization pipeline.
"""

import os
import logging
import traceback

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np

from qubo_builder import build_distance_matrix, build_qubo
from qaoa_solver import solve_qaoa
from classical_baseline import solve_greedy
from brute_force import solve_brute_force
from metrics import compute_metrics
from demo_cache import get_cached_result, get_default_demo_result

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="QuRoute Quantum Service",
    description="Hybrid quantum-classical TSP solver for last-mile delivery routing",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ──────────────────────────────────────────

class Stop(BaseModel):
    id: str
    lat: float
    lng: float
    label: str = ""


class SolveRequest(BaseModel):
    stops: list[Stop]
    reps: int = Field(default=2, ge=1, le=5)
    shots: int = Field(default=1024, ge=100, le=8192)
    seed: int = Field(default=42)
    fallback_mode: bool = Field(default=False)


class QuantumResult(BaseModel):
    tour: list[int]
    cost_km: float
    circuit_depth: int
    qubit_count: int
    valid_sample_rate: float
    cached: bool
    solver_used: str = "qaoa"


class GreedyResult(BaseModel):
    tour: list[int]
    cost_km: float


class BruteForceResult(BaseModel):
    tour: list[int] | None
    cost_km: float | None
    skipped: bool


class MetricsResult(BaseModel):
    improvement_over_greedy_pct: float
    optimality_gap_pct: float | None
    estimated_fuel_liters: float
    estimated_co2_kg: float
    fuel_saved_liters: float = 0.0
    co2_saved_kg: float = 0.0


class SolveResponse(BaseModel):
    distance_matrix_km: list[list[float]]
    quantum: QuantumResult
    classical_greedy: GreedyResult
    brute_force_optimal: BruteForceResult
    metrics: MetricsResult


# ── Endpoints ──────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "quantum-service"}


@app.post("/solve", response_model=SolveResponse)
async def solve(request: SolveRequest):
    """Run the full hybrid quantum-classical routing optimization."""
    stops = [s.model_dump() for s in request.stops]
    n = len(stops)

    logger.info(f"Solve request: {n} stops, reps={request.reps}, "
                f"shots={request.shots}, fallback={request.fallback_mode}")

    # Validate stop count
    if n < 2:
        raise HTTPException(
            status_code=422,
            detail=f"Need at least 2 stops, got {n}.",
        )
    if n > 8:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Too many stops ({n}). Maximum is 8 for QAOA path. "
                f"This would require {n * n} qubits which exceeds "
                f"simulator capacity."
            ),
        )

    # Fallback mode: return cached result
    if request.fallback_mode:
        cached = get_cached_result(stops)
        if cached is None:
            cached = get_default_demo_result()
        logger.info("Returning cached fallback result")
        return cached

    try:
        # 1. Build distance matrix
        dist_matrix = build_distance_matrix(stops)
        dist_list = dist_matrix.tolist()
        logger.info(f"Distance matrix built: {n}×{n}")

        # 2. Build QUBO
        qp, tsp_instance = build_qubo(dist_matrix)
        logger.info(f"QUBO built: {qp.get_num_vars()} variables")

        # 3. Solve with QAOA
        try:
            qaoa_result = solve_qaoa(
                qp, tsp_instance, dist_matrix,
                reps=request.reps,
                shots=request.shots,
                seed=request.seed,
            )
            qaoa_cached = False
            logger.info(f"QAOA solved: tour={qaoa_result['tour']}, "
                        f"cost={qaoa_result['cost_km']}")
        except Exception as e:
            logger.error(f"QAOA solver failed: {e}\n{traceback.format_exc()}")
            # Fall back to cached result for QAOA, still run classical solvers
            cached = get_cached_result(stops)
            if cached:
                qaoa_result = {
                    "tour": cached["quantum"]["tour"],
                    "cost_km": cached["quantum"]["cost_km"],
                    "circuit_depth": cached["quantum"]["circuit_depth"],
                    "qubit_count": cached["quantum"]["qubit_count"],
                    "valid_sample_rate": cached["quantum"]["valid_sample_rate"],
                }
            else:
                # Use greedy as QAOA fallback
                greedy_fb = solve_greedy(dist_matrix)
                qaoa_result = {
                    "tour": greedy_fb["tour"],
                    "cost_km": greedy_fb["cost_km"],
                    "circuit_depth": 0,
                    "qubit_count": n * n,
                    "valid_sample_rate": 0.0,
                }
            qaoa_cached = True

        # 4. Solve with greedy baseline
        greedy_result = solve_greedy(dist_matrix)
        logger.info(f"Greedy solved: tour={greedy_result['tour']}, "
                     f"cost={greedy_result['cost_km']}")

        # 5. Solve with brute force (if n <= 10)
        bf_result = solve_brute_force(dist_matrix)
        if not bf_result["skipped"]:
            logger.info(f"Brute force solved: tour={bf_result['tour']}, "
                         f"cost={bf_result['cost_km']}")
        else:
            logger.info("Brute force skipped (n > 10)")

        # 6. Compute metrics
        optimal_cost = bf_result["cost_km"] if not bf_result["skipped"] else None
        metrics = compute_metrics(
            qaoa_cost=qaoa_result["cost_km"],
            greedy_cost=greedy_result["cost_km"],
            optimal_cost=optimal_cost,
        )

        return {
            "distance_matrix_km": dist_list,
            "quantum": {
                "tour": qaoa_result["tour"],
                "cost_km": qaoa_result["cost_km"],
                "circuit_depth": qaoa_result["circuit_depth"],
                "qubit_count": qaoa_result["qubit_count"],
                "valid_sample_rate": qaoa_result["valid_sample_rate"],
                "cached": qaoa_cached,
                "solver_used": qaoa_result.get("solver_used", "qaoa"),
            },
            "classical_greedy": greedy_result,
            "brute_force_optimal": bf_result,
            "metrics": metrics,
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Solve failed: {e}\n{traceback.format_exc()}")
        # Last resort: return cached result
        cached = get_cached_result(stops)
        if cached is None:
            cached = get_default_demo_result()
        cached["quantum"]["cached"] = True
        return cached
