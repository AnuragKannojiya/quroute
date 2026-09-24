"""Classical Baseline — nearest-neighbor greedy TSP solver."""

import numpy as np


def solve_greedy(distance_matrix: np.ndarray) -> dict:
    """Nearest-neighbor greedy TSP solver.

    Starts at stop 0, repeatedly visits the nearest unvisited stop,
    then returns to start (round-trip).

    Args:
        distance_matrix: symmetric n×n distance matrix in km.

    Returns:
        Dict with 'tour' (list of stop indices) and 'cost_km' (float).
    """
    n = distance_matrix.shape[0]
    if n < 2:
        return {"tour": list(range(n)), "cost_km": 0.0}

    visited = [False] * n
    tour = [0]
    visited[0] = True
    total_cost = 0.0

    for _ in range(n - 1):
        current = tour[-1]
        nearest = None
        nearest_dist = float("inf")
        for j in range(n):
            if not visited[j] and distance_matrix[current][j] < nearest_dist:
                nearest = j
                nearest_dist = distance_matrix[current][j]
        tour.append(nearest)
        visited[nearest] = True
        total_cost += nearest_dist

    # Return to start (TSP is a cycle)
    total_cost += distance_matrix[tour[-1]][tour[0]]

    return {"tour": tour, "cost_km": round(float(total_cost), 4)}
