/**
 * Optimize route — POST /api/optimize
 *
 * Accepts stops array, validates input, calls quantum service,
 * caches responses, and handles timeouts with automatic fallback.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { callQuantumService } = require('../services/quantumClient');
const { validateStops } = require('../services/geocoding');

const router = express.Router();

// In-memory response cache
const cache = new Map();
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000', 10); // 5 min default

/**
 * Generate a cache key from stops and params.
 */
function cacheKey(stops, reps, shots, seed) {
  const stopsKey = stops
    .map(s => `${s.lat},${s.lng}`)
    .sort()
    .join('|');
  return `${stopsKey}:${reps}:${shots}:${seed}`;
}

/**
 * Clean expired cache entries.
 */
function cleanCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

router.post('/optimize', async (req, res, next) => {
  try {
    const requestId = uuidv4();
    const {
      stops: rawStops,
      reps = 2,
      shots = 1024,
      seed = 42,
      fallback_mode = false,
    } = req.body;

    // Validate stops
    if (!rawStops || !Array.isArray(rawStops)) {
      return res.status(400).json({
        error: 'Missing or invalid "stops" array',
        request_id: requestId,
      });
    }

    const stops = validateStops(rawStops);

    if (stops.length < 3) {
      return res.status(400).json({
        error: `Need at least 3 stops, got ${stops.length}`,
        request_id: requestId,
      });
    }

    if (stops.length > 8) {
      return res.status(422).json({
        error: `Too many stops (${stops.length}). Maximum is 8 for QAOA path.`,
        request_id: requestId,
      });
    }

    // Check cache
    cleanCache();
    const key = cacheKey(stops, reps, shots, seed);
    if (!fallback_mode && cache.has(key)) {
      const cached = cache.get(key);
      console.log(`Cache hit for request ${requestId}`);
      return res.json({
        ...cached.data,
        request_id: requestId,
        from_cache: true,
      });
    }

    // Call quantum service
    let result;
    let usedFallback = fallback_mode;

    try {
      result = await callQuantumService({
        stops,
        reps,
        shots,
        seed,
        fallback_mode,
      });
    } catch (err) {
      // If quantum service times out or errors, auto-fallback
      console.error(`Quantum service error: ${err.message}. Falling back to cached mode.`);
      usedFallback = true;
      try {
        result = await callQuantumService({
          stops,
          reps,
          shots,
          seed,
          fallback_mode: true,
        });
      } catch (fallbackErr) {
        return next(new Error(`Both live and fallback quantum service calls failed: ${fallbackErr.message}`));
      }
    }

    // Cache the result
    if (!usedFallback) {
      cache.set(key, {
        data: result,
        timestamp: Date.now(),
      });
    }

    res.json({
      ...result,
      request_id: requestId,
      fallback_used: usedFallback,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
