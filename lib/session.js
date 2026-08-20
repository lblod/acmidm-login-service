import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import {
  USER_GRAPH_TEMPLATE,
  ACCOUNT_GRAPH_TEMPLATE,
  SESSION_GRAPH,
  ORGANIZATION_TYPE,
  USER_ID_CLAIM,
  ENABLE_EMAIL_CLAIM,
  RESOURCE_BASE_URI,
  ACCOUNT_ID_CLAIM,
  GROUP_ID_CLAIM,
  APPLICATION_GRAPH
} from '../config';

const serviceHomepage = 'https://github.com/lblod/acmidm-login-service';
const personResourceBaseUri = `${RESOURCE_BASE_URI}id/persoon/`;
const accountResourceBaseUri = `${RESOURCE_BASE_URI}id/account/`;
const identifierResourceBaseUri = `${RESOURCE_BASE_URI}id/identificator/`;

function accountGraphForGroup(groupId) {
  return ACCOUNT_GRAPH_TEMPLATE.replace('{{groupId}}', groupId);
}

function userGraphForGroup(groupId) {
  return USER_GRAPH_TEMPLATE.replace('{{groupId}}', groupId);
}

/* Delete all session triples for a session URI. */
const deleteSessionById = async function(sessionUri) {
  await update(
    `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX session: <http://mu.semte.ch/vocabularies/session/>
     PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
     PREFIX dcterms: <http://purl.org/dc/terms/>

     DELETE WHERE {
       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
           ${sparqlEscapeUri(sessionUri)} ?p ?o .
       }
     }`);
};

/* Ensure the claimed user and account exist in their group-specific graphs. */
const ensureUserAndAccount = async function(claims, groupId) {
  const userGraphUri = userGraphForGroup(groupId);
  const accountGraphUri = accountGraphForGroup(groupId);
  const { personUri } = await ensureUser(claims, userGraphUri);
  const { accountUri, accountId } = await ensureAccountForUser(personUri, claims, accountGraphUri);
  return { accountUri, accountId };
};

/*
 * Ensure a user:
 * - find by configured identifier
 * - add email when enabled
 * - create when absent
 */
const ensureUser = async function(claims, userGraphUri) {
  const userIdentifier = claims[USER_ID_CLAIM];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?person ?personId ?email
    FROM <${userGraphUri}> {
      ?person a foaf:Person ;
            mu:uuid ?personId ;
            adms:identifier ?identifier .
      ?identifier skos:notation ${sparqlEscapeString(userIdentifier)} .
      ${ENABLE_EMAIL_CLAIM ? 'OPTIONAL { ?person foaf:email ?email . }' : ''}
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    const personUri = result.person.value;
    const personId = result.personId.value;

    if (ENABLE_EMAIL_CLAIM && claims.vo_email && !result.email) {
      await insertEmailForExistingUser(personUri, claims, userGraphUri);
    }

    return { personUri, personId };
  }

  return insertNewUser(claims, userGraphUri);
};

/* Store a person, identifier, and available profile fields. */
const insertNewUser = async function(claims, userGraphUri) {
  const personId = uuid();
  const personUri = `${personResourceBaseUri}${personId}`;
  const identifierId = uuid();
  const identifierUri = `${identifierResourceBaseUri}${identifierId}`;

  let insertQuery = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      GRAPH <${userGraphUri}> {
        ${sparqlEscapeUri(personUri)} a foaf:Person ;
                                 mu:uuid ${sparqlEscapeString(personId)} ;
                                 adms:identifier ${sparqlEscapeUri(identifierUri)} .
        ${sparqlEscapeUri(identifierUri)} a adms:Identifier ;
                                       mu:uuid ${sparqlEscapeString(identifierId)} ;
                                       skos:notation ${sparqlEscapeString(claims[USER_ID_CLAIM])} .
    `;

  if (claims.given_name)
    insertQuery += `${sparqlEscapeUri(personUri)} foaf:firstName ${sparqlEscapeString(claims.given_name)} . \n`;

  if (claims.family_name)
    insertQuery += `${sparqlEscapeUri(personUri)} foaf:familyName ${sparqlEscapeString(claims.family_name)} . \n`;

  if (ENABLE_EMAIL_CLAIM && claims.vo_email)
    insertQuery += `${sparqlEscapeUri(personUri)} foaf:email ${sparqlEscapeString(claims.vo_email)} . \n`;

  insertQuery += `
      }
    }
  `;

  await update(insertQuery);

  return { personUri, personId };
};

/* Find an account for the user, or create one when absent. */
const ensureAccountForUser = async function(personUri, claims, accountGraphUri) {
  const accountIdentifier = claims[ACCOUNT_ID_CLAIM] ?? claims.sub;

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?account ?accountId
    FROM <${accountGraphUri}> {
      ${sparqlEscapeUri(personUri)} foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(accountIdentifier)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  }

  return insertNewAccountForUser(personUri, claims, accountGraphUri);
};

/* Store an online account and its available audience fields. */
const insertNewAccountForUser = async function(personUri, claims, accountGraphUri) {
  const accountId = uuid();
  const accountUri = `${accountResourceBaseUri}${accountId}`;
  const createdAt = new Date();
  const accountIdentifier = claims[ACCOUNT_ID_CLAIM] ?? claims.sub;

  let insertQuery = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX acmidm: <http://mu.semte.ch/vocabularies/ext/acmidm/>

    INSERT DATA {
      GRAPH <${accountGraphUri}> {
        ${sparqlEscapeUri(personUri)} foaf:account ${sparqlEscapeUri(accountUri)} .
        ${sparqlEscapeUri(accountUri)} a foaf:OnlineAccount ;
                                 mu:uuid ${sparqlEscapeString(accountId)} ;
                                 foaf:accountServiceHomepage ${sparqlEscapeUri(serviceHomepage)} ;
                                 dcterms:identifier ${sparqlEscapeString(accountIdentifier)} ;
                                 dcterms:created ${sparqlEscapeDateTime(createdAt)} .
    `;

  if (claims.vo_doelgroepcode)
    insertQuery += `${sparqlEscapeUri(accountUri)} acmidm:doelgroepCode ${sparqlEscapeString(claims.vo_doelgroepcode)} . \n`;

  if (claims.vo_doelgroepnaam)
    insertQuery += `${sparqlEscapeUri(accountUri)} acmidm:doelgroepNaam ${sparqlEscapeString(claims.vo_doelgroepnaam)} . \n`;

  insertQuery += `
      }
    }
  `;

  await update(insertQuery);

  return { accountUri, accountId };
};

