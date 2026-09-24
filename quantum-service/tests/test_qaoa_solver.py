"""Tests for qaoa_solver module.

Note: QAOA is stochastic — we test for validity (each stop visited once),
not for optimality. Uses a fixed seed for reproducibility.
"""

import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qubo_builder import build_qubo
from qaoa_solver import solve_qaoa


class TestSolveQaoa:
    @pytest.fixture
    def instance_3(self):
        """3-stop instance (9 qubits — fast to simulate)."""
        matrix = np.array([
            [0.0, 1.0, 2.0],
            [1.0, 0.0, 3.0],
            [2.0, 3.0, 0.0],
        ])
        qp, tsp = build_qubo(matrix)
        return qp, tsp, matrix

    def test_runs_without_error(self, instance_3):
        qp, tsp, matrix = instance_3
        result = solve_qaoa(qp, tsp, matrix, reps=1, shots=512, seed=42)
        assert result is not None

    def test_returns_valid_tour(self, instance_3):
        qp, tsp, matrix = instance_3
        result = solve_qaoa(qp, tsp, matrix, reps=1, shots=512, seed=42)
        tour = result["tour"]
        # Tour must visit each stop exactly once
        assert len(tour) == 3
        assert set(tour) == {0, 1, 2}

    def test_returns_positive_cost(self, instance_3):
        qp, tsp, matrix = instance_3
        result = solve_qaoa(qp, tsp, matrix, reps=1, shots=512, seed=42)
        assert result["cost_km"] > 0

    def test_returns_circuit_stats(self, instance_3):
        qp, tsp, matrix = instance_3
        result = solve_qaoa(qp, tsp, matrix, reps=1, shots=512, seed=42)
        assert result["qubit_count"] == 9  # 3² = 9
        assert result["circuit_depth"] > 0
        assert 0 <= result["valid_sample_rate"] <= 1.0

    def test_deterministic_with_same_seed(self, instance_3):
        qp, tsp, matrix = instance_3
        r1 = solve_qaoa(qp, tsp, matrix, reps=1, shots=512, seed=42)
        # Rebuild QP (solver may modify state)
        qp2, tsp2 = build_qubo(matrix)
        r2 = solve_qaoa(qp2, tsp2, matrix, reps=1, shots=512, seed=42)
        assert r1["tour"] == r2["tour"]
        assert r1["cost_km"] == r2["cost_km"]
