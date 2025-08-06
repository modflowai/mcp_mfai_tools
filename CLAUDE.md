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

- `index.ts`: Main entry point, configures OAuth provider and development mode
- `mcp-agent.ts`: MCP agent implementation with authentication logic
- `multi-provider-handler.ts`: Handles provider selection UI and OAuth callbacks
- `github-handler.ts`: GitHub-specific OAuth flow
- `google-handler.ts`: Google-specific OAuth flow  
- `tools/text-search.ts`: Full-text database search tool with acronym expansion
- `tools/semantic-search.ts`: Enhanced semantic search with similarity ranking
- `tools/get-file-content.ts`: Direct file content retrieval by exact path
- `examples/simple-mcp-client.js`: Simple test client for development mode

## Development Commands

### Development Mode (Recommended for Local Development)
```bash
# Install dependencies
pnpm install

# Run development server with OAuth bypass
pnpm run dev

# Test with simple MCP client
pnpm run test:client

# Access development server at http://localhost:8787
```

### Production Mode
```bash
# Deploy to Cloudflare Workers
npx wrangler deploy

# Use automated deployment script
./deploy.sh

# Update secrets easily
./update-secrets.sh

# Run locally with production OAuth (requires OAuth setup)
pnpm run dev:prod

# View deployment logs
npx wrangler tail mcp-mfai-tools --format pretty
```

## Configuration Requirements

### Environment Variables (in wrangler.toml)
- `ALLOWED_GITHUB_USERS`: Comma-separated GitHub usernames
- `ALLOWED_GOOGLE_USERS`: Comma-separated Google email addresses
- `DEBUG`: Enable debug logging ("true"/"false")
- `DEVELOPMENT_MODE`: Bypass OAuth when set to "true" (NEVER use in production!)

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

### Overview
The MCP server supports two architectural patterns for adding tools:
1. **Inline tools** (legacy): Defined directly in `mcp-agent.ts`
2. **Modular tools** (recommended): Separate tool files in the `tools/` directory

### Recommended Process: Modular Tools

#### Step 1: Create Tool File
Create a new file in `tools/` directory (e.g., `tools/my-new-tool.ts`):

```typescript
/**
 * My New Tool
 * Description of what this tool does
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Tool schema definition
export const myNewToolSchema = {
  name: "my_new_tool",
  description: `
    Detailed description of what the tool does.
    Include usage examples and important notes.
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Description of the query parameter',
      },
      optional_param: {
        type: 'string',
        description: 'Description of optional parameter',
      },
    },
    required: ['query'],
  }
};

