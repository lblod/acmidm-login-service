const getSessionIdHeader = function(request) {
  return request.get('mu-session-id');
};

const getRewriteUrlHeader = function(request) {
  return request.get('x-rewrite-url');
};

export {
  getSessionIdHeader,
  getRewriteUrlHeader
}
