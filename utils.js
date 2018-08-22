/**
 * Get the session ID from the request headers
 * 
 * @return {string} The session ID from the request headers
*/
const getSessionIdHeader = function(request) {
  return request.get('mu-session-id');
};

/**
 * Get the rewrite URL from the request headers
 * 
 * @return {string} The rewrite URL from the request headers
*/
const getRewriteUrlHeader = function(request) {
  return request.get('x-rewrite-url');
};

/**
 * Helper function to return an error response
*/
const error = function(res, message, status = 400) {
  return res.status(status).json({errors: [ { title: message } ] });
};

export {
  getSessionIdHeader,
  getRewriteUrlHeader,
  error
}
