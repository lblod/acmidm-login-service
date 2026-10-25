/**
 * Overview
 *
 * Tests a stack configured with two login strategies: bestuurseenheden first,
 * then organisations that may create economic actors. The first strategy that
 * finds a group creates the session, and the current-session route reports the
 * group type of that strategy.
 *
 * Setup: a group that is both a bestuurseenheid and an organisation, and an
 * organisation that is only an organisation.
 * Cleanup: graphs created by this suite and its local HTTP server.
 */

/** Dependencies and test data. */
const http = require('node:http');
const { querySudo: query, updateSudo: update } = require('../../lib/sparql');
const { TEST_GRAPH_ROOT, organisations } = require('../config');
const { applyTestEnvironment, graphForGroup, withoutConsoleLog } = require('../shared');

const BESTUURSEENHEID = 'http://data.vlaanderen.be/ns/besluit#Bestuurseenheid';
const ORGANIZATION = 'http://www.w3.org/ns/org#Organization';

jest.mock('../../config/strategies', () => ({
  __esModule: true,
  default: [
    { type: 'http://data.vlaanderen.be/ns/besluit#Bestuurseenheid', label: 'bestuurseenheden' },
    { type: 'http://www.w3.org/ns/org#Organization', label: 'organizations', createEconomicActors: true }
  ]
}));

/** Test graph and login settings. */
const graphs = {
  application: `${TEST_GRAPH_ROOT}multiple-strategies/application`,
  logs: `${TEST_GRAPH_ROOT}multiple-strategies/logs`,
  resourceTemplate: `${TEST_GRAPH_ROOT}multiple-strategies/{{groupId}}`,
  session: `${TEST_GRAPH_ROOT}multiple-strategies/sessions`
};

const cases = {
  affligem: {
    organisation: organisations.affligem,
    seed: organisationSeed('affligem'),
    types: [BESTUURSEENHEID, ORGANIZATION],
    sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-multiple-strategies-affligem'
  },
  sanoRice: {
    organisation: organisations.sanoRice,
    seed: organisationSeed('sanorice'),
    types: [ORGANIZATION],
    sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-multiple-strategies-sanorice'
  },
  missingEconomicActor: {
    organisation: organisations.missingEconomicActor,
    sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-multiple-strategies-missing-economic-actor'
  },
  missingNonEconomicActor: {
    organisation: organisations.missingNonEconomicActor,
    sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-multiple-strategies-missing-non-economic-actor'
  }
};

applyTestEnvironment({
  ACCOUNT_GRAPH_TEMPLATE: graphs.resourceTemplate,
  LOGS_GRAPH: graphs.logs,
  LOG_SPARQL_ALL: 'false',
  MU_APPLICATION_AUTH_CLIENT_ID: 'test-client',
  MU_APPLICATION_AUTH_DISCOVERY_URL: 'https://openid.example.test/.well-known/openid-configuration',
  MU_APPLICATION_AUTH_REDIRECT_URI: 'https://app.example.test/authorization/callback',
  MU_APPLICATION_AUTH_ROLE_CLAIM: 'abb_subsidiepunt_rol_2d',
  MU_APPLICATION_GRAPH: graphs.application,
  SESSION_GRAPH: graphs.session,
  USER_GRAPH_TEMPLATE: graphs.resourceTemplate
});

require('../../app');
const { app } = require('mu');
const strategies = require('../../config/strategies').default;
const { loginWithStrategies } = require('../../strategies');

/** Group ids whose user and account graphs must be cleaned up. */
const createdGroupIds = new Set();

