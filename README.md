# MCP MFAI Tools - MODFLOW AI MCP Server

A production-ready MCP (Model Context Protocol) server with OAuth authentication, deployed on Cloudflare Workers. Provides secure access to MODFLOW documentation search capabilities.

## Features

- **OAuth Authentication** - GitHub and Google sign-in with beautiful login page
- **HTTP Transport** - Cloudflare Workers deployment
- **User Access Control** - Allowlist for GitHub usernames and Google emails
- **Multiple Tools** - Text search and semantic search for MODFLOW documentation
- **Beautiful Login UI** - Glass-morphism design with provider selection

## Live Deployment

**🚀 Production URL:** https://mcp-mfai-tools.little-grass-273a.workers.dev

## Structure

```
mcp_mfai_tools/
├── index.ts                    # Main entry point with OAuth provider
├── mcp-agent.ts               # MCP agent with authentication  
├── github-handler.ts          # GitHub OAuth handler
├── google-handler.ts          # Google OAuth handler
├── multi-provider-handler.ts  # Provider selection UI
├── utils.ts                   # OAuth utility functions
├── workers-oauth-utils.ts     # UI rendering utilities
├── tools/
│   ├── text-search.ts         # Full-text search with acronym expansion
│   └── semantic-search.ts     # Enhanced semantic search with similarity ranking
├── wrangler.toml              # Cloudflare Workers configuration
├── package.json
├── deploy.sh                  # Automated deployment script
├── update-secrets.sh          # Secret management script
├── CLAUDE.md                  # Development guidance
└── README.md
```

## Setup Instructions

### 1. Create OAuth Applications

#### GitHub OAuth App
1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: MCP MFAI Tools
   - **Homepage URL**: `https://mcp-mfai-tools.little-grass-273a.workers.dev`
   - **Authorization callback URL**: `https://mcp-mfai-tools.little-grass-273a.workers.dev/callback`
4. Save the Client ID and Client Secret

#### Google OAuth App
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Go to Credentials > Create Credentials > OAuth 2.0 Client ID
5. Configure consent screen if needed
6. For Application type, choose "Web application"
7. Add authorized redirect URIs:
   - `https://mcp-mfai-tools.little-grass-273a.workers.dev/callback`
8. Save the Client ID and Client Secret

### 2. Create KV Namespace

```bash
# Create KV namespace for OAuth sessions
wrangler kv:namespace create OAUTH_KV

# Copy the ID from the output and update wrangler.toml
```

### 3. Configure Environment

Update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "YOUR_KV_NAMESPACE_ID_HERE"  # Replace with actual ID

[vars]
ALLOWED_GITHUB_USERS = "your-github-username,other-username"
ALLOWED_GOOGLE_USERS = "your-email@gmail.com,other@example.com"
```

### 4. Set Secrets

```bash
# Database connection
wrangler secret put MODFLOW_AI_MCP_01_CONNECTION_STRING

# GitHub OAuth
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Google OAuth
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Cookie encryption key (generate with: openssl rand -base64 32)
wrangler secret put COOKIE_ENCRYPTION_KEY
```

### 5. Install and Deploy

```bash
# Install dependencies
pnpm install

# Use automated deployment script
./deploy.sh

# Or deploy manually
npx wrangler deploy

# Update secrets easily
./update-secrets.sh
```

## Usage

### Access the MCP Server

1. Visit `https://mcp-mfai-tools.little-grass-273a.workers.dev`
2. Choose your sign-in method (GitHub or Google)
3. Authenticate with your allowed account
4. Access the MCP endpoint at `/mcp`

### Configure Claude Desktop / VS Code

```json
{
  "mcpServers": {
    "mfai": {
      "url": "https://mcp-mfai-tools.little-grass-273a.workers.dev/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}
```

**Note:** The OAuth flow is handled automatically by the MCP client. No manual cookie configuration needed!

## User Management

### Adding Users

Edit `wrangler.toml` or set environment variables:

```toml
[vars]
# GitHub users (by username)
ALLOWED_GITHUB_USERS = "user1,user2,user3"

# Google users (by email)
ALLOWED_GOOGLE_USERS = "email1@gmail.com,email2@example.com"
```

### Default Users

The `mcp-agent.ts` file includes default allowed users that are used if environment variables are not set:

```typescript
const DEFAULT_ALLOWED_USERS = [
  "danilopezmella",
  "modflowai",
  // Add more GitHub usernames
];

const DEFAULT_ALLOWED_EMAILS = [
  "daniel.lopez.me@gmail.com",
  "admin@modflow.ai",
  // Add more Google emails
];
```

## Available Tools

### 1. text_search_repository
- **Purpose**: Full-text search across MODFLOW/PEST documentation
- **Features**: Exact keyword matching with acronym expansion, Boolean operators, wildcards
- **Input**: `query` (required), `repository` (optional), `file_type` (optional), `limit` (optional), `include_content` (optional)
- **Best for**: Finding specific functions, classes, variables, or exact terminology
- **Example**: Search for "WEL" automatically expands to include "Well Package" results

### 2. semantic_search_repository
- **Purpose**: Semantic search using enhanced text analysis and similarity ranking
- **Features**: Conceptual similarity search, summary-based evaluation, smart content retrieval
- **Input**: `query` (required), `repository` (optional), `limit` (optional) 
- **Best for**: Finding conceptually related content even when exact keywords don't match
- **Example**: Search for "groundwater flow modeling" finds related documentation about flow packages, discretization, and solver configuration
- **Note**: Currently uses enhanced text search as fallback (true semantic embeddings require additional infrastructure)

### Supported Repositories
- **mf6**: MODFLOW 6 documentation
- **pest**: Parameter Estimation package documentation  
- **pestpp**: PEST++ enhanced version documentation
- **pest_hp**: PEST_HP parallel version documentation
- **mfusg**: MODFLOW-USG (Unstructured Grid) documentation
- **plproc**: Parameter list processor documentation
- **gwutils**: Groundwater data utilities documentation

## Development

### Local Testing

```bash
# Run locally
pnpm run dev

# View logs
pnpm run tail

# Check deployment status
npx wrangler tail mcp-mfai-tools --format pretty
```

### Adding More Tools

1. Create new tool in `tools/` folder
2. Import and register in `mcp-agent.ts`
3. Tools are only available to authenticated users

## Security

- OAuth authentication required for all MCP access
- User allowlists for both GitHub and Google
- Encrypted session cookies
- Secure token handling
- No public access to tools

## Troubleshooting

### "Authentication failed"
- Ensure your GitHub username or Google email is in the allowed list
- Check `wrangler.toml` or environment variables

### "Database connection error"
- Verify `MODFLOW_AI_MCP_01_CONNECTION_STRING` secret is set
- Check Neon database is accessible

### OAuth callback errors
- Verify OAuth app redirect URLs match your worker URL
- Check Client ID and Secret are correctly set

## License

MIT