/**
 * QuRoute Backend — Express server for orchestrating quantum service calls.
 *
 * Handles input validation, response caching, timeout/fallback handling,
 * and serves as the bridge between the frontend and quantum service.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const optimizeRouter = require('./routes/optimize');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

// Routes
app.use('/api', optimizeRouter);

// Error handling (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`QuRoute backend listening on port ${PORT}`);
  console.log(`Quantum service URL: ${process.env.QUANTUM_SERVICE_URL || 'http://quantum-service:8001'}`);
});

module.exports = app;
