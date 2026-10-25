/* Build an error for the shared HTTP error handler. */
const httpError = function(statusCode, message = '', headers = {}) {
  const error = new Error(message || '');
  error.status = statusCode;
  error.headers = headers;
  return error;
};

/*
 * Drop the mu-auth group headers the template copies from SPARQL responses.
 * Sudo queries don't compute the session's groups (sparql-parser returns an
 * empty list), so forwarding them would make the identifier cache no groups.
 */
const removeQueryAuthHeaders = function(res) {
  res.removeHeader('mu-auth-allowed-groups');
  res.removeHeader('mu-auth-used-groups');
};

export {
  httpError,
  removeQueryAuthHeaders
};
