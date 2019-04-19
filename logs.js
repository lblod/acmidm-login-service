import { querySudo as query } from '@lblod/mu-auth-sudo';
import { sparqlEscapeString, sparqlEscapeUri } from 'mu';
import moment from 'moment';

/**
 * Save the log into the database.
*/
const saveLog = async function(logsGraph, classNameUri, message, sessionUri, kbonummer) {
  const uuidv4 = require('uuid/v4');
  const logEntryUuid = uuidv4();
  const acmIdmLogEntryUuid = uuidv4();

  const result = await query(`
    PREFIX rlog: <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/rlog#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT {
       GRAPH ${sparqlEscapeUri(logsGraph)} {
          ?logEntry a rlog:Entry ;
              <http://mu.semte.ch/vocabularies/core/uuid> "${(logEntryUuid)}" ;
              dct:source <http://mu.semte.ch/services/acmidm-login-service> ;
              rlog:className ${sparqlEscapeUri(classNameUri)} ;
              rlog:message ${sparqlEscapeString(message)} ;
              rlog:date "${moment().format()}" ;
              rlog:level ?logLevel ;
              rlog:resource ?acmIdmLogEntry .

          ?acmIdmLogEntry a ext:AcmIdmServiceLogEntry ;
              <http://mu.semte.ch/vocabularies/core/uuid> "${(acmIdmLogEntryUuid)}" ;
              ext:sessionUri ${sparqlEscapeUri(sessionUri)} ;
              ext:kbonummer ${sparqlEscapeString(kbonummer)} .
        }
    }
    WHERE {
      GRAPH ${sparqlEscapeUri(logsGraph)} {
        ?logLevel a rlog:Level ;
            <http://mu.semte.ch/vocabularies/core/uuid> "3af9ebe1-e6a8-495c-a392-16ced1f38ef1" .

        BIND(IRI(CONCAT("http://data.lblod.info/id/log-entries/", "${(logEntryUuid)}")) AS ?logEntry)
        BIND(IRI(CONCAT("http://data.lblod.info/id/acm-idm-service-log-entries/", "${(acmIdmLogEntryUuid)}")) AS ?acmIdmLogEntry)
      }
    }
  `);
}

export {
  saveLog
}
