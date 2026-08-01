#!/bin/bash
# Deploy test site to server on port 8080
# Run: bash server_setup/test_site/deploy_test_site.sh

SERVER="root@45.137.194.227"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")/.."

echo "============================================="
echo " Deploy Test Site to Port 8080"
echo "============================================="

# Step 1: Create remote directory and upload files
echo ""
echo "[1/3] Uploading files to server..."
scp -o StrictHostKeyChecking=no "$SCRIPT_DIR/index.html" "${SERVER}:/tmp/test_index.html"
if [ $? -ne 0 ]; then
    echo "UPLOAD FAILED"
    exit 1
fi
echo "Upload complete."

# Step 2: Install files and nginx config on server
echo ""
echo "[2/3] Setting up on server..."
ssh -o StrictHostKeyChecking=no "$SERVER" "
# Create directory
mkdir -p /opt/test_site

# Copy index.html
cp /tmp/test_index.html /opt/test_site/index.html

# Write nginx config
cat > /etc/nginx/sites-available/test_site <<'NGXEOF'
server {
    listen 8080;
    server_name 45.137.194.227 _;

    root /opt/test_site;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGXEOF

# Enable site
ln -sf /etc/nginx/sites-available/test_site /etc/nginx/sites-enabled/test_site

# Test and reload nginx
nginx -t && systemctl reload nginx

# Cleanup
rm /tmp/test_index.html

echo Setup-OK
"

if [ $? -ne 0 ]; then
    echo "REMOTE SETUP FAILED"
    exit 1
fi

echo ""
echo "============================================="
echo " TEST SITE DEPLOYED"
echo " http://45.137.194.227:8080"
echo "============================================="
