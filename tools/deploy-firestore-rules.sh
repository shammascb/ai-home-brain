#!/bin/sh
set -eu

PROJECT_ID="ai-home-brain-6df82"
DATABASE_ID="ai-studio-aihomebrain-98663c1f-43eb-4ecf-ab4f-fff5493858df"
PROJECT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

cd "$PROJECT_ROOT"
npx --yes firebase-tools login
npx --yes firebase-tools deploy \
  --project "$PROJECT_ID" \
  --only "firestore:$DATABASE_ID"
