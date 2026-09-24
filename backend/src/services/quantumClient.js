/**
 * Quantum Service Client — Axios client for calling the quantum service.
 */

const axios = require('axios');

const QUANTUM_SERVICE_URL = process.env.QUANTUM_SERVICE_URL || 'http://quantum-service:8001';
const QUANTUM_TIMEOUT_MS = parseInt(process.env.QUANTUM_TIMEOUT_MS || '15000', 10);

/**
 * Call the quantum service /solve endpoint.
 *
 * @param {Object} params - Request parameters
 * @param {Array} params.stops - Array of stop objects with id, lat, lng, label
 * @param {number} params.reps - QAOA circuit depth
 * @param {number} params.shots - Number of measurement shots
 * @param {number} params.seed - Random seed for determinism
 * @param {boolean} params.fallback_mode - Whether to use cached results
 * @returns {Object} Quantum service response
 */
async function callQuantumService({ stops, reps, shots, seed, fallback_mode }) {
  try {
    const response = await axios.post(
      `${QUANTUM_SERVICE_URL}/solve`,
      {
        stops,
        reps,
        shots,
        seed,
        fallback_mode,
      },
      {
        timeout: QUANTUM_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      }
    );
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Quantum service timed out after ${QUANTUM_TIMEOUT_MS}ms`);
    }
    if (error.response) {
      const detail = error.response.data?.detail || error.response.statusText;
      throw new Error(`Quantum service error (${error.response.status}): ${detail}`);
    }
    throw new Error(`Quantum service unreachable: ${error.message}`);
  }
}

module.exports = { callQuantumService };
