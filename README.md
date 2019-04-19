# ACM/IDM login microservice
Microservice running on [mu.semte.ch](http://mu.semte.ch) providing the necessary endpoints to login/logout a user using ACM/IDM as OpenId provider. This backend service works together with `@lblod/ember-acmidm-login` in the frontend.

## Integrate login service in a mu.semte.ch project
Add the following snippet to your `docker-compose.yml` to include the login service in your project.

```
login:
  image: lblod/acmidm-login-service
```

Add rules to the `dispatcher.ex` to dispatch requests to the login service. E.g.

```
  match "/sessions/*path" do
    Proxy.forward conn, path, "http://login/sessions/"
  end
```
The host `login` in the forward URL reflects the name of the login service in the `docker-compose.yml` file as defined above.

More information how to setup a mu.semte.ch project can be found in [mu-project](https://github.com/mu-semtech/mu-project).

## Configuration
The following enviroment variables can be configured:
* `MU_APPLICATION_AUTH_DISCOVERY_URL` [string]: OpenId discovery URL for authentication
* `MU_APPLICATION_AUTH_CLIENT_ID` [string]: Client id of the application in ACM/IDM
* `MU_APPLICATION_AUTH_CLIENT_SECRET` [string]: Client secret of the application in ACM/IDM
* `MU_APPLICATION_AUTH_REDIRECT_URI` [string]: Redirect URI of the application configured in ACM/IDM
* `MU_APPLICATION_AUTH_SCOPE` [string]: Space-separated string of scopes to grant access for (default `openid rrn vo profile abb_loketLB`)
* `MU_APPLICATION_AUTH_ROLE_CLAIM` [string]: Key of the claim that contains the user's roles (default `abb_loketLB_rol_3d`)
* `MU_APPLICATION_AUTH_USERID_CLAIM` [string]: Key of the claim that contains the user's ientifier (default `rrn`)
* `MU_APPLICATION_AUTH_ACCOUNTID_CLAIM` [string]: Key of the claim that contains the account's identifier (default `vo_id`)
* `MU_APPLICATION_RESOURCE_BASE_URI` [string]: Base URI to use for resources created by this service. The URI must end with a trailing slash! (default: `http://data.lblod.info/`)
* `MU_APPLICATION_GRAPH` [string]: URI of the graph in which Bestuurseenheden are stored (default `http://mu.semte.ch/graphs/public`)
* `DEBUG_LOG_TOKENSETS`: When set, received tokenSet information is logged to the console.
* `LOG_SINK_URL`: When set, log tokenSet information to that configured sink.
* `LOGS_GRAPH` [string]: URI of the graph in which LogEntries are stored (default `http://mu.semte.ch/graphs/public`).

## Available requests

#### POST /sessions
Log the user in by creating a new session, i.e. attaching the user's account to a session.

Before creating a new session, the given authorization code gets exchanged for an access token with an OpenID Provider (ACM/IDM) using the configured discovery URL. The returned JWT access token is decoded to retrieve information to attach to the user, account and the session. If the OpenID Provider returns a valid access token, a new user and account are created if they don't exist yet and a the account is attached to the session.

The service handless the following claims included in the access token. Only the claims configured through the environment variables and the claim `vo_orgcode` are required. All other claims are optional.
* `env.MU_APPLICATION_AUTH_USERID_CLAIM`<sup>1</sup>
* `given_name`<sup>1</sup>
* `family_name`<sup>1</sup>
* `env.MU_APPLICATION_AUTH_ACCOUNTID_CLAIM`<sup>2</sup>
* `vo_doelgroepcode`<sup>2</sup>
* `vo_doelgroepnaam`<sup>2</sup>
* `vo_orgcode`<sup>3</sup>
* `env.MU_APPLICATION_AUTH_ROLE_CLAIM`<sup>3</sup>

<sup>1</sup>Information is attached to the user object in the store

<sup>2</sup> Information is attached to the account object in the store

<sup>3</sup> Information is attached to the session in the store

##### Request body
```javascript
{ authorizationCode: "secret" }
```

##### Response
###### 201 Created
On successful login with the newly created session in the response body:

```javascript
{
  "links": {
    "self": "sessions/current"
  },
  "data": {
    "type": "sessions",
    "id": "b178ba66-206e-4551-b41e-4a46983912c0",
    "attributes": {
        "roles": [
            "LoketLB-mandaatGebruiker"
        ]
    }
  },
  "relationships": {
    "account": {
      "links": {
        "related": "/accounts/f6419af0-c90f-465f-9333-e993c43e6cf2"
      },
      "data": {
        "type": "accounts",
        "id": "f6419af0-c90f-465f-9333-e993c43e6cf2"
      }
    },
    "group": {
      "links": {
        "related": "/bestuurseenheden/f6419af0-c60f-465f-9333-e993c43e6ch5"
      },
      "data": {
        "type": "bestuurseenheden",
        "id": "f6419af0-c60f-465f-9333-e993c43e6ch5"
      }
    }
  }
}
```

###### 400 Bad Request
- if session header is missing. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).
- if the authorization code is missing

###### 401 Bad Request
- on login failure. I.e. failure to exchange the authorization code for a valid access token with ACM/IDM

###### 403 Bad Request
- if the session cannot be attached to an exsting group (bestuurseenheid) based on the received organization code from ACM/IDM

#### DELETE /sessions/current
Log out the current user, i.e. remove the session associated with the current user's account.

##### Response
###### 204 No Content
On successful logout

###### 400 Bad Request
If session header is missing or invalid. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).

#### GET /sessions/current
Get the current session

##### Response
###### 200 Created

```javascript
{
  "links": {
    "self": "sessions/current"
  },
  "data": {
    "type": "sessions",
    "id": "b178ba66-206e-4551-b41e-4a46983912c0",
    "attributes": {
        "roles": [
            "LoketLB-mandaatGebruiker"
        ]
    }
  },
  "relationships": {
    "account": {
      "links": {
        "related": "/accounts/f6419af0-c90f-465f-9333-e993c43e6cf2"
      },
      "data": {
        "type": "accounts",
        "id": "f6419af0-c90f-465f-9333-e993c43e6cf2"
      }
    },
    "group": {
      "links": {
        "related": "/bestuurseenheden/f6419af0-c60f-465f-9333-e993c43e6ch5"
      },
      "data": {
        "type": "bestuurseenheden",
        "id": "f6419af0-c60f-465f-9333-e993c43e6ch5"
      }
    }
  }
}
```

###### 400 Bad Request
If session header is missing or invalid. The header should be automatically set by the [identifier](https://github.com/mu-semtech/mu-identifier).
