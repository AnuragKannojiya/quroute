"""Tests for classical_baseline module."""

import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from classical_baseline import solve_greedy


class TestSolveGreedy:
    @pytest.fixture
    def matrix_4(self):
        """4-stop instance with known nearest-neighbor tour.

        Distance matrix:
            0   1   2   3
        0 [ 0,  2,  9,  10]
        1 [ 2,  0,  6,  4 ]
        2 [ 9,  6,  0,  8 ]
        3 [10,  4,  8,  0 ]

        Nearest-neighbor from 0:
        0 → 1 (d=2) → 3 (d=4) → 2 (d=8) → 0 (d=9) = 23
        """
        return np.array([
            [0, 2, 9, 10],
            [2, 0, 6, 4],
            [9, 6, 0, 8],
            [10, 4, 8, 0],
        ], dtype=float)

    def test_correct_tour(self, matrix_4):
        result = solve_greedy(matrix_4)
        assert result["tour"] == [0, 1, 3, 2], \
            f"Expected tour [0, 1, 3, 2], got {result['tour']}"

    def test_correct_cost(self, matrix_4):
        result = solve_greedy(matrix_4)
        # 0→1=2, 1→3=4, 3→2=8, 2→0=9 → total=23
        assert result["cost_km"] == 23.0

    def test_visits_each_stop_once(self, matrix_4):
        result = solve_greedy(matrix_4)
        tour = result["tour"]
        assert len(tour) == 4
        assert set(tour) == {0, 1, 2, 3}

    def test_starts_at_zero(self, matrix_4):
        result = solve_greedy(matrix_4)
        assert result["tour"][0] == 0

    def test_single_stop(self):
        matrix = np.array([[0.0]])
        result = solve_greedy(matrix)
        assert result["tour"] == [0]
        assert result["cost_km"] == 0.0

    def test_two_stops(self):
        matrix = np.array([[0.0, 5.0], [5.0, 0.0]])
        result = solve_greedy(matrix)
        assert result["tour"] == [0, 1]
        assert result["cost_km"] == 10.0  # 5 there + 5 back
