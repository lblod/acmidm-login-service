import { querySudo as query} from '@lblod/mu-auth-sudo';
import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { ensureUserAndAccount, insertNewSessionForAccount } from '../lib/session';
import { saveLog } from '../logs';

import { GROUP_ID_CLAIM, LOGS_GRAPH, ORGANIZATION_TYPE, ROLE_CLAIM } from '../config';
import { httpError } from '../utils';

export async function bestuurseenheidLoginStrategy(claims, sessionUri) {
  const { groupUri, groupId } = await selectBestuurseenheidByNumber(claims);
  const groupDoesNotExistForUser = !groupUri || !groupId

  if (groupDoesNotExistForUser) {
    console.log(`User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[ROLE_CLAIM])}`);
    saveLog(
      LOGS_GRAPH,
      `http://data.lblod.info/class-names/no-bestuurseenheid-for-role`,
      `User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[ROLE_CLAIM])}`,
      sessionUri,
      claims[GROUP_ID_CLAIM]);
    return httpError(403, '', { 'mu-auth-allowed-groups': 'CLEAR' })
  }

  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);

  const roles = (claims[ROLE_CLAIM] || []).map(r => r.split(':')[0]);

  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

  return { sessionId, groupId, accountId, roles };
}

const selectBestuurseenheidByNumber = async function(claims) {
  if (claims[GROUP_ID_CLAIM]) {
    const identifier = claims[GROUP_ID_CLAIM];

    const queryResult = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dcterms: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX org: <http://www.w3.org/ns/org#>
             
    SELECT DISTINCT ?group ?groupId
    FROM <${process.env.MU_APPLICATION_GRAPH}>
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
