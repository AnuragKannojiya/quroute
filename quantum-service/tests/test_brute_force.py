"""Tests for brute_force module."""

import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from brute_force import solve_brute_force


class TestSolveBruteForce:
    @pytest.fixture
    def matrix_4(self):
        """4-stop instance with known optimal tour.

        Distance matrix:
            0   1   2   3
        0 [ 0,  2,  9,  10]
        1 [ 2,  0,  6,  4 ]
        2 [ 9,  6,  0,  8 ]
        3 [10,  4,  8,  0 ]

        All permutations from 0:
        0-1-2-3: 2+6+8+10 = 26
        0-1-3-2: 2+4+8+9  = 23  ← optimal
        0-2-1-3: 9+6+4+10 = 29
        0-2-3-1: 9+8+4+2  = 23  ← tied optimal
        0-3-1-2: 10+4+6+9 = 29
        0-3-2-1: 10+8+6+2 = 26
        """
        return np.array([
            [0, 2, 9, 10],
            [2, 0, 6, 4],
            [9, 6, 0, 8],
            [10, 4, 8, 0],
        ], dtype=float)

    def test_finds_optimal_cost(self, matrix_4):
        result = solve_brute_force(matrix_4)
        assert result["cost_km"] == 23.0

    def test_not_skipped(self, matrix_4):
        result = solve_brute_force(matrix_4)
        assert result["skipped"] is False

    def test_tour_is_valid(self, matrix_4):
        result = solve_brute_force(matrix_4)
        tour = result["tour"]
        assert len(tour) == 4
        assert set(tour) == {0, 1, 2, 3}
        assert tour[0] == 0

    def test_guard_clause_n_above_10(self):
        """n > 10 should return skipped=True, not hang."""
        matrix = np.zeros((11, 11))
        result = solve_brute_force(matrix)
        assert result["skipped"] is True
        assert result["tour"] is None
        assert result["cost_km"] is None

    def test_guard_clause_n_exactly_10(self):
        """n = 10 should still run (not skip)."""
        matrix = np.random.rand(10, 10)
        matrix = (matrix + matrix.T) / 2
        np.fill_diagonal(matrix, 0)
        result = solve_brute_force(matrix)
        assert result["skipped"] is False
        assert result["tour"] is not None

    def test_simple_triangle(self):
        """3 stops, only one possible tour (0→1→2→0)."""
        matrix = np.array([
            [0.0, 1.0, 2.0],
            [1.0, 0.0, 3.0],
            [2.0, 3.0, 0.0],
        ])
        result = solve_brute_force(matrix)
        assert result["cost_km"] == 6.0  # 1+3+2 or 2+3+1 = 6 either way
        assert result["skipped"] is False
