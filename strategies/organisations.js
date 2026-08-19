import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { ensureUserAndAccount, insertNewSessionForAccount, selectGroupByNumber } from '../lib/session';
import { saveLog } from '../logs';

import { GROUP_ID_CLAIM, LOGS_GRAPH, ORGANIZATION_TYPE, ROLE_CLAIM } from '../config';

export async function organisationLoginStrategy(claims, sessionUri) {
  let { groupUri, groupId } = await selectGroupByNumber(claims);

  const userIsEconomischeActor = claims.vo_doelgroepcode == "EA"
  const groupDoesNotExistForUser = !groupUri || !groupId

  if (!groupDoesNotExistForUser) {
    if (userIsEconomischeActor)
    await _createEconomischeActorByClaims(claims);
    ({ groupUri, groupId } = await selectGroupByNumber(claims));  
  } else {
    console.log(`User is not allowed to login. No organisation found for roles ${JSON.stringify(claims[ROLE_CLAIM])}`);
    saveLog(
      LOGS_GRAPH,
      `http://data.lblod.info/class-names/no-organisation-for-role`,
      `User is not allowed to login. No organisation found for roles ${JSON.stringify(claims[ROLE_CLAIM])}`,
      sessionUri,
      claims[GROUP_ID_CLAIM]);
    return httpError(403, '', { 'mu-auth-allowed-groups': 'CLEAR' })
  }
  
  const accountIdentifier = claims[ACCOUNT_ID_CLAIM] ?? claims["sub"];
  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId, accountIdentifier);

  const roles = (claims[ROLE_CLAIM] || []).map(r => r.split(':')[0]);

  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

  return { sessionId, groupId, accountId, roles };
}

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
