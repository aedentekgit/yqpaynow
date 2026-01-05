# Sensitive Credentials - DO NOT COMMIT

This directory contains sensitive credential files that should **NEVER** be committed to git.

## Files excluded from git:

- `gcs-service-account.json` - Google Cloud Storage service account credentials
- `fit-galaxy-*.json` - Project-specific service account files
- Any file matching `*service-account*.json`

## Setting up credentials:

1. Copy the `.example` files and remove the `.example` extension:
   ```bash
   cp gcs-service-account.json.example gcs-service-account.json
   cp ../manual-configure-gcs.js.example ../manual-configure-gcs.js
   ```

2. Download your actual service account JSON from Google Cloud Console:
   - Go to: https://console.cloud.google.com/
   - Navigate to: IAM & Admin → Service Accounts
   - Select your project
   - Create/download a service account key (JSON format)

3. Replace the placeholder content in the copied files with your actual credentials

4. Run the configuration script:
   ```bash
   cd ..
   node manual-configure-gcs.js
   ```

## Security Notes:

- These files are in `.gitignore` and will not be committed
- Keep these files secure and never share them
- If credentials are compromised, regenerate them in Google Cloud Console immediately
- Consider using environment variables or secret managers for production deployments
