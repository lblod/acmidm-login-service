import { GROUP_TYPE_LABEL, ORGANIZATION_TYPE } from './index';

/*
 * Login strategies, tried in order. The first strategy that finds (or creates)
 * a group for the user's claims creates the session. Override this file by
 * mounting your own /config/strategies.js.
 *
 * Each strategy has:
 * - type: RDF class of the group
 * - label: JSON:API type of the group in session responses
 * - createEconomicActors: create the organisation of an unknown economic actor
 *   (vo_doelgroepcode EA) instead of refusing the login
 *
 * The default is the single strategy configured through ORGANIZATION_TYPE and
 * GROUP_TYPE_LABEL.
 */
export default [
  {
    type: ORGANIZATION_TYPE,
    label: GROUP_TYPE_LABEL,
    createEconomicActors: GROUP_TYPE_LABEL === 'organizations'
  }
];
