import { ensureUserAndAccount, insertNewSessionForAccount, selectGroupByNumber } from '../lib/session';
import { saveLog } from '../logs';
import { GROUP_ID_CLAIM, LOGS_GRAPH, ROLE_CLAIM } from '../config';
import { httpError } from '../utils';

/*
 * Create a bestuurseenheid session:
 * - find the group
 * - ensure the user and account
 * - store the session
 */
export async function bestuurseenheidLoginStrategy(claims, sessionUri) {
  const { groupUri, groupId } = await selectGroupByNumber(claims);
  const hasNoMatchingGroup = !groupUri || !groupId;

  if (hasNoMatchingGroup) {
    const rolesFromClaims = claims[ROLE_CLAIM];
    const logMessage = `User is not allowed to login. No bestuurseenheid found for roles ${JSON.stringify(rolesFromClaims)}`;

    console.log(logMessage);
    saveLog(
      LOGS_GRAPH,
      `http://data.lblod.info/class-names/no-bestuurseenheid-for-role`,
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
