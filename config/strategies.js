import { GROUP_TYPE_LABEL, ORGANIZATION_TYPE } from './index';

/*
 * Login strategies, tried in order. The first strategy that finds (or creates)
 * a group for the user's claims creates the session. Override this file by
 * mounting your own /config/strategies.js.
 *
 * Each strategy has:
 * - type: RDF class of the group
 * - label: JSON:API type of the group in session responses
 * - createGroup (optional): async function (claims) called when no group
 *   matches. It may create the group; the service then looks the group up
 *   again with the strategy's type and the group-ID claim.
 *
 * The default is the single strategy configured through ORGANIZATION_TYPE and
 * GROUP_TYPE_LABEL.
 */
export default [
  {
    type: ORGANIZATION_TYPE,
    label: GROUP_TYPE_LABEL
  }
];
