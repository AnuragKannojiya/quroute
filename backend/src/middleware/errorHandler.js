/**
 * Error Handler Middleware — catches all errors and returns clean JSON responses.
 */

function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }

  // Determine status code
  let statusCode = err.statusCode || err.status || 500;

  // Handle specific error types
  if (err.message.includes('invalid coordinates') || err.message.includes('out of range')) {
    statusCode = 400;
  }
  if (err.message.includes('Too many stops')) {
    statusCode = 422;
  }

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    status: statusCode,
  });
}

module.exports = errorHandler;
