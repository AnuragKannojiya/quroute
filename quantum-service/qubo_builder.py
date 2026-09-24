"""QUBO Builder — constructs distance matrix and QUBO formulation for TSP.

Converts a list of delivery stops (lat/lng) into a distance matrix using
haversine distance, then encodes the routing problem as a QuadraticProgram
using Qiskit's built-in TSP application class.
"""

import numpy as np
from math import radians, sin, cos, sqrt, atan2
from qiskit_optimization.applications import Tsp


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute haversine (great-circle) distance in km between two points."""
    R = 6371.0  # Earth radius in km
    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))


def build_distance_matrix(stops: list[dict]) -> np.ndarray:
    """Build symmetric n×n distance matrix from stops.

    Args:
        stops: list of dicts, each with 'lat' and 'lng' keys.

    Returns:
        numpy array of pairwise haversine distances in km, rounded to 4 decimals.
    """
    n = len(stops)
    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            d = haversine(
                stops[i]["lat"], stops[i]["lng"],
                stops[j]["lat"], stops[j]["lng"],
            )
            matrix[i][j] = d
            matrix[j][i] = d
    return np.round(matrix, 4)


def build_qubo(distance_matrix: np.ndarray):
    """Convert distance matrix to a QuadraticProgram via Qiskit TSP.

    Uses TSP one-hot encoding: n² binary variables (x[i][t] = 1 if stop i
    is visited at time-step t). Caps n at 8 (64 qubits).

    Args:
        distance_matrix: symmetric n×n numpy array of distances.

    Returns:
        Tuple of (QuadraticProgram, Tsp instance).

    Raises:
        ValueError: if n > 8 or n < 2.
    """
    n = distance_matrix.shape[0]
    if n > 8:
        raise ValueError(
            f"Too many stops ({n}). Maximum is 8 for QAOA path. "
            f"This would require {n * n} qubits which exceeds simulator capacity."
        )
    if n < 2:
        raise ValueError(f"Need at least 2 stops, got {n}.")

    tsp_instance = Tsp(distance_matrix)
    qp = tsp_instance.to_quadratic_program()
    return qp, tsp_instance
