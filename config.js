export const USER_ID_CLAIM = process.env.MU_APPLICATION_AUTH_USERID_CLAIM || 'rrn';
export const ACCOUNT_ID_CLAIM = process.env.MU_APPLICATION_AUTH_ACCOUNTID_CLAIM || 'vo_id';
export const GROUP_ID_CLAIM = process.env.MU_APPLICATION_AUTH_GROUPID_CLAIM || 'vo_orgcode';
export const ROLE_CLAIM = process.env.MU_APPLICATION_AUTH_ROLE_CLAIM || 'abb_loketLB_rol_3d';
export const RESOURCE_BASE_URI = process.env.MU_APPLICATION_RESOURCE_BASE_URI || 'http://data.lblod.info/';
export const APPLICATION_GRAPH = process.env.MU_APPLICATION_GRAPH || 'http://mu.semte.ch/graphs/public';
export const USER_GRAPH_TEMPLATE = process.env.USER_GRAPH_TEMPLATE || 'http://mu.semte.ch/graphs/organizations/{{groupId}}';
export const ACCOUNT_GRAPH_TEMPLATE = process.env.ACCOUNT_GRAPH_TEMPLATE || 'http://mu.semte.ch/graphs/organizations/{{groupId}}';
export const SESSION_GRAPH = process.env.SESSION_GRAPH || 'http://mu.semte.ch/graphs/sessions';
export const ORGANIZATION_TYPE = process.env.ORGANIZATION_TYPE || 'http://data.vlaanderen.be/ns/besluit#Bestuurseenheid';
export const GROUP_TYPE_LABEL = process.env.GROUP_TYPE_LABEL || 'bestuurseenheden';
export const SUPPORTED_GROUP_TYPE_LABELS = ['bestuurseenheden', 'organizations'];
export const ENABLE_EMAIL_CLAIM = process.env.ENABLE_EMAIL_CLAIM === 'true';
export const LOGS_GRAPH = process.env.LOGS_GRAPH || 'http://mu.semte.ch/graphs/public';
export const DEBUG_LOG_TOKENSETS = Boolean(process.env.DEBUG_LOG_TOKENSETS);
export const LOG_SINK_URL = process.env.LOG_SINK_URL;

export const DISCOVERY_URL = process.env.MU_APPLICATION_AUTH_DISCOVERY_URL;
export const CLIENT_ID = process.env.MU_APPLICATION_AUTH_CLIENT_ID;
export const CLIENT_SECRET = process.env.MU_APPLICATION_AUTH_CLIENT_SECRET;
export const JWK_PRIVATE_KEY = process.env.MU_APPLICATION_AUTH_JWK_PRIVATE_KEY || '/config/jwk_private_key.json';
export const REDIRECT_URI = process.env.MU_APPLICATION_AUTH_REDIRECT_URI;
export const REQUEST_TIMEOUT = parseInt(process.env.MU_APPLICATION_AUTH_REQUEST_TIMEOUT, 10) || 5000;
export const SPARQL_ENDPOINT = process.env.MU_SPARQL_ENDPOINT;

export const REQUIRED_CONFIGURATION = {
  MU_APPLICATION_AUTH_DISCOVERY_URL: DISCOVERY_URL,
  MU_APPLICATION_AUTH_CLIENT_ID: CLIENT_ID,
  MU_APPLICATION_AUTH_REDIRECT_URI: REDIRECT_URI
};
