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
