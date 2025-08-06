#!/bin/bash

# Script to update Cloudflare Worker secrets from .env file
# Usage: ./update-secrets.sh

set -e  # Exit on error

echo "🔐 Updating Cloudflare Worker Secrets for mcp-mfai-tools"
echo "=================================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Function to extract value from .env file
get_env_value() {
    local key=$1
    # Extract value, handling both quoted and unquoted values
    grep "^${key}=" .env | cut -d '=' -f2- | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
}

# Function to set a secret
set_secret() {
    local secret_name=$1
    local env_var_name=$2
    
    echo -n "Setting ${secret_name}... "
    
    local value=$(get_env_value "$env_var_name")
    
    if [ -z "$value" ]; then
        echo "⚠️  Warning: ${env_var_name} not found in .env, skipping"
        return
    fi
    
    echo "$value" | npx wrangler secret put "$secret_name" --name mcp-mfai-tools --config ../config/wrangler.toml > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅"
    else
        echo "❌ Failed"
        return 1
    fi
}

echo ""
echo "📝 Reading values from .env file..."
echo ""

# Database connection
echo "🗄️  Database Configuration:"
set_secret "MODFLOW_AI_MCP_01_CONNECTION_STRING" "MODFLOW_AI_MCP_01_CONNECTION_STRING"

echo ""
echo "🔑 OAuth Configuration:"

# GitHub OAuth
set_secret "GITHUB_CLIENT_ID" "GITHUB_CLIENT_ID"
set_secret "GITHUB_CLIENT_SECRET" "GITHUB_CLIENT_SECRET"

# Google OAuth
set_secret "GOOGLE_CLIENT_ID" "GOOGLE_CLIENT_ID"
set_secret "GOOGLE_CLIENT_SECRET" "GOOGLE_CLIENT_SECRET"

# Cookie encryption
echo ""
echo "🍪 Security Configuration:"
set_secret "COOKIE_ENCRYPTION_KEY" "COOKIE_ENCRYPTION_KEY"

# Optional: Python executor configuration (if needed)
if grep -q "^PYTHON_EXECUTOR_URL=" .env 2>/dev/null; then
    echo ""
    echo "🐍 Python Executor Configuration (Optional):"
    set_secret "PYTHON_EXECUTOR_URL" "PYTHON_EXECUTOR_URL"
    set_secret "PYTHON_EXECUTOR_API_KEY" "PYTHON_EXECUTOR_API_KEY"
fi

echo ""
echo "=================================================="
echo "✨ Secret update complete!"
echo ""
echo "📌 Worker URL: https://mcp-mfai-tools.little-grass-273a.workers.dev"
echo ""
echo "📋 Next steps:"
echo "  1. Update GitHub OAuth callback URL to:"
echo "     https://mcp-mfai-tools.little-grass-273a.workers.dev/callback"
echo ""
echo "  2. Update Google OAuth redirect URI to:"
echo "     https://mcp-mfai-tools.little-grass-273a.workers.dev/callback"
echo ""
echo "💡 To view current secrets: npx wrangler secret list --config config/wrangler.toml"
echo "💡 To deploy changes: npm run deploy"