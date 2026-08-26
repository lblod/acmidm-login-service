/**
 * Overview
 *
 * Tests the current-session HTTP routes with a valid session and no session.
 * The suite reads a session, deletes it, and checks invalid requests.
 *
 * Setup: a test-only organisation, account, and session.
 * Cleanup: graphs created by this suite and its local HTTP server.
 */

/** Dependencies and test data. */
const http = require('node:http');
const { querySudo: query, updateSudo: update } = require('@lblod/mu-auth-sudo');
const { TEST_GRAPH_ROOT, organisations } = require('../config');
const { applyTestEnvironment, graphForGroup, loginAs } = require('../shared');

/** Test graph and login settings. */
const graphs = {
  application: `${TEST_GRAPH_ROOT}current-session/application`,
  logs: `${TEST_GRAPH_ROOT}current-session/logs`,
  resourceTemplate: `${TEST_GRAPH_ROOT}current-session/{{groupId}}`,
  session: `${TEST_GRAPH_ROOT}current-session/sessions`
};

const testCase = {
  organisation: organisations.affligem,
  seed: organisationSeed('affligem'),
  sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-current-session-affligem'
};

applyTestEnvironment({
  ACCOUNT_GRAPH_TEMPLATE: graphs.resourceTemplate,
  GROUP_TYPE_LABEL: 'organizations',
  LOGS_GRAPH: graphs.logs,
  LOG_SPARQL_ALL: 'false',
  MU_APPLICATION_AUTH_CLIENT_ID: 'test-client',
  MU_APPLICATION_AUTH_DISCOVERY_URL: 'https://openid.example.test/.well-known/openid-configuration',
  MU_APPLICATION_AUTH_REDIRECT_URI: 'https://app.example.test/authorization/callback',
  MU_APPLICATION_AUTH_ROLE_CLAIM: 'abb_subsidiepunt_rol_2d',
  MU_APPLICATION_GRAPH: graphs.application,
  ORGANIZATION_TYPE: 'http://www.w3.org/ns/org#Organization',
  SESSION_GRAPH: graphs.session,
  USER_GRAPH_TEMPLATE: graphs.resourceTemplate
});

require('../../app');
const { app } = require('mu');
const { organisationLoginStrategy } = require('../../strategies/organisations');

/** HTTP route tests. */
describe('Current session', () => {
  let sessionData;
  let server;

  beforeAll(async () => {
    server = await startServer(app);
  });

  beforeEach(async () => {
    await cleanup();
    await seedOrganisation(testCase);
    sessionData = await loginAs(organisationLoginStrategy, testCase);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await stopServer(server);
    }
  });

  /**
   * Checks that the current-session route returns the active session.
   * The response must contain its account, group, and roles.
   */
  test('allows reading the active session', async () => {
    const response = await sendRequest(server, 'GET', '/sessions/current', {
      'mu-session-id': testCase.sessionUri
    });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      links: {
        self: '/sessions/current'
      },
      data: {
        type: 'sessions',
        id: sessionData.sessionId,
        attributes: {
          roles: sessionData.roles
        }
      },
      relationships: {
        account: {
          links: { related: `/accounts/${sessionData.accountId}` },
          data: { type: 'accounts', id: sessionData.accountId }
        },
        group: {
          links: { related: `/organizations/${testCase.seed.groupId}` },
          data: { type: 'organizations', id: testCase.seed.groupId }
        }
      }
    });
  });

  /**
   * Checks that the current-session route removes the active session.
   * A later read must report that the session is missing.
   */
  test('allows deleting the active session', async () => {
    const response = await sendRequest(server, 'DELETE', '/sessions/current', {
      'mu-session-id': testCase.sessionUri
    });

    expect(response.status).toBe(204);
    expect(response.headers['mu-auth-allowed-groups']).toBe('CLEAR');
    await assertSessionIsEmpty(testCase.sessionUri);

    const missingSession = await sendRequest(server, 'GET', '/sessions/current', {
      'mu-session-id': testCase.sessionUri
    });
    expect(missingSession.status).toBe(400);
  });

  /**
   * Checks that both current-session routes require a session header.
   * Requests without it must return a clear client error.
   */
  test.each([
    ['GET', () => sendRequest(server, 'GET', '/sessions/current')],
    ['DELETE', () => sendRequest(server, 'DELETE', '/sessions/current')]
  ])('disallows %s requests without a session header', async (_method, send) => {
    const response = await send();

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([{ title: 'Session header is missing' }]);
  });
});

/** Local HTTP, RDF setup, and cleanup helpers. */
function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server);
    });
  });
}

function stopServer(server) {
  if (!server || !server.listening)
    return Promise.resolve();

  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function sendRequest(server, method, path, headers = {}) {
  const { port } = server.address();

  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        const text = Buffer.concat(chunks).toString();

        try {
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: text ? JSON.parse(text) : undefined
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.once('error', reject);
    request.end();
  });
}

function organisationSeed(name) {
  const id = `acmidm-test-current-session-${name}`;

  return {
    groupId: id,
    groupUri: `http://data.lblod.info/id/organisaties/${id}`,
    identifierId: `${id}-identifier`,
    identifierUri: `http://data.lblod.info/id/identificatoren/${id}`
  };
}

async function seedOrganisation({ organisation, seed }) {
  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH <${graphs.application}> {
        <${seed.groupUri}> a org:Organization ;
          mu:uuid "${seed.groupId}" ;
          adms:identifier <${seed.identifierUri}> .

        <${seed.identifierUri}> a adms:Identifier ;
          mu:uuid "${seed.identifierId}" ;
          skos:notation "${organisation.code}" .
      }
    }
  `);
}

async function assertSessionIsEmpty(sessionUri) {
  const result = await query(`
    SELECT ?predicate ?object
    FROM <${graphs.session}>
    WHERE {
      <${sessionUri}> ?predicate ?object .
    }
  `);

  expect(result.results.bindings).toHaveLength(0);
}

async function clearGraph(graph) {
  await update(`
    DELETE WHERE {
      GRAPH <${graph}> {
        ?subject ?predicate ?object .
      }
    }
  `);
}

async function cleanup() {
  await clearGraph(graphForGroup(graphs.resourceTemplate, testCase.seed.groupId));
  await clearGraph(graphs.session);
  await clearGraph(graphs.logs);
  await clearGraph(graphs.application);
}
