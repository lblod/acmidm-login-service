FROM semtech/mu-javascript-template:1.9.1

LABEL maintainer="info@redpencil.io"

ENV MU_APPLICATION_GRAPH http://mu.semte.ch/graphs/public
ENV MU_APPLICATION_AUTH_USERID_CLAIM rrn
ENV MU_APPLICATION_AUTH_ACCOUNTID_CLAIM vo_id
ENV MU_APPLICATION_AUTH_JWK_PRIVATE_KEY /config/jwk_private_key.json
ENV ALLOW_MU_AUTH_SUDO true
