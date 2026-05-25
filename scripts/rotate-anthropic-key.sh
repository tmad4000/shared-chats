#!/bin/bash
# Add a new Anthropic API key secret version, redeploy Cloud Run, then disable
# the previously enabled version. The new key is read from $NEW_KEY or stdin.

set -euo pipefail

PROJECT="${PROJECT:-boreal-conquest-464203-v2}"
SECRET="${SECRET:-anthropic-api-key}"

if [[ -n "${NEW_KEY:-}" ]]; then
  key="$NEW_KEY"
else
  key="$(cat)"
fi

key="$(printf "%s" "$key" | tr -d '\r\n')"
if [[ -z "$key" ]]; then
  echo "NEW_KEY or stdin is required" >&2
  exit 1
fi

old_version="$(gcloud secrets versions list "$SECRET" \
  --project="$PROJECT" \
  --filter="state:ENABLED" \
  --sort-by="~createTime" \
  --limit=1 \
  --format="value(name)" | awk -F/ '{print $NF}')"

latest_payload="$(gcloud secrets versions access latest --secret="$SECRET" --project="$PROJECT" 2>/dev/null || true)"
if [[ "$latest_payload" == "$key" ]]; then
  echo "Secret latest version already matches the provided key; redeploying only."
  new_version="$old_version"
else
  echo "Adding new version to Secret Manager secret $SECRET..."
  printf "%s" "$key" | gcloud secrets versions add "$SECRET" \
    --project="$PROJECT" \
    --data-file=- >/dev/null
  new_version="$(gcloud secrets versions list "$SECRET" \
    --project="$PROJECT" \
    --filter="state:ENABLED" \
    --sort-by="~createTime" \
    --limit=1 \
    --format="value(name)" | awk -F/ '{print $NF}')"
fi

echo "Redeploying Cloud Run so ANTHROPIC_API_KEY=$SECRET:latest resolves to version $new_version..."
bash scripts/deploy-cloudrun.sh

if [[ -n "$old_version" && "$old_version" != "$new_version" ]]; then
  echo "Disabling previous enabled secret version $old_version..."
  gcloud secrets versions disable "$old_version" \
    --secret="$SECRET" \
    --project="$PROJECT" \
    --quiet >/dev/null
fi

echo "Rotation prep complete. Active latest version: $new_version"
