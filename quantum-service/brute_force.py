"""Brute Force Solver — exact TSP via exhaustive permutation search."""

from itertools import permutations
import numpy as np


def solve_brute_force(distance_matrix: np.ndarray) -> dict:
    """Exact TSP solver via full permutation enumeration.

    Finds the globally optimal tour by evaluating every possible permutation.
    Guard clause: refuses to run if n > 10 (10! = 3.6M permutations is the
    practical upper bound).

    Args:
        distance_matrix: symmetric n×n distance matrix in km.

    Returns:
        Dict with 'tour', 'cost_km', and 'skipped' flag.
        If n > 10, returns skipped=True with null tour/cost.
    """
    n = distance_matrix.shape[0]

    if n > 10:
        return {
            "tour": None,
            "cost_km": None,
            "skipped": True,
        }

    if n < 2:
        return {"tour": list(range(n)), "cost_km": 0.0, "skipped": False}

    best_tour = None
    best_cost = float("inf")

    # Fix first city as 0 to avoid counting symmetric/rotational duplicates
    remaining = list(range(1, n))
    for perm in permutations(remaining):
        tour = [0] + list(perm)
        cost = sum(
            distance_matrix[tour[i]][tour[i + 1]] for i in range(n - 1)
        )
        cost += distance_matrix[tour[-1]][tour[0]]  # return to start
        if cost < best_cost:
            best_cost = cost
            best_tour = tour

    return {
        "tour": best_tour,
        "cost_km": round(float(best_cost), 4),
        "skipped": False,
    }
