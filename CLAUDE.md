# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready MCP (Model Context Protocol) Server deployed on Cloudflare Workers with OAuth authentication (GitHub and Google) and HTTP transport. It provides secure access to MODFLOW documentation search capabilities through a single database tool.

**Production URL:** https://mcp-mfai-tools.little-grass-273a.workers.dev

## Architecture

- **Cloudflare Workers**: Serverless deployment platform using Edge runtime
- **OAuth Providers**: GitHub and Google authentication with user allowlists
- **MCP Protocol**: Implements Model Context Protocol with HTTP transport
- **Database**: Neon PostgreSQL for full-text search in MODFLOW documentation
- **Durable Objects**: Used for stateful MCP agent instances

## Key Components

- `index.ts`: Main entry point, configures OAuth provider
- `mcp-agent.ts`: MCP agent implementation with authentication logic
- `multi-provider-handler.ts`: Handles provider selection UI and OAuth callbacks
- `github-handler.ts`: GitHub-specific OAuth flow
- `google-handler.ts`: Google-specific OAuth flow  
- `tools/text-search.ts`: Database search tool for MODFLOW documentation

## Development Commands

```bash
# Install dependencies
pnpm install

# Run development server locally
pnpm run dev

# Deploy to Cloudflare Workers
npx wrangler deploy

# Use automated deployment script
./deploy.sh

# Update secrets easily
./update-secrets.sh

# View deployment logs
npx wrangler tail mcp-mfai-tools --format pretty
```

## Configuration Requirements

### Environment Variables (in wrangler.toml)
- `ALLOWED_GITHUB_USERS`: Comma-separated GitHub usernames
- `ALLOWED_GOOGLE_USERS`: Comma-separated Google email addresses
- `DEBUG`: Enable debug logging ("true"/"false")

### Secrets (set with wrangler secret put)
- `MODFLOW_AI_MCP_01_CONNECTION_STRING`: Neon database connection
- `GITHUB_CLIENT_ID`: GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth app client secret
- `GOOGLE_CLIENT_ID`: Google OAuth app client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth app client secret
- `COOKIE_ENCRYPTION_KEY`: Cookie encryption key (generate with: openssl rand -base64 32)

### KV Namespace
Must create and configure OAUTH_KV namespace for session storage:
```bash
wrangler kv:namespace create OAUTH_KV
```

## Authentication Flow

1. MCP client connects to `/mcp` endpoint
2. Server redirects to OAuth provider selection page
3. User selects authentication provider (GitHub or Google)
4. User completes OAuth flow with selected provider
5. Server validates user against allowlist
6. Authenticated users can access MCP tools

**Working URLs:**
- OAuth Selection: https://mcp-mfai-tools.little-grass-273a.workers.dev/authorize
- MCP Endpoint: https://mcp-mfai-tools.little-grass-273a.workers.dev/mcp

## Adding New MCP Tools

Tools are now defined directly in `mcp-agent.ts`. To add new tools:
1. Define the tool schema (name, description, inputSchema)
2. Add the tool to the `toolsList` array in the `init()` method
3. Add a case handler in the `CallToolRequestSchema` handler
4. Implement the tool logic as a private method

## Database Schema

The text search tool queries tables named `{repository}_search` with columns:
- `filepath`: Document file path
- `title`: Document title
- `summary`: Document summary
- `content`: Full document content (used for full-text search)

## Testing

For local development, use `pnpm run dev` which starts a local Cloudflare Workers development server. The server will be available at `http://localhost:8787`.

**Testing the deployed server:**
- Check logs: `npx wrangler tail mcp-mfai-tools --format pretty`
- Test OAuth flow: Visit https://mcp-mfai-tools.little-grass-273a.workers.dev
- Test MCP endpoint: Configure in VS Code or Claude Desktop

## Deployment Notes

- Use `./deploy.sh` for automated deployments
- Use `./update-secrets.sh` to easily update secrets from .env file
- Always update user allowlists in `wrangler.toml` before deployment
- OAuth redirect URLs must match the deployed worker URL: https://mcp-mfai-tools.little-grass-273a.workers.dev/callback
- KV namespace is already created: `c6668cdb8dfc4f2abf67aab912b3fc27`

## Current Configuration

**GitHub OAuth App:** Configured for production deployment
**Google OAuth App:** Configured for production deployment
**Allowed Users:** 
- GitHub: `modflowai`, `danilopezmella`
- Google: `daniel.lopez.me@gmail.com`, `admin@modflow.ai`