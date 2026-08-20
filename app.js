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

/**
 * Log the user in by creating a new session, i.e. attaching the user's account to a session.
 *
 * Before creating a new session, the given authorization code gets exchanged for an access token
 * with an OpenID Provider (ACM/IDM) using the configured discovery URL. The returned JWT access token
 * is decoded to retrieve information to attach to the user, account and the session.
 * If the OpenID Provider returns a valid access token, a new user and account are created if they
 * don't exist yet and a the account is attached to the session.
 *
 * Body: { authorizationCode: "secret" }
 *
 * @return [201] On successful login containing the newly created session
 * @return [400] If the session header or authorization code is missing
 * @return [401] On login failure (unable to retrieve a valid access token)
 * @return [403] If no bestuurseenheid can be linked to the session
*/
app.post('/sessions', async function(req, res, next) {
  try {
    /** Guard clauses for missing headers */
    const sessionUri = req.get('mu-session-id');
    if (!sessionUri)
      throw httpError(400, 'Session header is missing');
  
    const authorizationCode = req.body['authorizationCode'];
    if (!authorizationCode)
      throw httpError(400, 'Authorization code is missing');

    /** Retrieve the access token */
    const tokenSet = await getAccessToken(authorizationCode);

    /** Make sure there are no old sessions for this account */
    await deleteSessionById(sessionUri);

    const claims = tokenSet.claims();

    if (DEBUG_LOG_TOKENSETS) {
      console.log(`Received tokenSet ${JSON.stringify(tokenSet)} including claims ${JSON.stringify(claims)}`);
    }

    if (LOG_SINK_URL)
      request.post({ url: LOG_SINK_URL, body: tokenSet, json: true });

    /** Strategy */
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


/**
 * Log out from the current session, i.e. detaching the session from the user's account.
 *
 * @return [204] On successful logout
 * @return [400] If the session header is missing or invalid
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

/**
 * Get the current session
 *
 * @return [200] The current session
 * @return [400] If the session header is missing or invalid
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


/**
 * Error handler translating thrown errors to HTTP responses
*/
app.use(function(err, req, res, next) {
  console.log(`Error: ${err.message}`);
  if (err.headers)
    res.set(err.headers);
  res.status(err.status || 500);
  res.json({
    errors: [ {title: err.message} ]
  });
});
