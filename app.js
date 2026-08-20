import { app } from 'mu';
import request from 'request';
import { httpError } from './utils';
import { getAccessToken } from './lib/openid';
import { deleteSessionById, selectAccountBySession, selectCurrentSession } from './lib/session';
import {
  DEBUG_LOG_TOKENSETS,
  GROUP_TYPE_LABEL,
  LOG_SINK_URL,
  REQUIRED_CONFIGURATION
} from './config';
import { organisationLoginStrategy } from './strategies/organisations';
import { bestuurseenheidLoginStrategy } from './strategies/bestuurseenheden';

/**
 * Configuration validation on startup
 */
Object.entries(REQUIRED_CONFIGURATION).forEach(([key, value]) => {
  if (!value) {
    console.log(`Environment variable ${key} must be configured`);
    process.exit(1);
  }
});

/*
 * Create a session:
 * - exchange the authorization code
 * - remove the previous session
 * - delegate group-specific login work
 *
 * Body: { authorizationCode: "secret" }
 *
 * Returns:
 * - [201] Newly created session
 * - [400] Missing session header or authorization code
 * - [401] Invalid authorization code or failed token exchange
 * - [403] No matching group
 */
app.post('/sessions', async function(req, res, next) {
  try {
    const sessionUri = req.get('mu-session-id');
    if (!sessionUri)
      throw httpError(400, 'Session header is missing');
  
    const authorizationCode = req.body['authorizationCode'];
    if (!authorizationCode)
      throw httpError(400, 'Authorization code is missing');

    const tokenSet = await getAccessToken(authorizationCode);

    await deleteSessionById(sessionUri);

    const claims = tokenSet.claims();

    if (DEBUG_LOG_TOKENSETS) {
      console.log(`Received tokenSet ${JSON.stringify(tokenSet)} including claims ${JSON.stringify(claims)}`);
    }

    if (LOG_SINK_URL)
      request.post({ url: LOG_SINK_URL, body: tokenSet, json: true });

    let sessionId, groupId, accountId, roles;

    if (GROUP_TYPE_LABEL === 'organization' || GROUP_TYPE_LABEL === 'organisation') {
      ({ sessionId, groupId, accountId, roles } = await organisationLoginStrategy(claims, sessionUri));
    } else {
      ({ sessionId, groupId, accountId, roles } = await bestuurseenheidLoginStrategy(claims, sessionUri));
    }

    return res.header('mu-auth-allowed-groups', 'CLEAR').status(201).send({
      links: {
        self: '/sessions/current'
      },
      data: {
        type: 'sessions',
        id: sessionId,
        attributes: {
          roles: roles
        }
      },
      relationships: {
        account: {
          links: { related: `/accounts/${accountId}` },
          data: { type: 'accounts', id: accountId }
        },
        group: {
          links: { related: `/${GROUP_TYPE_LABEL}/${groupId}` },
          data: { type: GROUP_TYPE_LABEL, id: groupId }
        }
      }
    });
  } catch(e) {
    return next(e);
  }
});

/*
 * Remove the current session after checking that it belongs to an account.
 *
 * Returns:
 * - [204] Session removed
 * - [400] Missing session header or invalid session
 */
app.delete('/sessions/current', async function(req, res, next) {
  try {
    const sessionUri = req.get('mu-session-id');
    if (!sessionUri)
      throw httpError(400, 'Session header is missing');

    const { accountUri } = await selectAccountBySession(sessionUri);
    if (!accountUri)
      throw httpError(400, 'Invalid session');

    await deleteSessionById(sessionUri);

    return res.header('mu-auth-allowed-groups', 'CLEAR').status(204).end();
  } catch(e) {
    return next(e);
  }
});

/*
 * Find the current session and return the standard session response.
 *
 * Returns:
 * - [200] Current session
 * - [400] Missing session header or invalid session
 */
app.get('/sessions/current', async function(req, res, next) {
  try {
    const sessionUri = req.get('mu-session-id');
    if (!sessionUri)
      throw httpError(400, 'Session header is missing');

    const { accountUri, accountId } = await selectAccountBySession(sessionUri);
    if (!accountUri)
      throw httpError(400, 'Invalid session');

    const { sessionId, groupId, roles } = await selectCurrentSession(sessionUri, accountUri);

    return res.status(200).send({
      links: {
        self: '/sessions/current'
      },
      data: {
        type: 'sessions',
        id: sessionId,
        attributes: {
          roles: roles
        }
      },
      relationships: {
        account: {
          links: { related: `/accounts/${accountId}` },
          data: { type: 'accounts', id: accountId }
        },
        group: {
          links: { related: `/${GROUP_TYPE_LABEL}/${groupId}` },
          data: { type: GROUP_TYPE_LABEL, id: groupId }
        }
      }
    });
  } catch(e) {
    return next(e);
  }
});

/* Convert application errors to JSON:API error responses. */
app.use(function(err, req, res, next) {
  console.log(`Error: ${err.message}`);
  if (err.headers)
    res.set(err.headers);
  res.status(err.status || 500);
  res.json({
    errors: [ {title: err.message} ]
  });
});