/* Store a session that connects an account, group, and normalized roles. */
const insertNewSessionForAccount = async function(accountUri, sessionUri, groupUri, roles) {
  const sessionId = uuid();
  const modifiedAt = new Date();

  let insertQuery = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
        ${sparqlEscapeUri(sessionUri)} mu:uuid ${sparqlEscapeString(sessionId)} ;
                                 session:account ${sparqlEscapeUri(accountUri)} ;
                                 ext:sessionGroup ${sparqlEscapeUri(groupUri)} ;`;
  if (roles && roles.length)
    insertQuery += `
                                 ext:sessionRole ${roles.map(role => sparqlEscapeString(role)).join(', ')} ;
              `;

  insertQuery += `                     dcterms:modified ${sparqlEscapeDateTime(modifiedAt)} .
      }
    }`;

  await update(insertQuery);
  return { sessionUri, sessionId };
};

/*
 * Find a group by its claim identifier:
 * - direct Dublin Core identifier
 * - nested ADMS identifier
 */
const selectGroupByNumber = async function(claims) {
  if (claims[GROUP_ID_CLAIM]) {
    const groupIdentifier = claims[GROUP_ID_CLAIM];

    const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX org: <http://www.w3.org/ns/org#>

    SELECT DISTINCT ?group ?groupId
    FROM <${APPLICATION_GRAPH}>
    WHERE {
      ?group a ${sparqlEscapeUri(ORGANIZATION_TYPE)};
            mu:uuid ?groupId .

      {
        ?group dcterms:identifier ${sparqlEscapeString(groupIdentifier)} .
      }
      UNION
      {
        ?group adms:identifier/skos:notation ${sparqlEscapeString(groupIdentifier)} .
      }
    }
  `);

    if (queryResult.results.bindings.length) {
      const result = queryResult.results.bindings[0];
      return { groupUri: result.group.value, groupId: result.groupId.value };
    }
  }

  return { groupUri: null, groupId: null };
};

/* Read the group UUID stored on a session. */
async function getGroupIdForSession(sessionUri) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?groupId WHERE {
       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
          ${sparqlEscapeUri(sessionUri)} ext:sessionGroup ?group .
      }
      GRAPH <${APPLICATION_GRAPH}> {
      ?group a ${sparqlEscapeUri(ORGANIZATION_TYPE)} ;
             mu:uuid ?groupId .
      }
      }
  `);
  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return result.groupId.value;
  }

  return null;
}

/* Find the session's account in the group-specific account graph. */
async function selectAccountBySession(sessionUri) {
  const groupId = await getGroupIdForSession(sessionUri);
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT ?account ?accountId
    WHERE {
       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
          ${sparqlEscapeUri(sessionUri)} session:account ?account.
      }
      GRAPH ${sparqlEscapeUri(accountGraphForGroup(groupId))} {
          ?account a foaf:OnlineAccount ;
                   mu:uuid ?accountId .
      }
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  }

  return { accountUri: null, accountId: null };
};

/* Read the session details for the given session URI and account. */
const selectCurrentSession = async function(sessionUri, accountUri) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?sessionId ?group ?groupId (GROUP_CONCAT(?role; SEPARATOR = ',') as ?roles)
    WHERE {

       GRAPH <${APPLICATION_GRAPH}> {
         ?group mu:uuid ?groupId .
       }

       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
          ${sparqlEscapeUri(sessionUri)} session:account ${sparqlEscapeUri(accountUri)} ;
                                         mu:uuid ?sessionId ;
                                         ext:sessionGroup ?group ;
                                         ext:sessionRole ?role .
      }
    } GROUP BY ?sessionId ?group ?groupId`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      sessionId: result.sessionId.value,
      groupUri: result.group.value,
      groupId: result.groupId.value,
      roles: result.roles.value.split(',')
    };
  }

  return { sessionId: null, groupUri: null, groupId: null, roles: null };
};

/* Add an email address to a user created before email claims were enabled. */
const insertEmailForExistingUser = async function(personUri, claims, userGraphUri) {
  const emailAddress = claims.vo_email;

  await update(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    INSERT DATA {
      GRAPH <${userGraphUri}> {
        ${sparqlEscapeUri(personUri)} foaf:email ${sparqlEscapeString(emailAddress)} .
      }
    }
  `);
};

export {
  deleteSessionById,
  ensureUserAndAccount,
  selectGroupByNumber,
  insertNewSessionForAccount,
  selectAccountBySession,
  selectCurrentSession,
};
