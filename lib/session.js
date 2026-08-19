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


function accountGraphFor(params) {
  return ACCOUNT_GRAPH_TEMPLATE.replace('{{groupId}}', params.groupId);
}

function userGraphFor(params) {
  return USER_GRAPH_TEMPLATE.replace('{{groupId}}', params.groupId);
}
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

const ensureUserAndAccount = async function(claims, groupId) {
  const userGraph = userGraphFor({groupId});
  const accountGraph = accountGraphFor({groupId});
  const { personUri } = await ensureUser(claims, userGraph);
  const { accountUri, accountId } = await ensureAccountForUser(personUri, claims, accountGraph);
  return { accountUri, accountId };
};

const ensureUser = async function(claims, graph) {
  const userId = claims[USER_ID_CLAIM];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?person ?personId ?email
    FROM <${graph}> {
      ?person a foaf:Person ;
            mu:uuid ?personId ;
            adms:identifier ?identifier .
      ?identifier skos:notation ${sparqlEscapeString(userId)} .
      ${ENABLE_EMAIL_CLAIM ? 'OPTIONAL { ?person foaf:email ?email . }' : ''}
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    const personUri = result.person.value;
    const personId = result.personId.value;

    if (ENABLE_EMAIL_CLAIM && claims.vo_email && !result.email) {
      await insertEmailForExistingUser(personUri, claims, graph);
    }

    return { personUri, personId };
  } else {
    const { personUri, personId } = await insertNewUser(claims, graph);
    return { personUri, personId };
  }
};

const insertNewUser = async function(claims, graph) {
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
                                       skos:notation ${sparqlEscapeString(claims[USER_ID_CLAIM])} .
    `;

  if (claims.given_name)
    insertData += `${sparqlEscapeUri(person)} foaf:firstName ${sparqlEscapeString(claims.given_name)} . \n`;

  if (claims.family_name)
    insertData += `${sparqlEscapeUri(person)} foaf:familyName ${sparqlEscapeString(claims.family_name)} . \n`;

  if (ENABLE_EMAIL_CLAIM &&claims.vo_email)
    insertData += `${sparqlEscapeUri(person)} foaf:email ${sparqlEscapeString(claims.vo_email)} . \n`;

  insertData += `
      }
    }
  `;

  await update(insertData);

  return { personUri: person, personId: personId };
};

const ensureAccountForUser = async function(personUri, claims, graph) {
  const accountId = claims[ACCOUNT_ID_CLAIM] ?? claims["sub"];

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?account ?accountId
    FROM <${graph}> {
      ${sparqlEscapeUri(personUri)} foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(accountId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    const { accountUri, accountId } = await insertNewAccountForUser(personUri, claims, graph);
    return { accountUri, accountId };
  }
};


const insertNewAccountForUser = async function(person, claims, graph) {
  const accountId = uuid();
  const account = `${accountResourceBaseUri}${accountId}`;
  const now = new Date();

  const identifierClaim = claims[ACCOUNT_ID_CLAIM] ?? claims["sub"] ;

  let insertData = `
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX acmidm: <http://mu.semte.ch/vocabularies/ext/acmidm/>

    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(person)} foaf:account ${sparqlEscapeUri(account)} .
        ${sparqlEscapeUri(account)} a foaf:OnlineAccount ;
                                 mu:uuid ${sparqlEscapeString(accountId)} ;
                                 foaf:accountServiceHomepage ${sparqlEscapeUri(serviceHomepage)} ;
                                 dcterms:identifier ${sparqlEscapeString(claims[ACCOUNT_ID_CLAIM])} ;
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

const insertNewSessionForAccount = async function(accountUri, sessionUri, groupUri, roles) {
  const sessionId = uuid();
  const now = new Date();

  let insertData = `
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
    insertData += `
                                 ext:sessionRole ${roles.map(r => sparqlEscapeString(r)).join(', ')} ;
              `;

  insertData +=`                     dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }`;

  await update(insertData);
  return { sessionUri, sessionId };
};

const selectGroupByNumber = async function(claims) {
  if (claims[GROUP_ID_CLAIM]) {
    const identifier = claims[GROUP_ID_CLAIM];

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
        ?group dcterms:identifier ${sparqlEscapeString(identifier)} .
      }
      UNION
      {
        ?group adms:identifier/skos:notation ${sparqlEscapeString(identifier)} .
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

async function getGroupIdForSession(session) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?groupId WHERE {
       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
          ${sparqlEscapeUri(session)} ext:sessionGroup ?group .
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
  else
    return null;
}

async function selectAccountBySession(session) {
  const groupId = await getGroupIdForSession(session);
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>

    SELECT ?account ?accountId
    WHERE {
       GRAPH ${sparqlEscapeUri(SESSION_GRAPH)} {
          ${sparqlEscapeUri(session)} session:account ?account.
      }
      GRAPH ${sparqlEscapeUri(accountGraphFor({ groupId }))} {
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

const selectCurrentSession = async function(sessionUri, account) {
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
          ${sparqlEscapeUri(sessionUri)} session:account ${sparqlEscapeUri(account)} ;
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
  } else {
    return { sessionId: null, groupUri: null, groupId: null, roles: null };
  }
};

const insertEmailForExistingUser = async function(personUri, claims, graph) {
  const email = claims.vo_email;

  await update(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(personUri)} foaf:email ${sparqlEscapeString(email)} .
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
}
