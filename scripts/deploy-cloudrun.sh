#!/bin/bash
# Deploy shared-chats to Cloud Run with Cloud SQL connection + Secret Manager secrets.

set -euo pipefail

PROJECT="boreal-conquest-464203-v2"
REGION="us-central1"
SERVICE="shared-chats"
INSTANCE="shared-chats-pg"
AR_REPO="shared-chats"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}/${SERVICE}"

echo "==> Enabling services (idempotent)..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com \
  --project="$PROJECT" 2>&1 | tail -3

echo "==> Building image..."
gcloud builds submit \
  --project="$PROJECT" \
  --tag "$IMAGE" \
  . 2>&1 | tail -8

echo "==> Deploying to Cloud Run with Cloud SQL + Secrets..."
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
  --max-instances=10 \
  --add-cloudsql-instances="${PROJECT}:${REGION}:${INSTANCE}" \
  --set-secrets="DATABASE_URL=database-url-shared-chats:latest,AUTH_SECRET=auth-secret-shared-chats:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest" \
  --set-env-vars="NODE_ENV=production" \
  2>&1 | tail -10

echo "==> Service URL:"
gcloud run services describe "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --format='value(status.url)'
