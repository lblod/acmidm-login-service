import { query, update } from 'mu';

/* Run a query as sudo through the template's SPARQL client. Requires ALLOW_MU_AUTH_SUDO. */
const querySudo = function(queryString) {
  return query(queryString, { sudo: true });
};

/* Run an update as sudo through the template's SPARQL client. Requires ALLOW_MU_AUTH_SUDO. */
const updateSudo = function(queryString) {
  return update(queryString, { sudo: true });
};

export {
  querySudo,
  updateSudo
};
