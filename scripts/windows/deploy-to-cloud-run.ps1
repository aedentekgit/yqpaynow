# ============================================
# YQPayNow - Google Cloud Run Deployment Script (PowerShell)
# ============================================

# Configuration
$PROJECT_ID = "your-gcp-project-id"
$SERVICE_NAME = "yqpay"
$REGION = "us-central1"
$FRONTEND_URL = "https://yqpay-78918378061.us-central1.run.app"

Write-Host "============================================" -ForegroundColor Blue
Write-Host "YQPayNow - Google Cloud Run Deployment" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ gcloud CLI not found!" -ForegroundColor Red
    Write-Host "Please install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
    exit 1
}

Write-Host "✅ gcloud CLI found" -ForegroundColor Green

# Set project
Write-Host ""
Write-Host "Setting project to: $PROJECT_ID" -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Deploy Backend
Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "Deploying Backend to Cloud Run" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

Set-Location backend

Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install --production

Write-Host "🚀 Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $SERVICE_NAME `
  --source . `
  --region=$REGION `
  --platform=managed `
  --allow-unauthenticated `
  --set-env-vars "FRONTEND_URL=$FRONTEND_URL,NODE_ENV=production"

Write-Host "✅ Backend deployed successfully!" -ForegroundColor Green

# Get service URL
$BACKEND_URL = gcloud run services describe $SERVICE_NAME `
  --region=$REGION `
  --format="value(status.url)"

Write-Host ""
Write-Host "Backend URL: $BACKEND_URL" -ForegroundColor Green

# Environment variables reminder
Write-Host ""
Write-Host "⚙️  Setting environment variables..." -ForegroundColor Yellow
Write-Host "⚠️  You need to set these manually in Cloud Console:" -ForegroundColor Red
Write-Host "  - MONGODB_URI"
Write-Host "  - FIREBASE_PROJECT_ID"
Write-Host "  - FIREBASE_PRIVATE_KEY"
Write-Host "  - FIREBASE_CLIENT_EMAIL"
Write-Host "  - GCS_BUCKET_NAME"
Write-Host "  - JWT_SECRET"
Write-Host ""
Write-Host "Go to: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/variables"
Write-Host ""

# Test deployment
Write-Host "============================================" -ForegroundColor Blue
Write-Host "Testing Deployment" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

Write-Host "Testing backend health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BACKEND_URL/api/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Backend health check passed!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Backend health check failed" -ForegroundColor Red
}

# View logs
Write-Host ""
Write-Host "📋 Recent logs:" -ForegroundColor Yellow
gcloud run services logs read $SERVICE_NAME `
  --region=$REGION `
  --limit=10

Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Set environment variables in Cloud Console"
Write-Host "2. Login to Super Admin panel: $FRONTEND_URL/super-admin"
Write-Host "3. DELETE ALL OLD QR CODES" -ForegroundColor Red
Write-Host "4. GENERATE NEW QR CODES" -ForegroundColor Green
Write-Host "5. Test QR codes with mobile phone"
Write-Host "6. Verify URL is: $FRONTEND_URL/menu/..."
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  View logs:    gcloud run services logs tail $SERVICE_NAME --region=$REGION"
Write-Host "  Describe:     gcloud run services describe $SERVICE_NAME --region=$REGION"
Write-Host "  Open console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
Write-Host ""
