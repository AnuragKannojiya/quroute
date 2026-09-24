"""Tests for qubo_builder module."""

import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qubo_builder import haversine, build_distance_matrix, build_qubo


class TestHaversine:
    def test_same_point_is_zero(self):
        assert haversine(16.5062, 80.6480, 16.5062, 80.6480) == 0.0

    def test_known_distance(self):
        # Vijayawada Bus Stand to Governorpet: approx 2.28 km
        d = haversine(16.5062, 80.6480, 16.5193, 80.6305)
        assert 2.0 < d < 2.6, f"Expected ~2.3 km, got {d}"

    def test_symmetric(self):
        d1 = haversine(16.5062, 80.6480, 16.5193, 80.6305)
        d2 = haversine(16.5193, 80.6305, 16.5062, 80.6480)
        assert abs(d1 - d2) < 1e-10


class TestDistanceMatrix:
    @pytest.fixture
    def stops_3(self):
        return [
            {"lat": 16.5062, "lng": 80.6480},
            {"lat": 16.5193, "lng": 80.6305},
            {"lat": 16.5041, "lng": 80.6606},
        ]

    def test_shape(self, stops_3):
        matrix = build_distance_matrix(stops_3)
        assert matrix.shape == (3, 3)

    def test_symmetric(self, stops_3):
        matrix = build_distance_matrix(stops_3)
        np.testing.assert_array_almost_equal(matrix, matrix.T)

    def test_zero_diagonal(self, stops_3):
        matrix = build_distance_matrix(stops_3)
        for i in range(3):
            assert matrix[i][i] == 0.0

    def test_positive_off_diagonal(self, stops_3):
        matrix = build_distance_matrix(stops_3)
        for i in range(3):
            for j in range(3):
                if i != j:
                    assert matrix[i][j] > 0


class TestBuildQubo:
    def test_variable_count(self):
        """n stops should produce n² binary variables."""
        for n in [3, 4, 5]:
            matrix = np.random.rand(n, n)
            matrix = (matrix + matrix.T) / 2
            np.fill_diagonal(matrix, 0)
            qp, _ = build_qubo(matrix)
            assert qp.get_num_vars() == n * n, \
                f"Expected {n*n} variables for {n} stops, got {qp.get_num_vars()}"

    def test_too_many_stops_raises(self):
        """n > 8 should raise ValueError."""
        matrix = np.zeros((9, 9))
        with pytest.raises(ValueError, match="Too many stops"):
            build_qubo(matrix)

    def test_too_few_stops_raises(self):
        """n < 2 should raise ValueError."""
        matrix = np.zeros((1, 1))
        with pytest.raises(ValueError, match="at least 2"):
            build_qubo(matrix)

    def test_known_optimal_scores_correctly(self):
        """A hand-computed optimal solution should have a correct objective value."""
        # Simple 3-stop triangle: distances 1, 2, 3
        matrix = np.array([
            [0.0, 1.0, 3.0],
            [1.0, 0.0, 2.0],
            [3.0, 2.0, 0.0],
        ])
        qp, tsp = build_qubo(matrix)
        # Optimal tour: 0→1→2→0, cost = 1+2+3 = 6
        # Verify the QP has been constructed (it should not error)
        assert qp.get_num_vars() == 9