/** Multiple strategy tests. */
describe('Multiple strategies', () => {
  beforeAll(async () => {
    await startServer(app);
  });

  beforeEach(async () => {
    await cleanup();
    await seedOrganisation(cases.affligem);
    await seedOrganisation(cases.sanoRice);
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await stopServer();
    }
  });

  /**
   * Checks that the first matching strategy wins when a group has the types of
   * several strategies.
   */
  test('logs a group with both types in with the first strategy', async () => {
    const sessionData = await login(cases.affligem);

    expect(sessionData.groupId).toBe(cases.affligem.seed.groupId);
    expect(sessionData.groupLabel).toBe('bestuurseenheden');
    await assertCurrentSessionGroup(cases.affligem.sessionUri, 'bestuurseenheden', cases.affligem.seed.groupId);
  });

  /**
   * Checks that a later strategy is used when an earlier one finds no group.
   */
  test('logs an organisation in with the organisation strategy', async () => {
    const sessionData = await login(cases.sanoRice);

    expect(sessionData.groupId).toBe(cases.sanoRice.seed.groupId);
    expect(sessionData.groupLabel).toBe('organizations');
    await assertCurrentSessionGroup(cases.sanoRice.sessionUri, 'organizations', cases.sanoRice.seed.groupId);
  });

  /**
   * Checks that a strategy that creates economic actors still does so when an
   * earlier strategy found no group.
   */
  test('creates an unregistered economic actor with the organisation strategy', async () => {
    const sessionData = await login(cases.missingEconomicActor);

    expect(sessionData.groupLabel).toBe('organizations');
    await assertCurrentSessionGroup(cases.missingEconomicActor.sessionUri, 'organizations', sessionData.groupId);
  });

  /**
   * Checks that a user without a group in any strategy is refused, and that the
   * refusal is logged with the organisation log class.
   */
  test('disallows a user without a group in any strategy', async () => {
    const result = await withoutConsoleLog(() => login(cases.missingNonEconomicActor));

    expect(result).toBeInstanceOf(Error);
    expect(result.status).toBe(403);

    const logResult = await query(`
      PREFIX rlog: <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/rlog#>

      SELECT ?className
      FROM <${graphs.logs}>
      WHERE {
        ?entry rlog:className ?className .
      }
    `);
    expect(logResult.results.bindings.map((binding) => binding.className.value)).toEqual([
      'http://data.lblod.info/class-names/no-organisation-for-role'
    ]);
  });
});

/** Shared test steps and SPARQL setup. */
async function login({ organisation, sessionUri }) {
  const sessionData = await loginWithStrategies(strategies, organisation.claims, sessionUri);
  createdGroupIds.add(sessionData.groupId);
  return sessionData;
}

async function assertCurrentSessionGroup(sessionUri, groupLabel, groupId) {
  const response = await sendRequest('GET', '/sessions/current', { 'mu-session-id': sessionUri });

  expect(response.status).toBe(200);
  expect(response.body.relationships.group).toEqual({
    links: { related: `/${groupLabel}/${groupId}` },
    data: { type: groupLabel, id: groupId }
  });
}

let server;

function startServer(expressApp) {
  return new Promise((resolve) => {
    server = expressApp.listen(0, resolve);
  });
}

function stopServer() {
  return new Promise((resolve) => server ? server.close(resolve) : resolve());
}

function sendRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method,
      path,
      headers
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: response.statusCode, headers: response.headers, body: text ? JSON.parse(text) : undefined });
      });
    });

    request.once('error', reject);
    request.end();
  });
}

function organisationSeed(name) {
  const id = `acmidm-test-multiple-strategies-${name}`;

  return {
    groupId: id,
    groupUri: `http://data.lblod.info/id/organisaties/${id}`,
    identifierId: `${id}-identifier`,
    identifierUri: `http://data.lblod.info/id/identificatoren/${id}`
  };
}

async function seedOrganisation({ organisation, seed, types }) {
  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      GRAPH <${graphs.application}> {
        <${seed.groupUri}> a ${types.map((type) => `<${type}>`).join(', ')} ;
          mu:uuid "${seed.groupId}" ;
          adms:identifier <${seed.identifierUri}> .

        <${seed.identifierUri}> a adms:Identifier ;
          mu:uuid "${seed.identifierId}" ;
          skos:notation "${organisation.code}" .
      }
    }
  `);
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
  for (const groupId of createdGroupIds)
    await clearGraph(graphForGroup(graphs.resourceTemplate, groupId));
  createdGroupIds.clear();
  await clearGraph(graphs.session);
  await clearGraph(graphs.logs);
  await clearGraph(graphs.application);
}
