import { query, update, uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';

// TODO make configurable through ENV vars
const serviceHomepage = 'https://github.com/lblod/acmidm-login-service';
const resourceBaseUri = 'http://data.lblod.info/';
const personResourceBaseUri = `${resourceBaseUri}id/persoon/`;
const accountResourceBaseUri = `${resourceBaseUri}id/account/`;
const identifierResourceBaseUri = `${resourceBaseUri}id/identificator/`;

const removeOldSessions = async function(sessionUri) {
  await update(
    `PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
     PREFIX session: <http://mu.semte.ch/vocabularies/session/>
     PREFIX dcterms: <http://purl.org/dc/terms/>

     WITH <${process.env.MU_APPLICATION_GRAPH}>
     DELETE WHERE {
       ${sparqlEscapeUri(sessionUri)} session:account ?account ;
                                      mu:uuid ?id ;
                                      dcterms:modified ?modified ;
                                      session:group ?group .
     }`);
};

const ensureUserAndAccount = async function(claims) {
  const voId = claims.vo_id;

  const queryResult = await query(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?account ?accountId
    FROM <${process.env.MU_APPLICATION_GRAPH}> {
      ?user a foaf:Person ;
            mu:uuid ?personId ;
            foaf:account ?account .
      ?account a foaf:OnlineAccount ;
               mu:uuid ?accountId ;
               dcterms:identifier ${sparqlEscapeString(voId)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { accountUri: result.account.value, accountId: result.accountId.value };
  } else {
    const { accountUri, accountId } = await insertNewUserAndAccount(claims);
    return { accountUri, accountId };
  }
};

const insertNewUserAndAccount = async function(claims) {
  const personId = uuid();
  const person = `${personResourceBaseUri}${personId}`;
  const accountId = uuid();
  const account = `${accountResourceBaseUri}${accountId}`;
  const identifierId = uuid();
  const identifier = `${identifierResourceBaseUri}${identifierId}`;
  const now = new Date();

  // TODO attach claims [doelgroepcode, doelgroepnaam, rollen] to account
  
  await update(`
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>

    INSERT DATA {
      GRAPH <${process.env.MU_APPLICATION_GRAPH}> {
        ${sparqlEscapeUri(person)} a foaf:Person ;
                                 mu:uuid ${sparqlEscapeString(personId)} ;
                                 foaf:firstName ${sparqlEscapeString(claims.given_name)} ;
                                 foaf:familyName ${sparqlEscapeString(claims.family_name)} ;
                                 adms:identifier ${sparqlEscapeUri(identifier)} ;
                                 foaf:account ${sparqlEscapeUri(account)} .
        ${sparqlEscapeUri(identifier)} a adms:Identifier ;
                                       mu:uuid ${sparqlEscapeString(identifierId)} ;
                                       skos:notation ${sparqlEscapeString(claims.rrn)} .
        ${sparqlEscapeUri(account)} a foaf:OnlineAccount ;
                                 mu:uuid ${sparqlEscapeString(accountId)} ;
                                 foaf:accountServiceHomepage ${sparqlEscapeUri(serviceHomepage)} ;
                                 dcterms:identifier ${sparqlEscapeString(claims.vo_id)} ;
                                 dcterms:created ${sparqlEscapeDateTime(now)} .
      }
    }    
  `);

  return { accountUri: account, accountId: accountId };
};

const insertNewSessionForAccount = async function(accountUri, sessionUri, groupUri) {
  const sessionId = uuid();
  const now = new Date();

  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX session: <http://mu.semte.ch/vocabularies/session/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    INSERT DATA {
      GRAPH <${process.env.MU_APPLICATION_GRAPH}> {
        ${sparqlEscapeUri(sessionUri)} mu:uuid ${sparqlEscapeString(sessionId)} ;
                                 session:account ${sparqlEscapeUri(accountUri)} ;
                                 session:group ${sparqlEscapeUri(groupUri)} ;
                                 dcterms:modified ${sparqlEscapeDateTime(now)} .
      }
    }    
  `);

  return { sessionUri, sessionId };
};

const selectBestuurseenheidByOvoNumber = async function(ovoNumber) {
  const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?group ?groupId 
    FROM <${process.env.MU_APPLICATION_GRAPH}>
    WHERE {
      ?group a <http://data.vlaanderen.be/ns/besluit#Bestuurseenheid> ;
             mu:uuid ?groupId ;
             dcterms:identifier ${sparqlEscapeString(ovoNumber)} .
    }`);

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return { groupUri: result.group.value, groupId: result.groupId.value };
  } else {
    return { groupUri: null, groupId: null };
  }
};

export {
  removeOldSessions,
  ensureUserAndAccount,
  insertNewSessionForAccount,
  selectBestuurseenheidByOvoNumber  
}

