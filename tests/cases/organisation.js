/**
 * Overview
 *
 * Tests organisation logins for known, new, and rejected organisations.
 * The suite also checks that repeat logins reuse the existing organisation.
 *
 * Setup: test-only RDF graphs and seeded organisations.
 * Cleanup: groups, accounts, sessions, and logs created by this suite.
 */

/** Dependencies and test data. */
const { querySudo: query, updateSudo: update } = require('@lblod/mu-auth-sudo');
const { TEST_GRAPH_ROOT, organisations } = require('../config');
const {
  applyTestEnvironment,
  assertLoginRdf,
  assertRejectedLogin,
  graphForGroup,
  loginAs,
  withoutConsoleLog
} = require('../shared');

const ORGANISATION_CLASSIFICATION =
  'http://data.lblod.info/id/concept/c6157470-9fb3-4e8d-a9b7-8737dbfa3642';

/** Test graph and login settings. */
const graphs = {
  application: `${TEST_GRAPH_ROOT}organisation/application`,
  logs: `${TEST_GRAPH_ROOT}organisation/logs`,
  resourceTemplate: `${TEST_GRAPH_ROOT}organisation/{{groupId}}`,
  session: `${TEST_GRAPH_ROOT}organisation/sessions`
};

const testConfig = {
  cases: {
    affligem: {
      organisation: organisations.affligem,
      seed: organisationSeed('affligem'),
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-affligem'
    },
    apotheekDeLinde: {
      organisation: organisations.apotheekDeLinde,
      repeatSessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-apotheek-de-linde-repeat',
      seed: organisationSeed('apotheek-de-linde'),
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-apotheek-de-linde'
    },
    missingEconomicActor: {
      organisation: organisations.missingEconomicActor,
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-missing-economic-actor'
    },
    missingEconomicActorWithoutAccountId: {
      organisation: organisations.missingEconomicActorWithoutAccountId,
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-missing-economic-actor-without-account-id'
    },
    missingNonEconomicActor: {
      organisation: organisations.missingNonEconomicActor,
      sessionUri: 'http://mu.semte.ch/sessions/acmidm-test-organisation-missing-non-economic-actor'
    }
  },
  classification: ORGANISATION_CLASSIFICATION,
  environment: {
    ACCOUNT_GRAPH_TEMPLATE: graphs.resourceTemplate,
    LOGS_GRAPH: graphs.logs,
    LOG_SPARQL_ALL: 'false',
    MU_APPLICATION_AUTH_ROLE_CLAIM: 'abb_subsidiepunt_rol_2d',
    MU_APPLICATION_GRAPH: graphs.application,
    ORGANIZATION_TYPE: 'http://www.w3.org/ns/org#Organization',
    SESSION_GRAPH: graphs.session,
    USER_GRAPH_TEMPLATE: graphs.resourceTemplate
  },
  graphs
};

applyTestEnvironment(testConfig.environment);

const { organisationLoginStrategy } = require('../../strategies/organisations');
const { cases } = testConfig;

/** Tracks whether setup completed, so cleanup stays safe after a failed setup. */
const testState = {
  ready: false
};

