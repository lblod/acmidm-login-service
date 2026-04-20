import { app } from 'mu';
import { getSessionIdHeader, error } from './utils';
import { saveLog } from './logs';
import { getAccessToken } from './lib/openid';
import { roleClaim, groupIdClaim, removeOldSessions, removeCurrentSession,
         ensureUserAndAccount, insertNewSessionForAccount,
         selectAccountBySession, selectCurrentSession,
         selectBestuurseenheidByNumber } from './lib/session';
import request from 'request';

const logsGraph = process.env.LOGS_GRAPH || 'http://mu.semte.ch/graphs/public';

/**
 * Configuration validation on startup
 */
const requiredEnvironmentVariables = [
  'MU_APPLICATION_AUTH_DISCOVERY_URL',
  'MU_APPLICATION_AUTH_CLIENT_ID',
  'MU_APPLICATION_AUTH_REDIRECT_URI'
];
requiredEnvironmentVariables.forEach(key => {
  if (!process.env[key]) {
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
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri)
    return error(res, 'Session header is missing');

  const authorizationCode = req.body['authorizationCode'];
  if (!authorizationCode)
    return error(res, 'Authorization code is missing');

  try {
    let tokenSet;
    try {
      tokenSet = await getAccessToken(authorizationCode);
    } catch(e) {
      console.log(`Failed to retrieve access token for authorization code: ${e.message || e}`);
      return res.status(401).end();
    }

    await removeOldSessions(sessionUri);

    const claims = tokenSet.claims();

    if (process.env['DEBUG_LOG_TOKENSETS']) {
      console.log(`Received tokenSet ${JSON.stringify(tokenSet)} including claims ${JSON.stringify(claims)}`);
    }

    if (process.env['LOG_SINK_URL'])
      request.post({ url: process.env['LOG_SINK_URL'], body: tokenSet, json: true });

    const { groupUri, groupId } = await selectBestuurseenheidByNumber(claims);

    if (!groupUri || !groupId) {
      console.log(`User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`);
      saveLog(
        logsGraph,
        `http://data.lblod.info/class-names/no-bestuurseenheid-for-role`,
        `User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`,
        sessionUri,
        claims[groupIdClaim]);
      return res.header('mu-auth-allowed-groups', 'CLEAR').status(403).end();
    }

    const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);
    const roles = (claims[roleClaim] || []).map(r => r.split(':')[0]);

    const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

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
          links: { related: `/bestuurseenheden/${groupId}` },
          data: { type: 'bestuurseenheden', id: groupId }
        }
      }
    });
  } catch(e) {
    return next(new Error(e.message));
  }
});


/**
 * Log out from the current session, i.e. detaching the session from the user's account.
 *
 * @return [204] On successful logout
 * @return [400] If the session header is missing or invalid
*/
app.delete('/sessions/current', async function(req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri)
    return error(res, 'Session header is missing');

  try {
    const { accountUri } = await selectAccountBySession(sessionUri);
    if (!accountUri)
      return error(res, 'Invalid session');

    await removeCurrentSession(sessionUri);

    return res.header('mu-auth-allowed-groups', 'CLEAR').status(204).end();
  } catch(e) {
    return next(new Error(e.message));
  }
});

/**
 * Get the current session
 *
 * @return [200] The current session
 * @return [400] If the session header is missing or invalid
*/
app.get('/sessions/current', async function(req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri)
    return next(new Error('Session header is missing'));

  try {
    const { accountUri, accountId } = await selectAccountBySession(sessionUri);
    if (!accountUri)
      return error(res, 'Invalid session');

    const { sessionId, groupId, roles } = await selectCurrentSession(accountUri);

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
          links: { related: `/bestuurseenheden/${groupId}` },
          data: { type: 'bestuurseenheden', id: groupId }
        }
      }
    });
  } catch(e) {
    return next(new Error(e.message));
  }
});

/**
 * !!!!!!!!!!!!!!!!!!!!!!!!!!! DEBUG ONLY   !!!!!!!!!!!!!!!!!!!!!!!!!!!
 * !!!!!!!!!!!!!!!!!!!!!!!!!!! DON'T EXPOSE !!!!!!!!!!!!!!!!!!!!!!!!!!!
 *
 * You can use this endpoint and come very close to impersonating a user logged in through ACM.
 * By submitting the decoded claims, you'll be able to get a session for this users.
 * You'll find these decoded claims in the logs when someone logs in through ACM.
 * Once you have these, it's a literal copy/paste POST request
 * You'll need wiring in dispatcher to make this thing work.
 *
 *  match "/debug/sessions/*path", @json do
 *    Proxy.forward conn, path, "http://login/debug/sessions/"
 *  end
 *
 *  Also using it through the frontend, you will need to spoof it:
 *    see: https://cloud.ruizdearcaute.com/s/AATJdEoLaGNdZBx
 *
 * Be cautious. Know what you are doing...
 *
 * Log the user in by creating a new session, i.e. attaching the user's account to a session.
 *
 *
 * Example Body:
 *    {
 *     "some_rol_2d": [
 *       "SOME_ROLE:OVO_CODE"
 *     ],
 *     "at_hash": "STUB_DATA",
 *     "aud": "STUB_DATA",
 *     "azp": "STUB_DATA",
 *     "cot": "STUB_DATA",
 *     "exp": STUB_DATA,
 *     "family_name": "Doe",
 *     "given_name": "John",
 *     "iat": STUB_DATA,
 *     "iss": "STUB_DATA",
 *     "kid": "STUB_DATA",
 *     "sub": "STUB_DATA",
 *     "vo_doelgroepcode": "STUB_DATA",
 *     "vo_email": "john.doe@example.com",
 *     "vo_orgcode": "STUB_DATA",
 *     "vo_orgnaam": "STUB_DATA"
 *    }
 *
 * @return [201] On successful login containing the newly created session
 * @return [403] If no bestuurseenheid can be linked to the session
*/
app.post('/debug/sessions/claims', async function(req, res, next) {
  const sessionUri = getSessionIdHeader(req);
  if (!sessionUri)
    return error(res, 'Session header is missing');

  try {
    await removeOldSessions(sessionUri);

    const claims = req.body;

    if (process.env['DEBUG_LOG_TOKENSETS']) {
      console.log(`Received claims to DEBUG: ${JSON.stringify(claims)}`);
    }

    if (process.env['LOG_SINK_URL'])
      request.post({ url: process.env['LOG_SINK_URL'], body: claims, json: true });

    const { groupUri, groupId } = await selectBestuurseenheidByNumber(claims);

    if (!groupUri || !groupId) {
      console.log(`User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`);
      saveLog(
        logsGraph,
        `http://data.lblod.info/class-names/no-bestuurseenheid-for-role`,
        `User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`,
        sessionUri,
        claims[groupIdClaim]);
      return res.header('mu-auth-allowed-groups', 'CLEAR').status(403).end();
    }

    const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);
    const roles = (claims[roleClaim] || []).map(r => r.split(':')[0]);

    const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

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
          links: { related: `/bestuurseenheden/${groupId}` },
          data: { type: 'bestuurseenheden', id: groupId }
        }
      }
    });
  } catch(e) {
    return next(new Error(e.message));
  }
});


/**
 * Error handler translating thrown Errors to 500 HTTP responses
*/
app.use(function(err, req, res, next) {
  console.log(`Error: ${err.message}`);
  res.status(500);
  res.json({
    errors: [ {title: err.message} ]
  });
});
