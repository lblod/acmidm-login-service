# ACM/IDM login microservice

This [mu.semte.ch](http://mu.semte.ch) service creates and removes user sessions with [ACM/IDM as its OpenID Connect provider](https://authenticatie.vlaanderen.be/docs/beveiligen-van-toepassingen/integratie-methoden/oidc/). It works with [`@lblod/ember-acmidm-login`](https://github.com/lblod/ember-acmidm-login) in the front end.

## Quick setup

Add this service to a mu stack that has an identifier, dispatcher, and triplestore. Replace the sample values with the values from ACM/IDM.

```yml
services:
  login:
    image: lblod/acmidm-login-service
    environment:
      MU_APPLICATION_AUTH_DISCOVERY_URL: "https://authenticatie.vlaanderen.be/op/.well-known/openid-configuration"
      MU_APPLICATION_AUTH_CLIENT_ID: "my-client-id"
      MU_APPLICATION_AUTH_REDIRECT_URI: "https://myapp.vlaanderen.be/authorization/callback"
      MU_APPLICATION_AUTH_CLIENT_SECRET: "my-client-secret"
```

Keep `MU_APPLICATION_AUTH_CLIENT_SECRET` out of tracked files. Put it in `docker-compose.override.yml` or your deployment secret store.

Add a dispatcher rule for the service:

```elixir
match "/sessions/*path" do
  Proxy.forward conn, path, "http://login/sessions/"
end
```

`login` must match the Compose service name. Start the service and reload the dispatcher:

```bash
docker compose up -d login
docker compose restart dispatcher
```

## Choose a group mode

By default, the service looks up only `besluit:Bestuurseenheid` groups. Use the organization strategy when organizations are the main group type in your application. This supports verenigingen, other organization types, and bestuurseenheden when they use the selected main group type.

### Bestuurseenheden (Support login for bestuurseenheden)

This is the default mode. Do not set `GROUP_TYPE_LABEL` or `ORGANIZATION_TYPE` unless your stack needs different values.

```yml
login:
  image: lblod/acmidm-login-service
  environment:
    # OpenID settings from Quick setup
    GROUP_TYPE_LABEL: "bestuurseenheden"
    ORGANIZATION_TYPE: "http://data.vlaanderen.be/ns/besluit#Bestuurseenheid"
```

The service finds a matching bestuurseenheid in `MU_APPLICATION_GRAPH` by the configured group-ID claim. The group must already exist. If it does not, login fails with `403 Forbidden`.

### Organizations (Supports login for verenigingen, EA's, bestuurseenheden...)

Set `GROUP_TYPE_LABEL` to `organizations` to use the organization strategy. Set `ORGANIZATION_TYPE` to the RDF class of the main group type:

```yml
login:
  image: lblod/acmidm-login-service
  environment:
    # OpenID settings from Quick setup
    GROUP_TYPE_LABEL: "organizations"
    ORGANIZATION_TYPE: "http://www.w3.org/ns/org#Organization"
```

## Authentication guides

### Authenticate with a client ID and secret

Set `MU_APPLICATION_AUTH_CLIENT_ID` and `MU_APPLICATION_AUTH_CLIENT_SECRET` on the service. The Quick setup uses this method.

```yml
login:
  image: lblod/acmidm-login-service
  environment:
    MU_APPLICATION_AUTH_CLIENT_ID: "my-client-id"
    MU_APPLICATION_AUTH_CLIENT_SECRET: "my-client-secret"
```

Keep the secret private. Client ID and client secret often differ between deployment environments.

### Authenticate with a private JWK

To authenticate using JWT with a public/private key pair, you first need to generate a public and private key.
`login`:

```bash
mu script login generate-jwk
```

Copy the private key into `./config/openid/jwk_private_key.json`. Make sure not to commit this file in your code repository.

Share the public key with the OpenID Connect Provider (for ACM/IDM by filling it in in the integration document). Also store it somewhere in a file as backup.

Next, set the `MU_APPLICATION_AUTH_CLIENT_ID` environment variable and mount the config folder as a volume in the login service:

```yml
login:
  image: lblod/acmidm-login-service
  environment:
      MU_APPLICATION_AUTH_CLIENT_ID: "my-client-id"
  volumes:
    - ./config/openid:/config
```

### Run integration tests

Start the stack with this service mounted in development mode. From the root of that stack, run:

```bash
mu script <service-name> test
```

Replace `<service-name>` with the service name from your stack's `docker-compose.yml`. The command finds the running container with this service mounted at `/app`, runs all Jest suites there, and prints a console coverage report.

This requires a `mu-cli` version that supports script config version `0.3`, `mounts.host`, and host permissions.

## Reference

### Environment variables

The service stops at startup when a required OpenID setting is missing. Defaults below come from the service code and Docker image.

| Variable | Required | Type | Default | Description |
|---|---|---|---|---|
| `MU_APPLICATION_AUTH_DISCOVERY_URL` | Yes | URI | — | ACM/IDM discovery document. |
| `MU_APPLICATION_AUTH_CLIENT_ID` | Yes | String | — | Client identifier sent to ACM/IDM. |
| `MU_APPLICATION_AUTH_REDIRECT_URI` | Yes | URI | — | Callback URL used for the code exchange. |
| `MU_APPLICATION_AUTH_CLIENT_SECRET` | No | String | — | Secret for client-secret basic auth. |
| `MU_APPLICATION_AUTH_JWK_PRIVATE_KEY` | No* | File path | `/config/jwk_private_key.json` | Private JWK file for private-key JWT auth. |
| `MU_APPLICATION_AUTH_USERID_CLAIM` | No | String | `rrn` | Claim that holds the user identifier. |
| `MU_APPLICATION_AUTH_ACCOUNTID_CLAIM` | No | String | `vo_id` | Claim that holds the account identifier; `sub` is the fallback. |
| `MU_APPLICATION_AUTH_GROUPID_CLAIM` | No | String | `vo_orgcode` | Claim used to match a group. |
| `MU_APPLICATION_AUTH_ROLE_CLAIM` | No | String | `abb_loketLB_rol_3d` | Claim that holds session roles. |
| `MU_APPLICATION_RESOURCE_BASE_URI` | No | URI | `http://data.lblod.info/` | Prefix for new user, account, and identifier URIs. |
| `MU_APPLICATION_GRAPH` | No | URI | `http://mu.semte.ch/graphs/public` | Graph searched for groups and used for new economic-actor organizations. |
| `USER_GRAPH_TEMPLATE` | No | URI template | `http://mu.semte.ch/graphs/organizations/{{groupId}}` | Graph for users in each group; `{{groupId}}` is optional. |
| `ACCOUNT_GRAPH_TEMPLATE` | No | URI template | `http://mu.semte.ch/graphs/organizations/{{groupId}}` | Graph for accounts in each group; `{{groupId}}` is optional. |
| `SESSION_GRAPH` | No | URI | `http://mu.semte.ch/graphs/sessions` | Graph for sessions. |
| `ORGANIZATION_TYPE` | No | URI | `http://data.vlaanderen.be/ns/besluit#Bestuurseenheid` | RDF class used to match a group. |
| `GROUP_TYPE_LABEL` | No | String | `bestuurseenheden` | Strategy selector and group type in API responses. Leave empty to use the default; otherwise allowed values are `bestuurseenheden` and `organizations`. Use `organizations` for organization mode. |
| `ENABLE_EMAIL_CLAIM` | No | Boolean | `false` | Enables storage of the `vo_email` claim only when set to `true`. |
| `LOGS_GRAPH` | No | URI | `http://mu.semte.ch/graphs/public` | Graph for rejected-login log entries. |
| `DEBUG_LOG_TOKENSETS` | No | String | — | Enables token-set and claim logging; any set value, including `false`, enables it. |
| `LOG_SINK_URL` | No | URI | — | URL that receives token sets. |
| `MU_APPLICATION_AUTH_REQUEST_TIMEOUT` | No | Integer | `5000` | OpenID HTTP request timeout in milliseconds. |
| `MU_SPARQL_ENDPOINT` | No | URI | — | Loaded by `config.js`, but unused by this service's own code. |

* Authentication needs a client secret or a private JWK file. For JWK authentication, store the file at the default path or set this variable to its path. A client secret takes priority when both are available.

### Data model

#### Prefixes

| Prefix | URI |
|---|---|
| adms | http://www.w3.org/ns/adms# |
| foaf | http://xmlns.com/foaf/0.1/ |
| skos | http://www.w3.org/2004/02/skos/core# |
| dcterms | http://purl.org/dc/terms/ |
| besluit | http://data.vlaanderen.be/ns/besluit# |
| org | http://www.w3.org/ns/org# |
| session | http://mu.semte.ch/vocabularies/session/ |
| ext | http://mu.semte.ch/vocabularies/ext/ |
| acmidm | http://mu.semte.ch/vocabularies/ext/acmidm/ |

#### User

##### Class

`foaf:Person`

##### Properties

| Name | Predicate | Range | Definition |
|---|---|---|---|
| identifier | adms:identifier | adms:Identifier | Unique user identifier. |
| firstName | foaf:firstName | string | User's first name, when supplied. |
| familyName | foaf:familyName | string | User's last name, when supplied. |
| email | foaf:email | string | User's email, when `ENABLE_EMAIL_CLAIM` is `true` and `vo_email` is supplied. |

#### Identifier

##### Class

`adms:Identifier`

##### Properties

| Name | Predicate | Range | Definition |
|---|---|---|---|
| notation | skos:notation | string | User identifier from `MU_APPLICATION_AUTH_USERID_CLAIM`; `rrn` by default. |

#### Account

##### Class

`foaf:OnlineAccount`

##### Properties

| Name | Predicate | Range | Definition |
|---|---|---|---|
| identifier | dcterms:identifier | string | Account identifier from `MU_APPLICATION_AUTH_ACCOUNTID_CLAIM`, or `sub` when absent. |
| doelgroepcode | acmidm:doelgroepCode | string | Target-group code from ACM/IDM, when supplied. |
| doelgroepnaam | acmidm:doelgroepNaam | string | Target-group name from ACM/IDM, when supplied. |

#### Group

##### Class

The RDF class set by `ORGANIZATION_TYPE`: `besluit:Bestuurseenheid` by default, or the main group class in organization mode.

#### Session

##### Class

n/a

##### Properties

| Name | Predicate | Range | Definition |
|---|---|---|---|
| account | session:account | foaf:OnlineAccount | Account linked to the session. |
| group | ext:sessionGroup | Configured group class | Group linked to the session. |
| role | ext:sessionRole | string | Normalised user roles linked to the session. |

### API
#### POST /sessions

Logs the user in and creates a session. The service exchanges the supplied authorisation code for ACM/IDM tokens, removes an old session with the same `mu-session-id`, then creates or finds the user and account.

The configured user-ID and group-ID claims are needed for a successful login. The configured account-ID claim is optional when ACM/IDM supplies `sub`. Given name, family name, audience fields, and roles are optional. Email is stored only when `ENABLE_EMAIL_CLAIM` is `true`. Roles are stored without the text after `:`.

In organization mode, an economic actor also needs `vo_orgcode` and `vo_orgnaam` when the service must create its group.

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
    "self": "/sessions/current"
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

For organization mode, the group link and type use `organizations` instead.

###### 400 Bad Request

- The session header is missing.
- The authorisation code is missing.

###### 401 Unauthorized

ACM/IDM rejects the authorisation code or the token exchange fails.

###### 403 Forbidden

No group matches the configured group-ID claim. The service also clears cached allowed groups.

#### DELETE /sessions/current

Logs out the current user by removing the session linked to the account.

##### Response

###### 204 No Content

The service removed the session and cleared cached allowed groups.

###### 400 Bad Request

The session header is missing or does not point to a valid session.

#### GET /sessions/current

Gets the current session.

##### Response

###### 200 OK

The response has the same shape as the `POST /sessions` response, with the current session, account, roles, and group.

###### 400 Bad Request

The session header is missing or does not point to a valid session.

### ACM/IDM OpenID Connect
More information on the OpenID Connect integration with ACM/IDM can be found on the [ACM/IDM documentation website](https://authenticatie.vlaanderen.be/docs/beveiligen-van-toepassingen/integratie-methoden/oidc/) (Dutch only).

Currently this service supports 2 of the authentication methods (see 'How-to guides')
1. Authentication using client ID and secret via basic auth
2. Authentication using a JWT token with an RSA256 public/private key
