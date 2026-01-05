#!/bin/bash

# ============================================
# YQPayNow - Google Cloud Run Deployment Script
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="your-gcp-project-id"
SERVICE_NAME="yqpay"
REGION="us-central1"
FRONTEND_URL="https://yqpay-78918378061.us-central1.run.app"

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}YQPayNow - Google Cloud Run Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found!${NC}"
    echo "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo -e "${GREEN}✅ gcloud CLI found${NC}"

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to gcloud${NC}"
    echo "Running: gcloud auth login"
    gcloud auth login
fi

echo -e "${GREEN}✅ Authenticated with Google Cloud${NC}"

# Set project
echo ""
echo -e "${YELLOW}Setting project to: ${PROJECT_ID}${NC}"
gcloud config set project ${PROJECT_ID}

# Deploy Backend
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Deploying Backend to Cloud Run${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

cd backend

echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install --production

echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars "FRONTEND_URL=${FRONTEND_URL},NODE_ENV=production"

echo -e "${GREEN}✅ Backend deployed successfully!${NC}"

# Get service URL
BACKEND_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format="value(status.url)")

echo ""
echo -e "${GREEN}Backend URL: ${BACKEND_URL}${NC}"

# Set additional environment variables
echo ""
echo -e "${YELLOW}⚙️  Setting environment variables...${NC}"
echo -e "${RED}⚠️  You need to set these manually in Cloud Console:${NC}"
echo "  - MONGODB_URI"
echo "  - FIREBASE_PROJECT_ID"
echo "  - FIREBASE_PRIVATE_KEY"
echo "  - FIREBASE_CLIENT_EMAIL"
echo "  - GCS_BUCKET_NAME"
echo "  - JWT_SECRET"
echo ""
echo "Go to: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}/variables"
echo ""

# Test deployment
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}Testing Deployment${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${YELLOW}Testing backend health endpoint...${NC}"
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" ${BACKEND_URL}/api/health)

if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✅ Backend health check passed!${NC}"
else
    echo -e "${RED}❌ Backend health check failed (HTTP ${HEALTH_CHECK})${NC}"
fi

# View logs
echo ""
echo -e "${YELLOW}📋 Recent logs:${NC}"
gcloud run services logs read ${SERVICE_NAME} \
  --region=${REGION} \
  --limit=10

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Set environment variables in Cloud Console"
echo "2. Login to Super Admin panel: ${FRONTEND_URL}/super-admin"
echo "3. ${RED}DELETE ALL OLD QR CODES${NC}"
echo "4. ${GREEN}GENERATE NEW QR CODES${NC}"
echo "5. Test QR codes with mobile phone"
echo "6. Verify URL is: ${FRONTEND_URL}/menu/..."
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  View logs:    gcloud run services logs tail ${SERVICE_NAME} --region=${REGION}"
echo "  Describe:     gcloud run services describe ${SERVICE_NAME} --region=${REGION}"
echo "  Open console: https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}"
echo ""
