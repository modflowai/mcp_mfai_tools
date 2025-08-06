# MCP MFAI Tools - MODFLOW AI MCP Server

A production-ready MCP (Model Context Protocol) server with OAuth authentication, deployed on Cloudflare Workers. Provides secure access to MODFLOW documentation search capabilities.

## Features

- **OAuth Authentication** - GitHub and Google sign-in with beautiful login page
- **HTTP Transport** - Cloudflare Workers deployment
- **User Access Control** - Allowlist for GitHub usernames and Google emails
- **Six Comprehensive Search Tools** - Foundation and content-focused search capabilities
- **Beautiful Login UI** - Glass-morphism design with provider selection
- **Intelligent Search** - Acronym expansion and semantic understanding
- **Rich Metadata** - Returns complexity levels, best use cases, and recommendations

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
│   ├── semantic-search.ts     # Enhanced semantic search with similarity ranking
│   ├── get-file-content.ts    # Direct file content retrieval
│   ├── search-examples.ts     # Tutorial and workflow search
│   ├── search-code.ts         # API and module search
│   ├── search-documentation.ts # Theory and reference search
│   └── acronym-mappings.json  # Acronym expansions
├── examples/
│   └── simple-mcp-client.js   # Simple test client for development
├── wrangler.toml              # Production configuration
├── wrangler.dev.toml          # Development configuration
├── .dev.vars                  # Development environment variables
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

### Phase 1: Foundation Tools

#### 1. text_search_repository
- **Purpose**: Full-text search across MODFLOW/PEST documentation
- **Features**: Exact keyword matching with acronym expansion, Boolean operators, wildcards
- **Input**: `query` (required), `repository` (optional), `file_type` (optional), `limit` (optional), `include_content` (optional)
- **Best for**: Finding specific functions, classes, variables, or exact terminology
- **Example**: Search for "WEL" automatically expands to include "Well Package" results

#### 2. semantic_search_repository
- **Purpose**: Semantic search using enhanced text analysis and similarity ranking
- **Features**: Conceptual similarity search, summary-based evaluation, smart content retrieval
- **Input**: `query` (required), `repository` (optional), `limit` (optional) 
- **Best for**: Finding conceptually related content even when exact keywords don't match
- **Example**: Search for "groundwater flow modeling" finds related documentation about flow packages, discretization, and solver configuration
- **Note**: Currently uses enhanced text search as fallback (true semantic embeddings require additional infrastructure)

#### 3. get_file_content
- **Purpose**: Retrieve complete content of a specific file by its exact path
- **Features**: Direct file access, full content retrieval, supports all file types in the database
- **Input**: `repository` (required), `filepath` (required)
- **Best for**: Getting the complete content when you know the exact file path
- **Example**: Retrieve `mf6io/well_wel_package.md` from the `mf6` repository
- **Note**: File paths must match exactly as stored in the database

### Phase 2: Content-Focused Tools

#### 4. search_examples
- **Purpose**: Search for tutorials, workflows, and complete implementations
- **Features**: Returns complexity levels, best use cases, workflow purposes
- **Input**: `query` (required), `repository` (optional), `limit` (optional)
- **Best for**: Finding tutorials, working examples, step-by-step implementations
- **Example**: Search for "well package tutorial" returns FloPy/PyEMU workflows
- **Repositories**: Searches flopy_workflows, pyemu_workflows, and documentation examples

#### 5. search_code
- **Purpose**: Search for API details, function signatures, and class definitions
- **Features**: Returns package codes, model families, parameter lists
- **Input**: `query` (required), `repository` (optional), `limit` (optional)
- **Best for**: Finding API documentation, implementation specifics, programming interfaces
- **Example**: Search for "WEL package parameters" returns module documentation
- **Repositories**: Searches flopy_modules, pyemu_modules, and code references

#### 6. search_documentation
- **Purpose**: Search for theory, mathematical background, and conceptual explanations
- **Features**: Returns key concepts, scientific principles, reference guides
- **Input**: `query` (required), `repository` (optional), `limit` (optional)
- **Best for**: Finding theoretical foundations, mathematical formulations, technical explanations
- **Example**: Search for "hydraulic conductivity theory" returns conceptual documentation
- **Repositories**: Comprehensive documentation including MODFLOW 6, PEST, PEST++, MODFLOW-USG

### Supported Repositories

#### Documentation Repositories
- **mf6**: MODFLOW 6 documentation
- **pest**: Parameter Estimation package documentation  
- **pestpp**: PEST++ enhanced version documentation
- **pest_hp**: PEST_HP parallel version documentation
- **mfusg**: MODFLOW-USG (Unstructured Grid) documentation
- **plproc**: Parameter list processor documentation
- **gwutils**: Groundwater data utilities documentation

#### Code Repositories
- **flopy**: Python package for MODFLOW (workflows and modules)
- **pyemu**: PyEMU uncertainty analysis (workflows and modules)

## Development

### Local Testing

#### Development Mode (No OAuth)
For local development and testing without OAuth:

```bash
# Run in development mode (OAuth bypassed)
pnpm run dev

# Test with the simple MCP client
pnpm run test:client

# Access dev server at http://localhost:8787
```

**Development mode features:**
- No authentication required
- Direct access to MCP tools at `/mcp`
- Status page with configuration info at `/`
- Same tools as production version

#### Production Mode Testing
To test OAuth flow locally:

```bash
# Run with production configuration (OAuth required)
pnpm run dev:prod

# View deployment logs
pnpm run tail

# Check production deployment status
npx wrangler tail mcp-mfai-tools --format pretty
```

#### Simple MCP Client
A basic testing client is provided in `examples/simple-mcp-client.js`:

```bash
# Make sure dev server is running first
pnpm run dev

# In another terminal, run the test client
pnpm run test:client
```

This will test all available tools and show you how to interact with the MCP server programmatically.

### Adding New Tools

The recommended process for adding new MCP tools:

#### 1. Create Tool File
Create a new file in the `tools/` directory:
```typescript
// tools/my-tool.ts
export const myToolSchema = {
  name: "my_tool_name",
  description: "Tool description",
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string' },
      param2: { type: 'number' }
    },
    required: ['param1']
  }
};

export async function myTool(args: any, sql: any) {
  // Tool implementation
  return {
    content: [{
      type: "text" as const,
      text: "Result"
    }]
  };
}
```

#### 2. Register in mcp-agent.ts
```typescript
// Import the tool
import { myToolSchema, myTool } from "./tools/my-tool.js";

// Add to toolsList array
const toolsList = [
  // ... existing tools
  {
    name: myToolSchema.name,
    description: myToolSchema.description,
    inputSchema: myToolSchema.inputSchema,
  }
];

// Add handler case
switch (name) {
  // ... existing cases
  case 'my_tool_name':
    return await myTool(args, this.sql);
}
```

#### 3. Deploy and Test
```bash
# Deploy to production
npx wrangler deploy

# Or test locally
pnpm run dev
pnpm run test:client
```

See [CLAUDE.md](./CLAUDE.md) for comprehensive documentation on adding tools.

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