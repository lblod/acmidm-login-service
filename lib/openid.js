import { Issuer } from 'openid-client';

// TODO get config from env variables
const discoveryUrl = 'https://authenticatie-ti.vlaanderen.be/op';
const clientId = 'a2c0d6ea-01b4-4f68-920b-10834a943c27';
const clientSecret = 'UQun5q0sxvd9z1MW4r504KEtuplN3EM7XPXIPiLgHOqZrSDZt2yj-q8YQSSOPLJKHqCfSXDd92m25KZuXDE5wFqQ1c_BgwWg';
const redirectUri = 'https://loket.lblod.info/authorization/callback';
const scope = 'openid rrn vo profile abb_loketLB';

const getAccessToken = async function(authorizationCode) {
  const issuer = await Issuer.discover(discoveryUrl);
  const client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret
  });

  try {
    const tokenSet = await client.authorizationCallback(redirectUri, { code: authorizationCode });
    return tokenSet;
  } catch(e) {
    console.log(`Error while retrieving access token from OpenId Provider: ${e}`);
    throw new Error(`Something went wrong while retrieving the access token: ${e}`);
  }
};

export {
  getAccessToken
}
