import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from './auth-sudo';

const serviceHomepage = 'https://github.com/lblod/acmidm-login-service';
const resourceBaseUri = process.env.MU_APPLICATION_RESOURCE_BASE_URI || 'http://data.lblod.info/';
const personResourceBaseUri = `${resourceBaseUri}id/persoon/`;
const accountResourceBaseUri = `${resourceBaseUri}id/account/`;
const identifierResourceBaseUri = `${resourceBaseUri}id/identificator/`;

const removeOldSessions = async function(sessionUri) {
  await update(
    `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX session: <http://mu.semte.ch/vocabularies/session/>
     PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
     PREFIX dcterms: <http://purl.org/dc/terms/>

     DELETE WHERE {
       GRAPH ?g {
           ${sparqlEscapeUri(sessionUri)} session:account ?account ;
                                          mu:uuid ?id ;
                                          dcterms:modified ?modified ;
                                          ext:sessionGroup ?group .
           ?group mu:uuid ?groupId .
       }

       FILTER(?g = IRI(CONCAT("http://mu.semte.ch/graphs/org/", ?groupId)))
     }`);
};

const removeCurrentSession = async function(sessionUri) {
  await removeOldSessions(sessionUri);
};

const ensureUserAndAccount = async function(claims, graph) {
  const { personUri } = await ensureUser(claims, graph);
  const { accountUri, accountId } = await ensureAccountForUser(personUri, claims, graph);
  return { accountUri, accountId };
};

const ensureUser = async function(claims, graph) {
  const rrn = claims.rrn;

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?person ?personId
    FROM <${graph}> {
      ?person a foaf:Person ;
            mu:uuid ?personId ;
            adms:identifier ?identifier .
      ?identifier skos:notation ${sparqlEscapeString(rrn)} .
    }`);
  
  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { personUri: result.person.value, personId: result.personId.value };
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

  await update(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(person)} a foaf:Person ;
                                 mu:uuid ${sparqlEscapeString(personId)} ;
                                 foaf:firstName ${sparqlEscapeString(claims.given_name)} ;
                                 foaf:familyName ${sparqlEscapeString(claims.family_name)} ;
                                 adms:identifier ${sparqlEscapeUri(identifier)} .
        ${sparqlEscapeUri(identifier)} a adms:Identifier ;
                                       mu:uuid ${sparqlEscapeString(identifierId)} ;
                                       skos:notation ${sparqlEscapeString(claims.rrn)} .
      }
    }    
  `);
  
  return { personUri: person, personId: personId };  
};

const ensureAccountForUser = async function(personUri, claims, graph) {
  const voId = claims.vo_id;

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?account ?accountId
    FROM <${graph}> {
      ${sparqlEscapeUri(personUri)} foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(voId)} .
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

  await update(`
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
                                 dcterms:identifier ${sparqlEscapeString(claims.vo_id)} ;
                                 acmidm:doelgroepCode ${sparqlEscapeString(claims.vo_doelgroepcode)} ;
                                 acmidm:doelgroepNaam ${sparqlEscapeString(claims.vo_doelgroepnaam)} ;
                                 dcterms:created ${sparqlEscapeDateTime(now)} .
      }
    }
  `);

  return { accountUri: account, accountId: accountId };
};

const insertNewSessionForAccount = async function(accountUri, sessionUri, groupUri, roles, graph) {
  const sessionId = uuid();
  const now = new Date();

  let insert = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    INSERT DATA {
      GRAPH <${graph}> {
        ${sparqlEscapeUri(sessionUri)} mu:uuid ${sparqlEscapeString(sessionId)} ;
                                 session:account ${sparqlEscapeUri(accountUri)} ;
                                 ext:sessionGroup ${sparqlEscapeUri(groupUri)} ;`;
  if (roles && roles.length)
                      insert += `ext:sessionRole ${roles.join(',')} ;`;

  insert +=`                     dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }`;

  await update(insert);
  return { sessionUri, sessionId };
};

const selectBestuurseenheidByNumber = async function(claims) {
  // claims.vo_orgcode contains KBO number but is not correct for districten

  const roles = claims.abb_loketLB_rol_3d;
  if (roles && roles[0] && roles[0].includes(':')) {
    const identifier = claims.abb_loketLB_rol_3d[0].split(':')[1];

    const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?group ?groupId 
    FROM <http://mu.semte.ch/graphs/public>
    WHERE {
      ?group a <http://data.vlaanderen.be/ns/besluit#Bestuurseenheid> ;
             mu:uuid ?groupId ;
             dcterms:identifier ${sparqlEscapeString(identifier)} .
    }`);

    if (queryResult.results.bindings.length) {
      const result = queryResult.results.bindings[0];
      return { groupUri: result.group.value, groupId: result.groupId.value };
    }
  }
  
  return { groupUri: null, groupId: null };
};

const selectAccountBySession = async function(session) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?account ?accountId 
    WHERE {
      ${sparqlEscapeUri(session)} session:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    return { accountUri: null, accountId: null };
  }
};

const selectCurrentSession = async function(account) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?session ?sessionId ?group ?groupId
    WHERE {
      ?session session:account ${sparqlEscapeUri(account)} ;
               mu:uuid ?sessionId ;
               ext:sessionGroup ?group .
      ?group mu:uuid ?groupId .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      sessionUri: result.session.value,
      sessionId: result.sessionId.value,
      groupUri: result.group.value,
      groupId: result.groupId.value
    };
  } else {
    return { sessionUri: null, sessionId: null, groupUri: null, groupId: null };
  }
};

export {
  removeOldSessions,
  removeCurrentSession,
  ensureUserAndAccount,
  insertNewSessionForAccount,
  selectBestuurseenheidByNumber,
  selectAccountBySession,
  selectCurrentSession
}

