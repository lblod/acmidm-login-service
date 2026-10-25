import { ensureUserAndAccount, insertNewSessionForAccount, selectGroupByNumber } from '../lib/session';
import { saveLog } from '../logs';
import { GROUP_ID_CLAIM, LOGS_GRAPH, ROLE_CLAIM } from '../config';
import { httpError } from '../utils';

/*
 * Create a session with the first strategy that finds a group:
 * - find the group, or let the strategy's createGroup hook create it
 * - ensure the user and account
 * - store the session
 */
export async function loginWithStrategies(strategies, claims, sessionUri) {
  for (const strategy of strategies) {
    let { groupUri, groupId } = await selectGroupByNumber(claims, strategy.type);
    const hasNoMatchingGroup = !groupUri || !groupId;

    if (hasNoMatchingGroup && strategy.createGroup) {
      await strategy.createGroup(claims);
      ({ groupUri, groupId } = await selectGroupByNumber(claims, strategy.type));
    }

    if (groupUri && groupId) {
      const { accountUri, accountId } = await ensureUserAndAccount(claims, groupId);
      const normalizedRoles = (claims[ROLE_CLAIM] || []).map(role => role.split(':')[0]);

      const { sessionId } = await insertNewSessionForAccount(accountUri, sessionUri, groupUri, normalizedRoles);

      return { sessionId, groupId, accountId, roles: normalizedRoles, groupLabel: strategy.label };
    }
  }

  // Keep the log class and wording of the original single-strategy services.
  const onlyBestuurseenheden = strategies.every(strategy => strategy.label === 'bestuurseenheden');
  const groupName = onlyBestuurseenheden ? 'bestuurseenheid' : 'organisation';
  const rolesFromClaims = claims[ROLE_CLAIM];
  const logMessage = `User is not allowed to login. No ${groupName} found for roles ${JSON.stringify(rolesFromClaims)}`;

  console.log(logMessage);
  await saveLog(
    LOGS_GRAPH,
    `http://data.lblod.info/class-names/no-${groupName}-for-role`,
    logMessage,
    sessionUri,
    claims[GROUP_ID_CLAIM]);
  throw httpError(403, '', { 'mu-auth-allowed-groups': 'CLEAR' });
}
