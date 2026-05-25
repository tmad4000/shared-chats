# Secrets Rotation

## Anthropic API Key

Codex should not generate or rotate the Anthropic key by itself. Jacob must create
the replacement key in the Anthropic dashboard, then provide it to the rotation
script.

From the repo root:

```bash
NEW_KEY="sk-ant-..." bash scripts/rotate-anthropic-key.sh
```

Or without putting the key in shell history:

```bash
printf "%s" "sk-ant-..." | bash scripts/rotate-anthropic-key.sh
```

The script:

1. Reads the new key from `$NEW_KEY` or stdin.
2. Adds a new version to Secret Manager secret `anthropic-api-key`.
3. Redeploys Cloud Run with `scripts/deploy-cloudrun.sh`, which uses
   `ANTHROPIC_API_KEY=anthropic-api-key:latest`.
4. Disables the previously enabled secret version after deploy succeeds.

The script is idempotent for the same key: if the provided key already matches
the latest secret payload, it skips adding a duplicate version and only
redeploys.

## Verification

After rotation:

```bash
curl https://shared-chats-wiic7h46da-uc.a.run.app/api/health
```

Then sign in with a test account, create a chat, and send a short message. The
reply should succeed and a new row should appear in `usage_events`.

## Rollback

If the new key fails, re-enable the previous secret version in Secret Manager,
disable the bad version, and redeploy:

```bash
gcloud secrets versions enable VERSION --secret=anthropic-api-key --project=boreal-conquest-464203-v2
gcloud secrets versions disable BAD_VERSION --secret=anthropic-api-key --project=boreal-conquest-464203-v2
bash scripts/deploy-cloudrun.sh
```
