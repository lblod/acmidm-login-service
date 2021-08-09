import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';

const serviceHomepage = 'https://github.com/lblod/acmidm-login-service';
const resourceBaseUri = process.env.MU_APPLICATION_RESOURCE_BASE_URI || 'http://data.lblod.info/';
const personResourceBaseUri = `${resourceBaseUri}id/persoon/`;
const accountResourceBaseUri = `${resourceBaseUri}id/account/`;
const identifierResourceBaseUri = `${resourceBaseUri}id/identificator/`;
const accountGraph = "http://mu.semte.ch/graphs/users";
const userIdClaim = process.env.MU_APPLICATION_AUTH_USERID_CLAIM || 'sub';
const accountIdClaim = process.env.MU_APPLICATION_AUTH_ACCOUNTID_CLAIM || 'vo_id';
const groupIdClaim = process.env.MU_APPLICATION_AUTH_GROUPID_CLAIM || 'vo_orgcode';
const roleClaim = process.env.MU_APPLICATION_AUTH_ROLE_CLAIM || 'abb_organisatieportaal_rol_3d';

const removeOldSessions = async function (sessionUri) {
  await update(
    `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX session: <http://mu.semte.ch/vocabularies/session/>
     PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
     PREFIX dcterms: <http://purl.org/dc/terms/>

     DELETE WHERE {
       GRAPH <http://mu.semte.ch/graphs/sessions> {
           ${sparqlEscapeUri(sessionUri)} session:account ?account ;
                                          mu:uuid ?id ;
                                          dcterms:modified ?modified ;
                                          ext:sessionRole ?role ;
                                          ext:sessionGroup ?group .
       }
     }`);
};

const removeCurrentSession = async function (sessionUri) {
  await removeOldSessions(sessionUri);
};

const ensureUserAndAccount = async function (claims) {
  const { personUri } = await ensureUser(claims);
  console.log(personUri)
  const { accountUri, accountId } = await ensureAccountForUser(personUri, claims);
  return { accountUri, accountId };
};

const ensureUser = async function (claims) {
  // TODO: use claims[userIdClaim]; instead when claim arrives
  // const userId = uuid(); // claims[userIdClaim];
  const userId = claims[userIdClaim];
  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    SELECT ?person ?personId
    FROM <${accountGraph}> {
      ?person a foaf:Person ;
            mu:uuid ?personId ;
            adms:identifier ?identifier .
      ?identifier skos:notation ${sparqlEscapeString(userId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { personUri: result.person.value, personId: result.personId.value };
  } else {
    const { personUri, personId } = await insertNewUser(claims);
    return { personUri, personId };
  }
};

const insertNewUser = async function (claims, graph) {
  const personId = uuid();
  const person = `${personResourceBaseUri}${personId}`;
  const identifierId = uuid();
  const identifier = `${identifierResourceBaseUri}${identifierId}`;
  const now = new Date();
  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(person)} a foaf:Person ;
                                 mu:uuid ${sparqlEscapeString(personId)} ;
                                 adms:identifier ${sparqlEscapeUri(identifier)} .
        ${sparqlEscapeUri(identifier)} a adms:Identifier ;
                                       mu:uuid ${sparqlEscapeString(identifierId)} ;
                                       skos:notation ${sparqlEscapeString(claims[userIdClaim])} .
    `;

  if (claims.given_name)
    insertData += `${sparqlEscapeUri(person)} foaf:firstName ${sparqlEscapeString(claims.given_name)} . \n`;

  if (claims.family_name)
    insertData += `${sparqlEscapeUri(person)} foaf:familyName ${sparqlEscapeString(claims.family_name)} . \n`;

  insertData += `
      }
    }
  `;

  await update(insertData);

  return { personUri: person, personId: personId };
};

const ensureAccountForUser = async function (personUri, claims) {
  const accountId = claims[accountIdClaim];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    SELECT ?account ?accountId
    FROM <${accountGraph}> {
      ${sparqlEscapeUri(personUri)} foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(accountId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    const { accountUri, accountId } = await insertNewAccountForUser(personUri, claims);
    return { accountUri, accountId };
  }
};


const insertNewAccountForUser = async function (person, claims) {
  const accountId = uuid();
  const account = `${accountResourceBaseUri}${accountId}`;
  const now = new Date();

  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX acmidm: <http://mu.semte.ch/vocabularies/ext/acmidm/>
    INSERT DATA {
      GRAPH <${accountGraph}> {
        ${sparqlEscapeUri(person)} foaf:account ${sparqlEscapeUri(account)} .
        ${sparqlEscapeUri(account)} a foaf:OnlineAccount ;
                                 mu:uuid ${sparqlEscapeString(accountId)} ;
                                 foaf:accountServiceHomepage ${sparqlEscapeUri(serviceHomepage)} ;
                                 dcterms:identifier ${sparqlEscapeString(claims[accountIdClaim])} ;
                                 dcterms:created ${sparqlEscapeDateTime(now)} .
    `;

  if (claims.vo_doelgroepcode)
    insertData += `${sparqlEscapeUri(account)} acmidm:doelgroepCode ${sparqlEscapeString(claims.vo_doelgroepcode)} . \n`;

  if (claims.vo_doelgroepnaam)
    insertData += `${sparqlEscapeUri(account)} acmidm:doelgroepNaam ${sparqlEscapeString(claims.vo_doelgroepnaam)} . \n`;

  insertData += `
      }
    }
  `;

  await update(insertData);

  return { accountUri: account, accountId: accountId };
};
const insertNewSessionForAccount = async function (accountUri, sessionUri) {
  const sessionId = uuid();
  const now = new Date();

  let insertData = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
        ${sparqlEscapeUri(sessionUri)} mu:uuid ${sparqlEscapeString(sessionId)} ;
           session:account ${sparqlEscapeUri(accountUri)} ;
           dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }`;

  await update(insertData);
  return { sessionUri, sessionId };
};

const selectAccountBySession = async function (session) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    SELECT ?account ?accountId
    WHERE {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
          ${sparqlEscapeUri(session)} session:account ?account.
      }
      GRAPH <${accountGraph}> {
          ?account a foaf:OnlineAccount ;
                   mu:uuid ?accountId .
      }
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    return { accountUri: null, accountId: null };
  }
};

const selectCurrentSession = async function (account) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    SELECT ?session ?sessionId
    WHERE {
      GRAPH <http://mu.semte.ch/graphs/sessions> {
          ?session session:account ${sparqlEscapeUri(account)} ;
                   mu:uuid ?sessionId .
      }
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      sessionUri: result.session.value,
      sessionId: result.sessionId.value
    };
  } else {
    return { sessionUri: null, sessionId: null };
  }
};

export {
  removeOldSessions,
  removeCurrentSession,
  ensureUserAndAccount,
  insertNewSessionForAccount,
  selectAccountBySession,
  selectCurrentSession,
  userIdClaim,
  accountIdClaim,
  groupIdClaim,
  roleClaim
}
