#!/bin/bash

# Complete deployment script for mcp-mfai-tools
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 MCP MFAI Tools - Complete Deployment Script"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo "Please create a .env file with the required environment variables."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Check if KV namespace exists
echo ""
echo "🔍 Checking KV namespace..."
KV_ID=$(grep "^id = " wrangler.toml | grep -v "#" | head -1 | cut -d'"' -f2)

if [ "$KV_ID" = "YOUR_KV_NAMESPACE_ID" ] || [ -z "$KV_ID" ]; then
    echo "📝 Creating KV namespace..."
    KV_OUTPUT=$(npx wrangler kv namespace create OAUTH_KV 2>&1)
    NEW_KV_ID=$(echo "$KV_OUTPUT" | grep 'id = ' | cut -d'"' -f2)
    
    if [ -n "$NEW_KV_ID" ]; then
        # Update wrangler.toml with the new KV namespace ID
        sed -i.bak "s/id = \".*\"/id = \"$NEW_KV_ID\"/" wrangler.toml
        echo -e "${GREEN}✅ KV namespace created: $NEW_KV_ID${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not create KV namespace. It might already exist.${NC}"
    fi
else
    echo -e "${GREEN}✅ KV namespace already configured: $KV_ID${NC}"
fi

# Deploy the worker
echo ""
echo "☁️  Deploying to Cloudflare Workers..."
npx wrangler deploy

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Worker deployed successfully${NC}"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

# Update secrets
echo ""
echo "🔐 Updating secrets..."
./update-secrets.sh

# Get the worker URL
WORKER_URL=$(npx wrangler deployments list | grep "https://" | head -1 | awk '{print $2}' || echo "https://mcp-mfai-tools.little-grass-273a.workers.dev")

echo ""
echo "=============================================="
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo "📌 Worker URL: $WORKER_URL"
echo ""
echo "📋 Required OAuth Configuration:"
echo ""
echo "GitHub OAuth App:"
echo "  - Authorization callback URL:"
echo "    ${WORKER_URL}/callback"
echo ""
echo "Google OAuth App:"
echo "  - Authorized redirect URI:"
echo "    ${WORKER_URL}/callback"
echo ""
echo "🧪 Test your deployment:"
echo "  curl ${WORKER_URL}"
echo ""
echo "📊 View logs:"
echo "  npx wrangler tail"
echo ""