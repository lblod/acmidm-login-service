import { updateSudo as update } from '@lblod/mu-auth-sudo';
import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { ensureUserAndAccount, insertNewSessionForAccount, selectGroupByNumber } from '../lib/session';
import { saveLog } from '../logs';
import { httpError } from '../utils';

import { APPLICATION_GRAPH, GROUP_ID_CLAIM, LOGS_GRAPH, ROLE_CLAIM } from '../config';

const ECONOMIC_ACTOR_AUDIENCE_CODE = 'EA';

/*
 * Create an organisation session:
 * - find or create an economic actor group
 * - ensure the user and account
 * - store the session
 */
export async function organisationLoginStrategy(claims, sessionUri) {
  let { groupUri, groupId } = await selectGroupByNumber(claims);
  const isEconomicActor = claims.vo_doelgroepcode === ECONOMIC_ACTOR_AUDIENCE_CODE;
  const hasNoMatchingGroup = !groupUri || !groupId;

  if (hasNoMatchingGroup && isEconomicActor) {
    await createEconomicActorFromClaims(claims);
    ({ groupUri, groupId } = await selectGroupByNumber(claims));
  }

  if (!groupUri || !groupId) {
    const rolesFromClaims = claims[ROLE_CLAIM];
    const logMessage = `User is not allowed to login. No organisation found for roles ${JSON.stringify(rolesFromClaims)}`;

    console.log(logMessage);
    saveLog(
      LOGS_GRAPH,
      `http://data.lblod.info/class-names/no-organisation-for-role`,
      logMessage,
      sessionUri,
      claims[GROUP_ID_CLAIM]);
    throw httpError(403, '', { 'mu-auth-allowed-groups': 'CLEAR' });
  }

  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);
  const normalizedRoles = (claims[ROLE_CLAIM] || []).map(role => role.split(':')[0]);

  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, normalizedRoles);

  return { sessionId, groupId, accountId, roles: normalizedRoles };
}

/* Create the organisation and identifier supplied by an economic actor's claims. */
const createEconomicActorFromClaims = async function(claims) {
  const createdAt = new Date();

  const organisationUuid = uuid();
  const organisationUri = `http://data.lblod.info/id/organisaties/${organisationUuid}`;

  const identifierUuid = uuid();
  const identifierUri = `http://data.lblod.info/id/identificatoren/${identifierUuid}`;

  const insertQuery = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX dc: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX org: <http://www.w3.org/ns/org#>

    INSERT DATA {
      GRAPH ${sparqlEscapeUri(APPLICATION_GRAPH)} {
        ${sparqlEscapeUri(organisationUri)} a org:Organization ;
            mu:uuid ${sparqlEscapeString(organisationUuid)};
            skos:prefLabel ${sparqlEscapeString(claims.vo_orgnaam)} ;
            org:classification <http://data.lblod.info/id/concept/c6157470-9fb3-4e8d-a9b7-8737dbfa3642> ;
            adms:identifier ${sparqlEscapeUri(identifierUri)};
            dc:created ${sparqlEscapeDateTime(createdAt)};
            dc:modified ${sparqlEscapeDateTime(createdAt)}.

        ${sparqlEscapeUri(identifierUri)} a adms:Identifier;
            mu:uuid ${sparqlEscapeString(identifierUuid)};
            skos:notation ${sparqlEscapeString(claims.vo_orgcode)}.
      }
    }`;

  await update(insertQuery);
};
