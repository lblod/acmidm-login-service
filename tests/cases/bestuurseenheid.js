/**
 * Overview
 *
 * Tests bestuurseenheid logins for valid groups and rejected group types.
 * Only a seeded bestuurseenheid may use this login strategy.
 *
 * Setup: test-only RDF graphs, a bestuurseenheid, and an organisation.
 * Cleanup: groups, accounts, sessions, and logs created by this suite.
 */

/** Dependencies and test data. */
const { updateSudo: update } = require('@lblod/mu-auth-sudo');
const { TEST_GRAPH_ROOT, organisations } = require('../config');
const {
  applyTestEnvironment,
  assertLoginRdf,
  assertRejectedLogin,
  graphForGroup,
  loginAs,
  withoutConsoleLog
} = require('../shared');

/** Test graph and login settings. */
const graphs = {
  application: `${TEST_GRAPH_ROOT}bestuurseenheid/application`,
  logs: `${TEST_GRAPH_ROOT}bestuurseenheid/logs`,
  resourceTemplate: `${TEST_GRAPH_ROOT}bestuurseenheid/{{groupId}}`,
  session: `${TEST_GRAPH_ROOT}bestuurseenheid/sessions`
};

const testConfig = {
  cases: {
    affligem: {
      organisation: organisations.affligem,
      seed: bestuurseenheidSeed('affligem'),
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-bestuurseenheid-affligem'
    },
    missingBestuurseenheid: {
      organisation: organisations.missingBestuurseenheid,
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-bestuurseenheid-missing'
    },
    missingOrganisation: {
      organisation: organisations.missingEconomicActor,
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-bestuurseenheid-missing-organisation'
    },
    sanoRice: {
      organisation: organisations.sanoRice,
      seed: organisationSeed('sanorice'),
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-bestuurseenheid-sanorice'
    }
  },
  environment: {
    ACCOUNT_GRAPH_TEMPLATE: graphs.resourceTemplate,
    LOGS_GRAPH: graphs.logs,
    LOG_SPARQL_ALL: 'false',
    MU_APPLICATION_AUTH_ROLE_CLAIM: 'abb_subsidiepunt_rol_2d',
    MU_APPLICATION_GRAPH: graphs.application,
    ORGANIZATION_TYPE: 'http://data.vlaanderen.be/ns/besluit#Bestuurseenheid',
    SESSION_GRAPH: graphs.session,
    USER_GRAPH_TEMPLATE: graphs.resourceTemplate
  },
  graphs
};

applyTestEnvironment(testConfig.environment);

const { bestuurseenheidLoginStrategy } = require('../../strategies/bestuurseenheden');
const { cases } = testConfig;

/** Tracks whether setup completed, so cleanup stays safe after a failed setup. */
const testState = {
  ready: false
};

/** Bestuurseenheid login tests. */
describe('Bestuurseenheid', () => {
  beforeAll(async () => {
    testState.ready = true;
    await cleanup();
    await seedBestuurseenheid(cases.affligem);
    await seedOrganisation(cases.sanoRice);
  });

  afterAll(async () => {
    if (testState.ready)
      await cleanup();
  });

  /**
   * Checks that a seeded bestuurseenheid can log in.
   * It must return a session and write the expected account and session data.
  */
  test(
    `allows the registered bestuurseenheid ${cases.affligem.organisation.name} to log in`,
    async () => {
      const testCase = cases.affligem;
      const sessionData = await loginAs(bestuurseenheidLoginStrategy, testCase);

      expect(sessionData).toEqual({
        accountId: expect.any(String),
        groupId: testCase.seed.groupId,
        roles: ['SubsidiepuntGebruiker'],
        sessionId: expect.any(String)
      });

      await assertLoginRdf({
        accountDoelgroepCode: testCase.organisation.claims.vo_doelgroepcode,
        accountDoelgroepNaam: testCase.organisation.claims.vo_doelgroepnaam,
        accountGraph: graphForGroup(graphs.resourceTemplate, testCase.seed.groupId),
        accountIdentifier: testCase.organisation.claims.vo_id,
        groupUri: testCase.seed.groupUri,
        roles: sessionData.roles,
        sessionData,
        sessionGraph: graphs.session,
        sessionUri: testCase.sessionUri,
        userIdentifier: testCase.organisation.claims.rrn
      });
    }
  );

  /**
   * Checks that an unknown bestuurseenheid cannot log in.
   * The failed login must not create an account or session.
   */
  test('disallows an unregistered bestuurseenheid from logging in', async () => {
    const testCase = cases.missingBestuurseenheid;
    const result = await withoutConsoleLog(() =>
      loginAs(bestuurseenheidLoginStrategy, testCase)
    );

    await assertRejectedLogin({
      code: testCase.organisation.code,
      logsGraph: graphs.logs,
      result,
      sessionGraph: graphs.session,
      sessionUri: testCase.sessionUri
    });
  });

  /**
   * Checks that an unknown organisation cannot use the bestuurseenheid strategy.
   * The failed login must not create a session.
   */
  test('disallows an unregistered organisation from logging in as a bestuurseenheid', async () => {
    const testCase = cases.missingOrganisation;
    const result = await withoutConsoleLog(() =>
      loginAs(bestuurseenheidLoginStrategy, testCase)
    );

    await assertRejectedLogin({
      code: testCase.organisation.code,
      logsGraph: graphs.logs,
      result,
      sessionGraph: graphs.session,
      sessionUri: testCase.sessionUri
    });
  });

  /**
   * Checks that a known organisation cannot use the bestuurseenheid strategy.
   * The failed login must leave its account graph empty.
  */
  test(
    `disallows the registered organisation ${cases.sanoRice.organisation.name} from logging in as a bestuurseenheid`,
    async () => {
      const testCase = cases.sanoRice;
      const result = await withoutConsoleLog(() =>
        loginAs(bestuurseenheidLoginStrategy, testCase)
      );

      await assertRejectedLogin({
        accountGraph: graphForGroup(graphs.resourceTemplate, testCase.seed.groupId),
        code: testCase.organisation.code,
        logsGraph: graphs.logs,
        result,
        sessionGraph: graphs.session,
        sessionUri: testCase.sessionUri
      });
    }
  );
});

/** Test data and RDF helpers. */
function bestuurseenheidSeed(name) {
  const id = `acmidm-test-bestuurseenheid-${name}`;

  return {
    groupId: id,
    groupUri: `http://data.lblod.info/id/bestuurseenheden/${id}`
  };
}

function organisationSeed(name) {
  const id = `acmidm-test-bestuurseenheid-${name}`;

  return {
    groupId: id,
    groupUri: `http://data.lblod.info/id/organisaties/${id}`,
    identifierId: `${id}-identifier`,
    identifierUri: `http://data.lblod.info/id/identificatoren/${id}`
  };
}

async function seedBestuurseenheid(testCase) {
  const { organisation, seed } = testCase;

  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    INSERT DATA {
      GRAPH <${graphs.application}> {
        <${seed.groupUri}> a besluit:Bestuurseenheid ;
          mu:uuid "${seed.groupId}" ;
          dcterms:identifier "${organisation.code}" .
      }
    }
  `);
}

async function seedOrganisation(testCase) {
  const { organisation, seed } = testCase;

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
  for (const testCase of [cases.affligem, cases.sanoRice])
    await clearGraph(graphForGroup(graphs.resourceTemplate, testCase.seed.groupId));

  await clearGraph(graphs.session);
  await clearGraph(graphs.logs);
  await clearGraph(graphs.application);
}
