import httpContext from 'express-http-context';
import SC2 from 'sparql-client-2';
const { SparqlClient } = SC2;

function sudoSparqlClient() {
  let options = {
    requestDefaults: {
      headers: {
        'mu-session-id': httpContext.get('request').get('mu-session-id'),
        'mu-call-id': httpContext.get('request').get('mu-call-id'),
        'mu-auth-sudo': 'true'
      }
    }
  };

  console.log(`Headers set on SPARQL client: ${JSON.stringify(options)}`);

  return new SparqlClient(process.env.MU_SPARQL_ENDPOINT, options).register({
    mu: 'http://mu.semte.ch/vocabularies/',
    muCore: 'http://mu.semte.ch/vocabularies/core/',
    muExt: 'http://mu.semte.ch/vocabularies/ext/'
  });
}

function querySudo(queryString) {
  console.log(queryString);
  return sudoSparqlClient().query(queryString).executeRaw().then(response => {
    function maybeParseJSON(body) {
      // Catch invalid JSON
      try {
        return JSON.parse(body);
      } catch (ex) {
        return null;
      }
    }

    return maybeParseJSON(response.body);
  });
}

const updateSudo = querySudo;

const exports = {
  querySudo,
  updateSudo
};

export default exports;

export {
  querySudo,
  updateSudo
}
