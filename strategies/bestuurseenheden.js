import { ensureUserAndAccount, insertNewSessionForAccount, selectGroupByNumber } from '../lib/session';
import { saveLog } from '../logs';

import { GROUP_ID_CLAIM, LOGS_GRAPH, ORGANIZATION_TYPE, ROLE_CLAIM } from '../config';
import { httpError } from '../utils';

export async function bestuurseenheidLoginStrategy(claims, sessionUri) {
  const { groupUri, groupId } = await selectGroupByNumber(claims);
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
