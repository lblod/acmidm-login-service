import { updateSudo as update } from '../lib/sparql';
import { uuid, sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';

import { APPLICATION_GRAPH } from '../config';

const ECONOMIC_ACTOR_AUDIENCE_CODE = 'EA';

/* Whether the claims belong to an economic actor. */
export function isEconomicActor(claims) {
  return claims.vo_doelgroepcode === ECONOMIC_ACTOR_AUDIENCE_CODE;
}

/* Create the organisation and identifier supplied by an economic actor's claims. */
export const createEconomicActorFromClaims = async function(claims) {
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
