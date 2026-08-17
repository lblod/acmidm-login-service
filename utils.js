/**
 * Helper function to return an error response
*/
export const error = function(res, message, status = 400) {
  return res.status(status).json({errors: [ { title: message } ] });
};
