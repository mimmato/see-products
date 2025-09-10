/**
 * Error handling utilities for Express API
 */

/**
 * Async handler wrapper to catch async/await errors
 * @param {Function} fn - Async function to wrap
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Send error response
 * @param {Response} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {any} data - Additional error data
 */
function sendError(res, message, statusCode = 500, data = null) {
  res.status(statusCode).json({
    success: false,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send success response
 * @param {Response} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
function sendSuccess(res, data, message = 'Success', statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Global error handler middleware
 * @param {Error} error - Error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Next function
 */
function globalErrorHandler(error, req, res, next) {
  console.error('Global Error Handler:', error);

  // Database connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return sendError(res, 'Database connection failed', 503);
  }

  // PostgreSQL errors
  if (error.code && error.code.startsWith('22')) { // Data exception
    return sendError(res, 'Invalid data format', 400);
  }

  if (error.code && error.code.startsWith('23')) { // Integrity constraint violation
    return sendError(res, 'Data constraint violation', 409);
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    return sendError(res, error.message, 400);
  }

  // Default error
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';
  
  sendError(res, message, statusCode);
}

module.exports = {
  asyncHandler,
  sendError,
  sendSuccess,
  globalErrorHandler
};