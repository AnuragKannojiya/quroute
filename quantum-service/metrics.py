"""Metrics Calculator — comparison metrics and fuel/CO₂ estimates.

Fuel assumptions (clearly labeled as indicative, not verified):
- Light delivery van: ~0.3 L diesel per km
- Diesel CO₂ emission: ~2.68 kg CO₂ per liter
"""


FUEL_RATE_L_PER_KM = 0.3    # liters diesel per km (light delivery van)
CO2_RATE_KG_PER_L = 2.68    # kg CO₂ per liter diesel


def compute_metrics(
    qaoa_cost: float,
    greedy_cost: float,
    optimal_cost: float | None = None,
) -> dict:
    """Compute comparison metrics and fuel/CO₂ estimates.

    Args:
        qaoa_cost: total route distance (km) for QAOA solution.
        greedy_cost: total route distance (km) for greedy solution.
        optimal_cost: total route distance (km) for brute-force optimal,
                      or None if brute force was skipped.

    Returns:
        Dict with improvement_over_greedy_pct, optimality_gap_pct,
        estimated_fuel_liters, estimated_co2_kg, fuel_saved_liters,
        co2_saved_kg.
    """
    metrics = {}

    # Improvement over greedy (positive = QAOA is better)
    if greedy_cost > 0:
        metrics["improvement_over_greedy_pct"] = round(
            (greedy_cost - qaoa_cost) / greedy_cost * 100, 2
        )
    else:
        metrics["improvement_over_greedy_pct"] = 0.0

    # Optimality gap (0% = QAOA found the optimal, positive = suboptimal)
    if optimal_cost is not None and optimal_cost > 0:
        metrics["optimality_gap_pct"] = round(
            (qaoa_cost - optimal_cost) / optimal_cost * 100, 2
        )
    else:
        metrics["optimality_gap_pct"] = None

    # Fuel and CO₂ for the QAOA route
    fuel = round(qaoa_cost * FUEL_RATE_L_PER_KM, 2)
    co2 = round(fuel * CO2_RATE_KG_PER_L, 2)
    metrics["estimated_fuel_liters"] = fuel
    metrics["estimated_co2_kg"] = co2

    # Fuel/CO₂ savings vs greedy
    if greedy_cost > qaoa_cost:
        saved_km = greedy_cost - qaoa_cost
        metrics["fuel_saved_liters"] = round(saved_km * FUEL_RATE_L_PER_KM, 2)
        metrics["co2_saved_kg"] = round(
            saved_km * FUEL_RATE_L_PER_KM * CO2_RATE_KG_PER_L, 2
        )
    else:
        metrics["fuel_saved_liters"] = 0.0
        metrics["co2_saved_kg"] = 0.0

    return metrics
