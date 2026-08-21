const { querySudo: query } = require('@lblod/mu-auth-sudo');
const { TEST_GRAPH_ROOT } = require('./config');

const PUBLIC_GRAPH = 'http://mu.semte.ch/graphs/public';
const graphSettings = {
  MU_APPLICATION_GRAPH: 'APPLICATION_GRAPH',
  ACCOUNT_GRAPH_TEMPLATE: 'ACCOUNT_GRAPH_TEMPLATE',
  USER_GRAPH_TEMPLATE: 'USER_GRAPH_TEMPLATE',
  SESSION_GRAPH: 'SESSION_GRAPH',
  LOGS_GRAPH: 'LOGS_GRAPH'
};

function applyTestEnvironment(environment) {
  for (const name of Object.keys(graphSettings))
    assertTestGraph(name, environment[name]);

  Object.assign(process.env, environment);

  const serviceConfig = require('../config');
  for (const [environmentName, configName] of Object.entries(graphSettings)) {
    if (serviceConfig[configName] !== environment[environmentName]) {
      throw new Error(
        `Expected ${configName} to use ${environment[environmentName]}, but it uses ${serviceConfig[configName]}. ` +
          'Load the strategy only after applying the test environment.'
      );
    }
  }
}

function assertTestGraph(name, graph) {
  if (typeof graph !== 'string' || !graph.startsWith(TEST_GRAPH_ROOT) || graph === PUBLIC_GRAPH) {
    throw new Error(
      `${name} must use a test graph below ${TEST_GRAPH_ROOT}; refusing to use ${graph}.`
    );
  }
}

function graphForGroup(template, groupId) {
  return template.replace('{{groupId}}', groupId);
}

function loginAs(loginStrategy, testCase) {
  return loginStrategy(testCase.organisation.claims, testCase.sessionUri);
}

async function withoutConsoleLog(callback) {
  const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

  try {
    return await callback();
  } catch (error) {
    return error;
  } finally {
    consoleLog.mockRestore();
  }
}

async function assertLoginRdf({
  accountDoelgroepCode,
  accountDoelgroepNaam,
  accountGraph,
  accountIdentifier,
  groupUri,
  roles,
  sessionData,
  sessionGraph,
  sessionUri,
  userIdentifier
}) {
  const accountResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    SELECT ?person ?account ?accountId ?userIdentifier ?accountIdentifier ?homepage ?created ?doelgroepCode ?doelgroepNaam
    FROM <${accountGraph}>
    WHERE {
      ?person a foaf:Person ;
        adms:identifier/skos:notation ?userIdentifier ;
        foaf:account ?account .
      ?account a foaf:OnlineAccount ;
        mu:uuid ?accountId ;
        foaf:accountServiceHomepage ?homepage ;
        dcterms:identifier ?accountIdentifier ;
        dcterms:created ?created ;
        <http://mu.semte.ch/vocabularies/ext/acmidm/doelgroepCode> ?doelgroepCode ;
        <http://mu.semte.ch/vocabularies/ext/acmidm/doelgroepNaam> ?doelgroepNaam .
    }
  `);

  expect(accountResult.results.bindings).toHaveLength(1);
  const account = accountResult.results.bindings[0];
  expect(account.accountId.value).toBe(sessionData.accountId);
  expect(account.userIdentifier.value).toBe(userIdentifier);
  expect(account.accountIdentifier.value).toBe(accountIdentifier);
  expect(account.homepage.value).toBe('https://github.com/lblod/acmidm-login-service');
  expect(account.created.datatype).toBe('http://www.w3.org/2001/XMLSchema#dateTime');
  expect(Number.isNaN(Date.parse(account.created.value))).toBe(false);
  expect(account.doelgroepCode.value).toBe(accountDoelgroepCode);
  expect(account.doelgroepNaam.value).toBe(accountDoelgroepNaam);

  const sessionResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?sessionId ?account ?group ?role
    FROM <${sessionGraph}>
    WHERE {
      <${sessionUri}> mu:uuid ?sessionId ;
        session:account ?account ;
        ext:sessionGroup ?group ;
        ext:sessionRole ?role .
    }
    ORDER BY ?role
  `);

  expect(sessionResult.results.bindings).toHaveLength(roles.length);
  expect(sessionResult.results.bindings[0].sessionId.value).toBe(sessionData.sessionId);
  expect(sessionResult.results.bindings[0].account.value).toBe(account.account.value);
  expect(sessionResult.results.bindings[0].group.value).toBe(groupUri);
  expect(sessionResult.results.bindings.map((binding) => binding.role.value)).toEqual([...roles].sort());
}

async function assertRejectedLogin({
  accountGraph,
  code,
  logsGraph,
  result,
  sessionGraph,
  sessionUri
}) {
  expect(result).toBeInstanceOf(Error);
  expect(result.status).toBe(403);
  expect(result.headers).toEqual({ 'mu-auth-allowed-groups': 'CLEAR' });

  const logResult = await waitForQuery(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    SELECT ?entry
    FROM <${logsGraph}>
    WHERE {
      ?entry ext:specificInformation ?information .
      FILTER(CONTAINS(STR(?information), "${code}"))
    }
  `);
  expect(logResult.results.bindings).toHaveLength(1);

  const sessionResult = await query(`
    SELECT ?predicate ?object
    FROM <${sessionGraph}>
    WHERE {
      <${sessionUri}> ?predicate ?object .
    }
  `);
  expect(sessionResult.results.bindings).toHaveLength(0);

  if (accountGraph) {
    const accountResult = await query(`
      SELECT ?subject ?predicate ?object
      FROM <${accountGraph}>
      WHERE {
        ?subject ?predicate ?object .
      }
      LIMIT 1
    `);
    expect(accountResult.results.bindings).toHaveLength(0);
  }
}

async function waitForQuery(sparql, timeout = 2000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await query(sparql);
    if (result.results.bindings.length)
      return result;

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for SPARQL data after ${timeout}ms`);
}

module.exports = {
  applyTestEnvironment,
  assertLoginRdf,
  assertRejectedLogin,
  graphForGroup,
  loginAs,
  withoutConsoleLog
};
