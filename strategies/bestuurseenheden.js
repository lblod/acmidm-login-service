import { saveLog } from '../logs';

export async function bestuurseenheidLoginStrategy(claims) {
  const { groupUri, groupId } = await selectBestuurseenheidByNumber(claims);
  const groupDoesNotExistForUser = !groupUri || !groupId

  if (groupDoesNotExistForUser) {
    console.log(`User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`);
    saveLog(
      logsGraph,
      `http://data.lblod.info/class-names/no-bestuurseenheid-for-role`,
      `User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(claims[roleClaim])}`,
      sessionUri,
      claims[groupIdClaim]);
    return res.header('mu-auth-allowed-groups', 'CLEAR').status(403).end();
  }

  const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);

  const roles = (claims[roleClaim] || []).map(r => r.split(':')[0]);

  const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, roles);

  return { sessionId, groupId, roles,accountId };
}

const selectBestuurseenheidByNumber = async function(claims) {
  if (claims[groupIdClaim]) {
    const identifier = claims[groupIdClaim];

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