#!/usr/bin/env bash

set -euo pipefail

containers=$(host docker compose ps -q)

if [[ -z "$containers" ]]; then
  echo "No running containers found in the current Compose project." >&2
  echo "Start the stack before running the integration tests." >&2
  exit 1
fi

matches=()

for container in $containers; do
  if host docker exec "$container" test -f /app/package.json \
    && host docker exec "$container" test -f /app/tests/config.js \
    && host docker exec "$container" test -f /app/tests/shared.js \
    && host docker exec "$container" test -f /app/tests/cases/bestuurseenheid.js \
    && host docker exec "$container" test -f /app/tests/cases/organisation.js; then
    matches+=("$container")
  fi
done

if [[ "${#matches[@]}" -eq 0 ]]; then
  echo "Could not find a running Compose container with this service mounted at /app." >&2
  echo "Start the service with its source directory mounted before running the tests." >&2
  exit 1
fi

if [[ "${#matches[@]}" -gt 1 ]]; then
  echo "Found more than one running container with this service mounted at /app:" >&2
  printf '  %s\n' "${matches[@]}" >&2
  echo "Run the tests with only one development instance of this service." >&2
  exit 1
fi

host docker exec -w /app "${matches[0]}" npm test
