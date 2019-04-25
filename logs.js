import { updateSudo as update } from '@lblod/mu-auth-sudo';
import { sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import moment from 'moment';

/**
 * Save the log into the database.
*/
const saveLog = async function(logsGraph, classNameUri, message, sessionUri, kbonummer) {
  const logEntryUuid = uuid();
  const acmIdmLogEntryUuid = uuid();

  const logEntryUri = "http://data.lblod.info/id/log-entries/".concat(logEntryUuid);
  const acmIdmLogEntryUri = "http://data.lblod.info/id/acm-idm-service-log-entries/".concat(acmIdmLogEntryUuid);

  const result = await update(`
    PREFIX rlog: <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/rlog#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
       GRAPH ${sparqlEscapeUri(logsGraph)} {
          ${sparqlEscapeUri(logEntryUri)} a rlog:Entry ;
              <http://mu.semte.ch/vocabularies/core/uuid> "${(logEntryUuid)}" ;
              dct:source <http://data.lblod.info/id/log-sources/c7806563-25a4-46c8-9be2-a0cdf0db1f98> ;
              rlog:className ${sparqlEscapeUri(classNameUri)} ;
              rlog:message ${sparqlEscapeString(message)} ;
              rlog:date "${moment().format()}" ;
              rlog:level <http://data.lblod.info/id/log-levels/3af9ebe1-e6a8-495c-a392-16ced1f38ef1> ;
              rlog:resource ${sparqlEscapeUri(acmIdmLogEntryUri)} .

          ${sparqlEscapeUri(acmIdmLogEntryUri)} a ext:AcmIdmServiceLogEntry ;
              <http://mu.semte.ch/vocabularies/core/uuid> "${(acmIdmLogEntryUuid)}" ;
              ext:sessionUri ${sparqlEscapeUri(sessionUri)} ;
              ext:kbonummer ${sparqlEscapeString(kbonummer)} .
        }
    }
  `);
}

export {
  saveLog
}
