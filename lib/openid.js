import { Issuer, custom } from 'openid-client';
import fs from 'node:fs/promises';
import { httpError } from '../utils';
import {
  CLIENT_ID,
  CLIENT_SECRET,
  DISCOVERY_URL,
  JWK_PRIVATE_KEY,
  REDIRECT_URI,
  REQUEST_TIMEOUT
} from '../config';

custom.setHttpOptionsDefaults({ timeout: REQUEST_TIMEOUT });

/* Build an OpenID client from either a client secret or a private JWK. */
async function getOpenIdClient(issuer) {
  if (CLIENT_SECRET) {
    return new issuer.Client({
      client_id: CLIENT_ID,
      token_endpoint_auth_method: 'client_secret_basic',
      client_secret: CLIENT_SECRET
    });
  } else {
    try {
      const privateKeyString = await fs.readFile(JWK_PRIVATE_KEY, 'utf8');
      const privateKey = JSON.parse(privateKeyString);
      return new issuer.Client({
        client_id: CLIENT_ID,
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
      }, { keys: [privateKey] });
    } catch (e) {
      console.log(`Failed to read private key from ${JWK_PRIVATE_KEY}: ${e}`);
    }
  }

  throw new Error('Unable to create OpenID Client. Make sure either client secret or JWK private key are configured. Check the docs for more info.');
}

/*
 * Exchange an authorization code for an access token with ACM/IDM.
 *
 * Input:
 * - authorizationCode: code received from the client
 *
 * Returns:
 * - Token set with the access token and claims
 * - https://www.npmjs.com/package/openid-client#tokenset
 *
 * Errors:
 * - Failed token exchange
 */
const getAccessToken = async function(authorizationCode) {
  const issuer = await Issuer.discover(DISCOVERY_URL);
  const client = await getOpenIdClient(issuer);

  return client.callback(REDIRECT_URI, { code: authorizationCode })
    .catch(e => {
      console.log(`Error while retrieving access token from OpenId Provider: ${e}`);
      throw httpError(401, `Failed to retrieve access token from OpenId Provider`);
    });
};

export {
  getAccessToken
}
