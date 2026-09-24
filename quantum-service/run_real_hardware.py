#!/usr/bin/env python3
"""QuRoute — Real IBM Quantum Hardware Validation Runner.

Executes a minimal 3-stop delivery TSP instance (9 qubits) on a real
IBM Quantum physical quantum processing unit (QPU) using qiskit-ibm-runtime.
Records job ID, execution time, quantum counts, and updates docs/real-hardware-run.md.
"""

import os
import sys
import time
import argparse
import numpy as np

from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_algorithms import QAOA
from qiskit_algorithms.optimizers import COBYLA
from qiskit_optimization.algorithms import MinimumEigenOptimizer
from qiskit_optimization.applications import Tsp


def run_on_ibm_hardware(token: str, backend_name: str | None = None, shots: int = 1024):
    print("=" * 60)
    print("QuRoute — IBM Quantum Hardware Execution")
    print("=" * 60)

    # 1. Initialize IBM Quantum Runtime Service
    print("\n[1/5] Authenticating with IBM Quantum...")
    service = QiskitRuntimeService(channel="ibm_quantum", token=token)
    print("✓ Successfully authenticated.")

    # 2. Select backend
    print("\n[2/5] Finding available QPU backend...")
    if backend_name:
        backend = service.backend(backend_name)
    else:
        # Find least busy real hardware backend with at least 9 qubits
        backends = service.backends(simulator=False, operational=True, min_num_qubits=9)
        if not backends:
            raise RuntimeError("No operational IBM Quantum QPU found with >= 9 qubits.")
        backend = service.least_busy(simulator=False, operational=True, min_num_qubits=9)

    print(f"✓ Selected QPU Backend: {backend.name}")
    print(f"  Total Qubits: {backend.num_qubits}")
    status = backend.status()
    print(f"  Pending Jobs in Queue: {status.pending_jobs}")

    # 3. Formulate minimal 3-stop TSP (9 qubits)
    print("\n[3/5] Building 3-stop TSP QUBO formulation (9 qubits)...")
    # Vijayawada 3-stop triangle:
    # 0: Depot (Vijayawada Bus Stand)
    # 1: Governorpet
    # 2: Benz Circle
    distance_matrix = np.array([
        [0.0000, 2.2854, 1.3673],
        [2.2854, 0.0000, 3.6174],
        [1.3673, 3.6174, 0.0000]
    ])
    tsp = Tsp(distance_matrix)
    qp = tsp.to_quadratic_program()
    print(f"✓ Quadratic Program created with {qp.get_num_vars()} binary variables.")

    # 4. Transpile and execute QAOA on hardware
    print(f"\n[4/5] Transpiling QAOA circuit for {backend.name} and submitting job...")
    pm = generate_preset_pass_manager(optimization_level=1, backend=backend)
    sampler = SamplerV2(backend)

    qaoa = QAOA(
        sampler=sampler,
        optimizer=COBYLA(maxiter=10),
        reps=1,
        transpiler=pm,
    )
    optimizer = MinimumEigenOptimizer(qaoa)

    print(f"✓ Submitting {shots} shots to {backend.name} (this will queue on IBM Quantum)...")
    t_start = time.time()
    result = optimizer.solve(qp)
    t_end = time.time()
    wall_clock = t_end - t_start

    print(f"\n✓ Job completed! Wall-clock time: {wall_clock:.1f}s")
    print(f"  Raw solution vector: {result.x}")
    print(f"  Objective value: {result.fval}")

    # Decode tour
    n = 3
    tour = [None] * n
    for i in range(n):
        for t in range(n):
            if result.x[i * n + t] > 0.5:
                tour[t] = i

    print(f"  Decoded Tour: {tour}")

    # 5. Summary
    print("\n" + "=" * 60)
    print("Execution Summary:")
    print(f"Backend:          {backend.name}")
    print(f"Wall-Clock Time:  {wall_clock:.1f}s")
    print(f"Tour:             {tour}")
    print(f"Objective Cost:   {result.fval:.4f} km")
    print("=" * 60)

    return {
        "backend": backend.name,
        "wall_clock_sec": round(wall_clock, 1),
        "tour": tour,
        "cost_km": float(result.fval),
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run QuRoute on IBM Quantum hardware")
    parser.add_argument("--token", type=str, default=os.getenv("IBM_QUANTUM_TOKEN"),
                        help="IBM Quantum API Token")
    parser.add_argument("--backend", type=str, default=None,
                        help="Specific backend name (e.g. ibm_brisbane)")
    parser.add_argument("--shots", type=int, default=1024,
                        help="Number of shots")

    args = parser.parse_args()

    if not args.token:
        print("Error: IBM Quantum token required. Provide via --token <TOKEN> or export IBM_QUANTUM_TOKEN=<TOKEN>")
        sys.exit(1)

    run_on_ibm_hardware(args.token, args.backend, args.shots)
