#!/bin/bash
# Integration test harness runner for `add-1code-api-litellm-provisioning`.
#
# Usage:
#   cd services/1code-api && ./tests/integration/run.sh
#   cd services/1code-api && ./tests/integration/run.sh --no-teardown  # keep containers running for debugging
#
# What this script does:
#   1. docker compose up -d --wait (Postgres + LiteLLM with healthchecks)
#   2. Export DATABASE_URL + LITELLM_* env vars pointing at the harness
#   3. Run `bun test tests/integration/*.test.ts`
#   4. docker compose down -v (unless --no-teardown)
#
# Exit codes:
#   0 — all tests pass, teardown clean
#   1 — test failure (teardown still runs)
#   2 — harness startup failure (teardown runs)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
PROJECT_NAME="onecode-api-integration"

NO_TEARDOWN=0
if [[ "${1:-}" == "--no-teardown" ]]; then
  NO_TEARDOWN=1
fi

cleanup() {
  local exit_code=$?
  if [[ $NO_TEARDOWN -eq 0 ]]; then
    echo "==> Tearing down test harness..."
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans 2>&1 || true
  else
    echo "==> Leaving containers running (--no-teardown)."
    echo "    Postgres: localhost:55432 (user=test, pw=test, db=onecode_api_test)"
    echo "    LiteLLM:  http://localhost:54000 (master_key=sk-test-master-integration)"
    echo "    Teardown manually with:"
    echo "      docker compose -f $COMPOSE_FILE -p $PROJECT_NAME down -v"
  fi
  exit $exit_code
}
trap cleanup EXIT INT TERM

echo "==> Starting test harness (Postgres + LiteLLM)..."
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d --wait 2>&1 || {
  echo "==> Harness startup FAILED. Container logs:"
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs 2>&1 | tail -50
  exit 2
}

echo "==> Harness is healthy."

# Export env vars so tests/integration/*.test.ts can reach Postgres + LiteLLM.
# The service's own `config.ts` reads these at module load time, so they must
# be set before `bun test` imports anything.
export DATABASE_URL="postgresql://test:test@localhost:55432/onecode_api_test"
export LITELLM_BASE_URL="http://localhost:54000"
export LITELLM_MASTER_KEY="sk-test-master-integration"
export INTEGRATION_TEST=1

echo "==> Running integration tests..."
cd "$SCRIPT_DIR/../.."
bun test tests/integration/*.test.ts
