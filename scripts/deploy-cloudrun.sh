#!/bin/bash
# Deploy shared-chats to Cloud Run.
# Mirrors collablists deploy pattern.
#
# Prereqs:
#   - gcloud authenticated (jacob@ideaflow.io)
#   - Project: boreal-conquest-464203-v2
#
# Usage: bash scripts/deploy-cloudrun.sh

set -euo pipefail

PROJECT="boreal-conquest-464203-v2"
REGION="us-central1"
SERVICE="shared-chats"
AR_REPO="shared-chats"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/${SERVICE}"

echo "==> Enabling services (idempotent)..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT" 2>&1 | tail -3

echo "==> Creating Artifact Registry repo (idempotent)..."
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT" 2>&1 | tail -3 || true

echo "==> Building image with Cloud Build..."
gcloud builds submit \
  --project="$PROJECT" \
  --tag "$IMAGE" \
  . 2>&1 | tail -10

echo "==> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --image="$IMAGE" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 2>&1 | tail -10

echo "==> Deploy complete. URL:"
gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)'
