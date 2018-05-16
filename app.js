import { app, sparql } from 'mu';

/**
 * Log the user in by creating a new session, i.e. attaching the user's account to a session.
 *
 * Before creating a new session, the given authorization code gets exchanged for an access token
 * with an OpenID Provider (ACM/IDM) using the configured discovery URL. The returned JWT access token
 * is decoded to retrieve information to attach to the user and the session.
 * If the OpenID Provider returns a valid access token, a new session is created and returned.
 * 
 * Body: { authorization_code: "secret" }
 *
 * @return [201] On successful login contain the newly created session
 * @return [400] If the session header is missing
 * @return [400] On login failure (unable to retrieve a valid access token)
*/
app.post('/sessions', function(req, res) {
  // TODO get the session uri from the header
  
  // TODO get an access token for the given authorization code

  // TODO decode the access token

  // TODO check if a user/account already exists. If not, create a new user/account

  // TODO attach the session from the header to the user

  // TODO return the session
});


/**
 * Log out from the current session, i.e. detaching the session from the user's account.
 * 
 * @return [204] On successful logout
 * @return [400] If the session header is missing or invalid
*/
app.delete('/sessions/current', function(req, res) {
  // TODO get the session uri from the header
  
  // TODO detach account from the session

  // TODO logout out on the OpenID Provider (?)

  // TODO return response
});

/**
 * Get the current session
 * 
 * @return [200] The current session
 * @return [400] If the session header is missing or invalid
*/
app.get('/sessions/current', function(req, res) {
  // TODO get the session uri from the header

  // TODO get the session information from the store

  // TODO return response
});