// Tool implementation
export async function myNewTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { query, optional_param } = args;

    // Validate inputs
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    // Implement your tool logic here
    console.log('[MY NEW TOOL] Processing:', query);
    
    // Execute database queries or other operations
    // const results = await sql`SELECT * FROM table WHERE condition = ${query}`;

    // Format and return results
    return {
      content: [{
        type: "text" as const,
        text: `Tool executed successfully with query: ${query}`
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}
```

#### Step 2: Register Tool in mcp-agent.ts

1. **Import the tool**:
```typescript
import { myNewToolSchema, myNewTool } from "./tools/my-new-tool.js";
```

2. **Add to toolsList array**:
```typescript
// Register available tools
const toolsList = [
  {
    name: textSearchSchema.name,
    description: textSearchSchema.description,
    inputSchema: textSearchSchema.inputSchema,
  },
  {
    name: semanticSearchSchema.name,
    description: semanticSearchSchema.description,
    inputSchema: semanticSearchSchema.inputSchema,
  },
  {
    name: getFileContentSchema.name,
    description: getFileContentSchema.description,
    inputSchema: getFileContentSchema.inputSchema,
  },
  {
    name: myNewToolSchema.name,
    description: myNewToolSchema.description,
    inputSchema: myNewToolSchema.inputSchema,
  }
];
```

3. **Add case handler**:
```typescript
switch (name) {
  case 'text_search_repository':
    return await this.handleTextSearchRepository(args);
  
  case 'semantic_search_repository':
    return await this.handleSemanticSearchRepository(args);
  
  case 'get_file_content':
    return await this.handleGetFileContent(args);
  
  case 'my_new_tool':
    return await this.handleMyNewTool(args);
  
  default:
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Unknown tool: ${name}`
    );
}
```

4. **Implement handler method**:
```typescript
private async handleMyNewTool(args: any) {
  return await myNewTool(args, this.sql);
}
```

5. **Update logging**:
```typescript
console.log("[MCP] Registered tools:", textSearchSchema.name, semanticSearchSchema.name, getFileContentSchema.name, myNewToolSchema.name);
```

#### Step 3: Deploy and Test

1. **Deploy to Cloudflare**:
```bash
npx wrangler deploy
```

2. **Test locally** (optional):
```bash
pnpm run dev
```

3. **Reconnect MCP client** to see new tool:
   - In Claude Desktop/VS Code: disconnect and reconnect to MCP server
   - Use `/mcp` command to refresh connection

4. **Test the tool**:
```typescript
// Example MCP tool call
mcp__mfaitools__my_new_tool({
  query: "test query",
  optional_param: "test value"
})
```

### Tool Development Best Practices

#### Input Validation
- Always validate required parameters
- Check parameter types and formats
- Set reasonable limits (e.g., query length < 500 chars)
- Provide clear error messages

#### Database Operations
- Use parameterized queries with the `sql` template literal
- Handle database errors gracefully
- Log important operations for debugging
- Consider query performance and limits

#### Output Formatting
- Return consistent MCP response format
- Include helpful metadata (counts, statistics)
- Format results for readability
- Handle empty results gracefully

#### Error Handling
- Catch and handle all exceptions
- Return user-friendly error messages
- Log detailed errors for debugging
- Don't expose internal system details

### Tool Categories and Examples

#### Database Query Tools
- **Text Search**: Full-text search with PostgreSQL and acronym expansion
- **Semantic Search**: Enhanced search with similarity ranking
- **Get File Content**: Direct file retrieval by exact path
- **Data Extraction**: Retrieve specific records or statistics

#### Analysis Tools
- **Comparison**: Compare results across repositories
- **Statistics**: Calculate metrics and summaries
- **Validation**: Check data quality and consistency

#### Utility Tools
- **Format Conversion**: Transform data between formats
- **Export**: Generate reports or downloadable content
- **Integration**: Connect with external APIs or services

### Testing Your New Tool

#### Local Testing
```bash
# Start development server
pnpm run dev

# Test with curl (requires OAuth setup)
curl -X POST "http://localhost:8787/mcp" \
  -H "Content-Type: application/json" \
  -d '{"method": "tools/call", "params": {"name": "my_new_tool", "arguments": {"query": "test"}}}'
```

#### Production Testing
```bash
# Deploy to Cloudflare
npx wrangler deploy

# Check deployment logs
npx wrangler tail mcp-mfai-tools --format pretty

# Test via MCP client (Claude Desktop/VS Code)
# Use the tool through your MCP client interface
```

### Common Issues and Solutions

#### Tool Not Appearing
- **Solution**: Reconnect MCP client to refresh tool list
- **Check**: Ensure tool is properly registered in `toolsList`
- **Verify**: Check deployment logs for errors

#### Database Connection Errors
- **Check**: Verify `MODFLOW_AI_MCP_01_CONNECTION_STRING` secret
- **Test**: Use existing tools to verify database connectivity
- **Debug**: Check Cloudflare Workers logs

#### Input Validation Failures
- **Review**: Ensure inputSchema matches tool expectations
- **Test**: Try with minimal valid inputs first
- **Debug**: Add console.log statements to trace execution

#### Authentication Issues
- **Verify**: User is in allowlist (`ALLOWED_GITHUB_USERS` or `ALLOWED_GOOGLE_USERS`)
- **Check**: OAuth flow completes successfully
- **Test**: Try with text search tool first to verify auth

### Migration from Reference Implementation

When adapting tools from `.references/`, follow these steps:

1. **Extract core logic** from the reference tool
2. **Adapt imports** for Cloudflare Workers environment
3. **Replace external dependencies** (e.g., OpenAI SDK) with compatible alternatives
4. **Simplify complex features** that require additional infrastructure
5. **Add fallback mechanisms** for missing capabilities
6. **Test thoroughly** with various inputs

Example: The semantic search tool uses enhanced text search as a fallback since true embedding-based search requires additional infrastructure not available in the Cloudflare Workers environment.

## Database Schema

The search tools query the `repository_files` table with columns:
- `filepath`: Document file path
- `repo_name`: Repository name (mf6, pest, etc.)
- `file_type`: File extension type
- `content`: Full document content (used for full-text search)
- `analysis`: JSON metadata containing title, summary, and other structured data
- `created_at`: Timestamp when record was created
- `embedding`: Vector embeddings for semantic search (where available)

### Available Repositories
- **mf6**: MODFLOW 6 documentation
- **pest**: Parameter Estimation package documentation  
- **pestpp**: PEST++ enhanced version documentation
- **pest_hp**: PEST_HP parallel version documentation
- **mfusg**: MODFLOW-USG (Unstructured Grid) documentation
- **plproc**: Parameter list processor documentation
- **gwutils**: Groundwater data utilities documentation
- **flopy**: Python package for MODFLOW (code repositories)
- **pyemu**: PyEMU uncertainty analysis (code repositories)

## Testing

### Development Mode Testing
For local development without OAuth complexity:

```bash
# Start development server (no OAuth)
pnpm run dev

# In another terminal, test with simple client
pnpm run test:client

# Or configure your MCP client:
# URL: http://localhost:8787/mcp
# No authentication required
```

The development server at `http://localhost:8787` provides:
- `/` - Status page with server info and tool list
- `/mcp` - Direct MCP endpoint (no auth required)

**Development Mode Features:**
- OAuth authentication completely bypassed
- Mock user created automatically
- Database connection optional (tools will warn if missing)
- Same tools available as production
- Simple test client included for testing

### Production Testing
**Testing the deployed server:**
- Check logs: `npx wrangler tail mcp-mfai-tools --format pretty`
- Test OAuth flow: Visit https://mcp-mfai-tools.little-grass-273a.workers.dev
- Test MCP endpoint: Configure in VS Code or Claude Desktop with authentication

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