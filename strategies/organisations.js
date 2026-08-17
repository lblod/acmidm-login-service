import { saveLog } from '../logs';
import { groupIdClaim, roleClaim, selectGroupByNumber } from "../lib/session";

import { ROLE_CLAIM } from '../config';


export async function organisationLoginStrategy(claims) {
  const { groupUri, groupId } = await _selectOrganisationByNumber(claims);

  const userIsEconomischeActor = claims.vo_doelgroepcode == "EA"
  const groupDoesNotExistForUser = !groupUri || !groupId

  if (groupDoesNotExistForUser && userIsEconomischeActor) {
    await _createEconomischeActorByClaims(claims);
    ({ groupUri, groupId } = await selectGroupByNumber(claims));  
  } 

  if (groupDoesNotExistForUser) {
    console.log(`User is not allowed to login. No organisation found for roles ${JSON.stringify(claims[roleClaim])}`);
    saveLog(
      logsGraph,
      `http://data.lblod.info/class-names/no-organisation-for-role`,
      `User is not allowed to login. No organisation found for roles ${JSON.stringify(claims[roleClaim])}`,
      sessionUri,
      claims[groupIdClaim]);
    return res.header('mu-auth-allowed-groups', 'CLEAR').status(403).end();
  }

  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);

  const roles = (claims[ROLE_CLAIM] || []).map(r => r.split(':')[0]);

  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

  return { sessionId, groupId, roles };
}

const _selectOrganisationByNumber = async function(claims) {
  if (claims[groupIdClaim]) {
    const identifier = claims[groupIdClaim];

    const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>

    SELECT ?group ?groupId
    FROM <${process.env.MU_APPLICATION_GRAPH}>
    WHERE {
      ?group a ${sparqlEscapeUri(ORGANIZATION_TYPE)} ;
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

const _createEconomischeActorByClaims = async function(claims) {
  const now = new Date();

  const orgUuid = uuid();
  const orgUri = `http://data.lblod.info/id/organisaties/${orgUuid}`;

  const identificatorUuid = uuid();
  const identificatorUri =  `http://data.lblod.info/id/identificatoren/${identificatorUuid}`;

  let insertData = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX dc: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/public> {
        ${sparqlEscapeUri(orgUri)} a org:Organization ;
            mu:uuid ${sparqlEscapeString(orgUuid)};
            skos:prefLabel ${sparqlEscapeString(claims.vo_orgnaam)} ;
            org:classification <http://data.lblod.info/id/concept/c6157470-9fb3-4e8d-a9b7-8737dbfa3642> ;
            adms:identifier ${sparqlEscapeUri(identificatorUri)};
            dc:created ${sparqlEscapeDateTime(now)};
            dc:modified ${sparqlEscapeDateTime(now)}.

        ${sparqlEscapeUri(identificatorUri)} a adms:Identifier;
            mu:uuid ${sparqlEscapeString(identificatorUuid)};
            skos:notation ${sparqlEscapeString(claims.vo_orgcode)}.
      }
    }`;

  await update(insertData);
};