/** Organisation login tests. */
describe('Organisation', () => {
  beforeAll(async () => {
    testState.ready = true;
    await cleanup();
    await seedOrganisation(cases.affligem);
    await seedOrganisation(cases.apotheekDeLinde);
  });

  afterAll(async () => {
    if (testState.ready)
      await cleanup();
  });

  /**
   * Checks that a seeded local authority can log in as an organisation.
   * It must return a session and write the expected account and session data.
  */
  test(
    `allows the registered local authority ${cases.affligem.organisation.name} to log in`,
    async () => {
      const testCase = cases.affligem;
      const sessionData = await loginAs(organisationLoginStrategy, testCase);

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
   * Checks that a repeat login for a seeded economic actor reuses its account.
   * It must not create a second organisation.
  */
  test(
    `allows the registered economic actor ${cases.apotheekDeLinde.organisation.name} to log in without creating a duplicate`,
    async () => {
      const testCase = cases.apotheekDeLinde;
      expect(await findOrganisationsByCode(testCase.organisation.code)).toHaveLength(1);

      const sessionData = await loginAs(organisationLoginStrategy, testCase);
      const repeatedSessionData = await organisationLoginStrategy(
        testCase.organisation.claims,
        testCase.repeatSessionUri
      );

      expect(sessionData).toEqual({
        accountId: expect.any(String),
        groupId: testCase.seed.groupId,
        roles: ['SubsidiepuntGebruiker'],
        sessionId: expect.any(String)
      });
      expect(repeatedSessionData.accountId).toBe(sessionData.accountId);
      expect(await findOrganisationsByCode(testCase.organisation.code)).toHaveLength(1);

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
      await assertLoginRdf({
        accountDoelgroepCode: testCase.organisation.claims.vo_doelgroepcode,
        accountDoelgroepNaam: testCase.organisation.claims.vo_doelgroepnaam,
        accountGraph: graphForGroup(graphs.resourceTemplate, testCase.seed.groupId),
        accountIdentifier: testCase.organisation.claims.vo_id,
        groupUri: testCase.seed.groupUri,
        roles: repeatedSessionData.roles,
        sessionData: repeatedSessionData,
        sessionGraph: graphs.session,
        sessionUri: testCase.repeatSessionUri,
        userIdentifier: testCase.organisation.claims.rrn
      });
    }
  );

  /**
   * Checks that an unknown economic actor gets an organisation, account, and session.
   * The new organisation must have the correct name and classification.
   */
  test('allows an unregistered economic actor to log in and creates its organisation', async () => {
    const testCase = cases.missingEconomicActor;
    expect(await findOrganisationsByCode(testCase.organisation.code)).toHaveLength(0);

    const sessionData = await loginAs(organisationLoginStrategy, testCase);

    const createdOrganisations = await findOrganisationsByCode(testCase.organisation.code);
    expect(createdOrganisations).toHaveLength(1);
    const createdOrganisation = createdOrganisations[0];
    expect(sessionData).toEqual({
      accountId: expect.any(String),
      groupId: createdOrganisation.groupId,
      roles: ['SubsidiepuntGebruiker'],
      sessionId: expect.any(String)
    });

    const metadataResult = await query(`
      PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
      PREFIX org: <http://www.w3.org/ns/org#>

      SELECT ?label ?classification
      FROM <${graphs.application}>
      WHERE {
        <${createdOrganisation.groupUri}> a org:Organization ;
          skos:prefLabel ?label ;
          org:classification ?classification .
      }
    `);
    expect(metadataResult.results.bindings).toHaveLength(1);
    expect(metadataResult.results.bindings[0].label.value).toBe(testCase.organisation.name);
    expect(metadataResult.results.bindings[0].classification.value).toBe(
      testConfig.classification
    );

    await assertLoginRdf({
      accountDoelgroepCode: testCase.organisation.claims.vo_doelgroepcode,
      accountDoelgroepNaam: testCase.organisation.claims.vo_doelgroepnaam,
      accountGraph: graphForGroup(graphs.resourceTemplate, sessionData.groupId),
      accountIdentifier: testCase.organisation.claims.vo_id,
      groupUri: createdOrganisation.groupUri,
      roles: sessionData.roles,
      sessionData,
      sessionGraph: graphs.session,
      sessionUri: testCase.sessionUri,
      userIdentifier: testCase.organisation.claims.rrn
    });
  });

  /**
   * Checks the account identifier used when a new economic actor has no vo_id.
   * The service must use the subject claim instead.
   */
  test('allows an unregistered economic actor without vo_id to log in with sub as its account identifier', async () => {
    const testCase = cases.missingEconomicActorWithoutAccountId;
    expect(await findOrganisationsByCode(testCase.organisation.code)).toHaveLength(0);

    const sessionData = await loginAs(organisationLoginStrategy, testCase);
    const [createdOrganisation] = await findOrganisationsByCode(testCase.organisation.code);

    expect(createdOrganisation).toBeDefined();
    await assertLoginRdf({
      accountDoelgroepCode: testCase.organisation.claims.vo_doelgroepcode,
      accountDoelgroepNaam: testCase.organisation.claims.vo_doelgroepnaam,
      accountGraph: graphForGroup(graphs.resourceTemplate, sessionData.groupId),
      accountIdentifier: testCase.organisation.claims.sub,
      groupUri: createdOrganisation.groupUri,
      roles: sessionData.roles,
      sessionData,
      sessionGraph: graphs.session,
      sessionUri: testCase.sessionUri,
      userIdentifier: testCase.organisation.claims.rrn
    });
  });

  /**
   * Checks that an unknown non-economic actor cannot log in.
   * No organisation, account, or session may be created.
   */
  test('disallows an unregistered non-economic actor from logging in', async () => {
    const testCase = cases.missingNonEconomicActor;
    const result = await withoutConsoleLog(() =>
      loginAs(organisationLoginStrategy, testCase)
    );

    await assertRejectedLogin({
      code: testCase.organisation.code,
      logsGraph: graphs.logs,
      result,
      sessionGraph: graphs.session,
      sessionUri: testCase.sessionUri
    });
    expect(await findOrganisationsByCode(testCase.organisation.code)).toHaveLength(0);
  });
});

/** Test data and RDF helpers. */
function organisationSeed(name) {
  const id = `acmidm-test-organisation-${name}`;

  return {
    groupId: id,
    groupUri: `http://data.lblod.info/id/organisaties/${id}`,
    identifierId: `${id}-identifier`,
    identifierUri: `http://data.lblod.info/id/identificatoren/${id}`
  };
}

async function findOrganisationsByCode(code) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?group ?groupId ?identifier
    FROM <${graphs.application}>
    WHERE {
      ?group a org:Organization ;
        mu:uuid ?groupId .
      {
        ?group dcterms:identifier "${code}" .
      }
      UNION
      {
        ?group adms:identifier ?identifier .
        ?identifier skos:notation "${code}" .
      }
    }
  `);

  return result.results.bindings.map((binding) => ({
    groupId: binding.groupId.value,
    groupUri: binding.group.value,
    identifierUri: binding.identifier?.value
  }));
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
  const createdOrganisations = (
    await Promise.all([
      findOrganisationsByCode(cases.missingEconomicActor.organisation.code),
      findOrganisationsByCode(cases.missingEconomicActorWithoutAccountId.organisation.code)
    ])
  ).flat();

  for (const organisation of createdOrganisations)
    await clearGraph(graphForGroup(graphs.resourceTemplate, organisation.groupId));

  for (const testCase of [cases.affligem, cases.apotheekDeLinde])
    await clearGraph(graphForGroup(graphs.resourceTemplate, testCase.seed.groupId));

  await clearGraph(graphs.session);
  await clearGraph(graphs.logs);
  await clearGraph(graphs.application);
}
