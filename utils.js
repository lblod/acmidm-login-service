/* Build an error for the shared HTTP error handler. */
const httpError = function(statusCode, message = '', headers = {}) {
  const error = new Error(message || '');
  error.status = statusCode;
  error.headers = headers;
  return error;
};

export {
  httpError
};
