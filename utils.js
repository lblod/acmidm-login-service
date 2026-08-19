/**
 * Helper function to return an error response
*/
const httpError = function(status, message = '', headers = {}) {
  const error = new Error(message || '');
  error.status = status;
  error.headers = headers;
  return error;
}

export {
  httpError
}
