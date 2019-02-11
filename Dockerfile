FROM semtech/mu-javascript-template:1.3.5

LABEL maintainer="info@redpencil.io"

ENV MU_APPLICATION_GRAPH http://mu.semte.ch/graphs/public
ENV MU_APPLICATION_AUTH_USERID_CLAIM rrn
ENV MU_APPLICATION_AUTH_ACCOUNTID_CLAIM vo_id
