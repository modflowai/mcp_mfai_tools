# MCP MFAI Tools - Advanced MODFLOW AI Search Engine

A production-ready MCP (Model Context Protocol) server with OAuth authentication, deployed on Cloudflare Workers. Provides intelligent, user-controlled search capabilities for MODFLOW/PEST documentation, code modules, and workflows with advanced features and comprehensive metadata display.

## 🚀 Live Deployment

**Production URL:** https://mcp-mfai-tools.little-grass-273a.workers.dev

## ✨ Key Features

- **🔐 OAuth Authentication** - GitHub and Google sign-in with beautiful login page
- **🌐 HTTP Transport** - Cloudflare Workers Edge deployment for global performance
- **👥 User Access Control** - Allowlist-based access for GitHub usernames and Google emails
- **🎯 Specialized Search Tools** - Content-focused tools for tutorials, code, and documentation
- **📊 Rich Metadata Display** - User-controlled output with arrays, snippets, and GitHub links
- **🔍 Advanced Search Strategies** - 5 search types with user-controlled field inclusion
- **⚡ Boolean Parameter Parsing** - Proper handling of MCP string-to-boolean conversion
- **🎨 Beautiful Login UI** - Glass-morphism design with provider selection
- **📝 Comprehensive Debugging** - Multi-level logging for troubleshooting

## 🏗️ Project Architecture

```
mcp_mfai_tools/
├── src/                        # Source code
│   ├── index.ts               # Main entry point with OAuth providers
│   ├── mcp-agent.ts           # MCP agent with authentication logic
│   ├── handlers/              # OAuth and request handlers
│   │   ├── github-handler.ts         # GitHub OAuth flow
│   │   ├── google-handler.ts         # Google OAuth flow
│   │   └── multi-provider-handler.ts # Provider selection UI
│   ├── tools/                 # Advanced MCP tools
│   │   ├── search-code.ts            # ⭐ Advanced API/module search
│   │   ├── text-search.ts            # Full-text search with boolean parsing
│   │   ├── semantic-search.ts        # Vector-based semantic search  
│   │   ├── get-file-content.ts       # Direct file content retrieval
│   │   └── acronym-mappings.json     # Centralized acronym expansions
│   └── utils/                 # Utility functions
│       ├── utils.ts                   # OAuth utility functions
│       └── workers-oauth-utils.ts    # UI rendering utilities
├── config/                    # Configuration files
│   ├── wrangler.toml         # Production Cloudflare configuration
│   └── wrangler.dev.toml     # Development configuration
├── scripts/                   # Automation scripts
│   ├── deploy.sh             # Automated deployment pipeline
│   └── update-secrets.sh     # Secret management automation
├── examples/                  # Testing and examples
│   └── simple-mcp-client.js  # Development test client
├── docs/                      # Technical documentation
│   ├── SCHEMA_CODE_SEARCH.md # Implementation roadmap
│   └── *.md                  # Additional technical docs
├── tests/                     # Test files
├── .env                       # Environment variables (not in git)
├── CLAUDE.md                 # Development guidance for Claude Code
└── README.md                 # This comprehensive guide
```

## 🛠️ Available Tools

### Tools Overview

This MCP server provides **4 specialized search tools** designed for different use cases in the MODFLOW/PEST ecosystem:

| Tool | Purpose | Best For | Key Features |
|------|---------|----------|--------------|
| **🧠 search_code** | API/module search | Function signatures, class definitions, troubleshooting | 5 search strategies, rich metadata, field control |
| **📄 text_search_repository** | Full-text search | Exact keyword matching, technical terms | Boolean operators, wildcards, acronym expansion |
| **🎯 semantic_search_repository** | Conceptual search | Finding similar concepts with different words | AI-powered vector search, conceptual matching |
| **📁 get_file_content** | Direct file access | Complete file retrieval by exact path | No truncation, multi-table routing, GitHub links |

### Detailed Tool Documentation

### 1. 🧠 search_code - Advanced Multi-Strategy Search
**The flagship intelligent search tool with comprehensive user controls.**

**Purpose**: Search for API details, function signatures, class definitions, and troubleshooting information with advanced user-controlled strategies.

**Key Features**:
- **5 search strategies** (general, package, error, usage, concept)
- **Rich array display** (scenarios, concepts, errors, PEST integration)
- **Boolean parameter parsing** for MCP compatibility
- **Field-specific search** (docstrings, purpose, arrays, source code)
- **Advanced filters** (package code, model family, category)
- **Acronym expansion** (WEL → Well Package)
- **Wildcard support** (* → :*)
- **Highlighted snippets** with ts_headline
- **GitHub URL integration**

**Complete Parameters**:
```typescript
{
  query: string,                    // Required: search terms
  repository?: 'flopy' | 'pyemu',  // Optional: specific repository
  limit?: number,                   // 1-50, default: 10
  
  // Search strategy control
  search_type?: 'general' | 'package' | 'error' | 'usage' | 'concept',
  
  // Display options - control rich metadata output
  include_scenarios?: boolean,      // Show user scenarios/use cases
  include_concepts?: boolean,       // Show related concepts/statistical concepts
  include_errors?: boolean,         // Show typical errors/common pitfalls
  include_pest?: boolean,          // Show PEST integration details
  include_source?: boolean,        // Show source code snippets
  include_github?: boolean,        // Show GitHub URLs (default: true)
  include_snippet?: boolean,       // Show highlighted content snippets
  
  // Advanced filters
  package_code?: string,           // Filter by package (WEL, SMS, etc.)
  model_family?: string,           // Filter by model (mf6, mfusg, etc.)
  category?: string,              // Filter PyEMU category (core, utils, etc.)
  
  // Field-specific search control
  search_docstring?: boolean,     // Include docstrings in search
  search_purpose?: boolean,       // Include semantic_purpose in search
  search_arrays?: boolean,        // Include array fields in search
  search_source?: boolean,        // Include source code in search
  
  // Output formatting
  max_array_items?: number,       // 1-10, default: 3
  snippet_length?: number,        // 50-300, default: 150
  compact_format?: boolean        // Compact vs full format
}
```

**Search Strategy Matrix**:
| Strategy | Primary Focus | Best For | Example Query |
|----------|---------------|----------|---------------|
| `general` | search_vector | Broad searches | "hydraulic conductivity" |
| `package` | package_code matches | Specific packages | "WEL package methods" |  
| `error` | typical_errors arrays | Troubleshooting | "convergence failed" |
| `usage` | user_scenarios arrays | Examples/tutorials | "pumping well example" |
| `concept` | related_concepts arrays | Theory/background | "FOSM uncertainty" |

**Example Usage**:
```typescript
// Simple search
mcp__mfaitools__search_code({
  query: "WEL package implementation"
})

// Advanced troubleshooting
mcp__mfaitools__search_code({
  query: "SMS convergence failed debugging",
  search_type: "error",
  include_errors: true,
  include_scenarios: true,
  include_snippet: true,
  package_code: "SMS",
  limit: 5
})

// API documentation search with field control
mcp__mfaitools__search_code({
  query: "parameter uncertainty analysis",
  repository: "pyemu", 
  search_type: "concept",
  search_arrays: true,
  search_purpose: true,
  include_concepts: true,
  include_pest: true
})
```

### 2. 📄 text_search_repository - Full-Text Search
**Comprehensive text search with boolean parsing and wildcard support.**

**Purpose**: Full-text search across all repositories with acronym expansion and boolean operators.

**Key Features**:
- **Boolean parsing fix** for MCP string parameters
- **Acronym expansion** (WEL → Well Package) 
- **Wildcard support** (* for pattern matching)
- **ts_headline snippets** with highlighting
- **Hybrid search strategy** (docs + modules + workflows)

**Parameters**:
```typescript
{
  query: string,                    // Required: search terms
  repository?: string,              // Optional: specific repository
  file_type?: string,              // Filter by file extension
  limit?: number,                  // 1-50, default: 15
  include_content?: boolean        // Show content snippets (default: true)
}
```

### 3. 🎯 semantic_search_repository - Vector Search
**AI-powered semantic search using OpenAI embeddings.**

**Purpose**: Find conceptually similar content even when exact words don't match.

**Key Features**:
- **Vector similarity search** using OpenAI embeddings
- **Conceptual matching** (finds "pumping wells" for "water extraction")
- **Always shows content** (no include_content parameter needed)
- **Smart for concept discovery**

**Parameters**:
```typescript
{
  query: string,                    // Required: natural language query
  repository?: string,              // Optional: specific repository  
  limit?: number,                  // 1-50, default: 10
  filter?: {                       // Optional metadata filters
    model_family?: string,
    package_code?: string,
    category?: string
  }
}
```

### 4. 📁 get_file_content - Direct File Access
**Retrieve complete file content by exact path.**

**Purpose**: Get the full content of a specific file when you know its exact location.

**Key Features**:
- **No truncation** (returns complete files)
- **Multi-table routing** (automatically finds file in correct table)
- **Rich metadata** (title, summary, statistics)
- **GitHub URL integration**

**Parameters**:
```typescript
{
  repository: string,               // Required: repository name
  filepath: string                 // Required: exact file path
}
```

## 🎛️ Advanced User Controls

### Search Strategy Implementation Status

| Phase | Feature | Status | Description |
|-------|---------|--------|-------------|
| 1.1 | Rich Array Display | ✅ | User-controlled metadata display |
| 1.2 | Enhanced Formatting | ✅ | Compact format, array limits, truncation |
| 2.1 | Search Strategies | ✅ | 5 search types with targeted approaches |
| 2.2 | Filters | ✅ | Package, model family, category filtering |
| 3.1 | Field Search | ✅ | User-controlled field inclusion |

### Boolean Parameter Parsing

**Important**: MCP passes boolean parameters as strings. Our tools automatically parse:
- String `"false"` → Boolean `false` ✅
- String `"true"` → Boolean `true` ✅ 
- Boolean `false` → Boolean `false` ✅
- Boolean `true` → Boolean `true` ✅

This ensures `include_snippet=false` actually disables snippets!

## 🗃️ Database Schema

### Repository Coverage

#### Documentation Repositories (repository_files table)
- **mf6**: MODFLOW 6 documentation 
- **pest**: Parameter Estimation documentation
- **pestpp**: PEST++ enhanced version
- **pest_hp**: PEST_HP parallel version
- **mfusg**: MODFLOW-USG unstructured grid
- **plproc**: Parameter list processor
- **gwutils**: Groundwater utilities

#### Code Repositories
- **flopy**: Python MODFLOW package
  - **flopy_modules** (928 kB): API documentation, 13 MB indexes
  - **flopy_workflows**: Tutorial implementations
- **pyemu**: Python uncertainty analysis  
  - **pyemu_modules** (56 kB): API documentation, 2.9 MB indexes
  - **pyemu_workflows**: Analysis workflows

### Rich Metadata Arrays

**FloPy Modules**:
- `user_scenarios[]`: Real-world usage examples with context
- `related_concepts[]`: Connected packages/concepts with explanations
- `typical_errors[]`: Common mistakes and debugging info

**PyEMU Modules**:
- `use_cases[]`: Practical usage scenarios
- `statistical_concepts[]`: Mathematical/statistical concepts
- `common_pitfalls[]`: Common mistakes and warnings
- `pest_integration[]`: PEST software integration details

## 🚀 Setup Instructions

### 1. Create OAuth Applications

#### GitHub OAuth App
1. Go to [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Configure:
   - **Application name**: MCP MFAI Tools
   - **Homepage URL**: `https://your-worker-name.your-subdomain.workers.dev`
   - **Authorization callback URL**: `https://your-worker-name.your-subdomain.workers.dev/callback`
4. Save Client ID and Client Secret

#### Google OAuth App
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project → Enable Google+ API → Create OAuth 2.0 Client ID
3. Configure:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `https://your-worker-name.your-subdomain.workers.dev/callback`
4. Save Client ID and Client Secret

### 2. Configure Cloudflare Workers

```bash
# Create KV namespace for OAuth sessions
wrangler kv:namespace create OAUTH_KV

# Update wrangler.toml with the returned ID
```

Update `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "OAUTH_KV"
id = "your-kv-namespace-id"  # Replace with actual ID

[vars]
ALLOWED_GITHUB_USERS = "your-username,other-user"
ALLOWED_GOOGLE_USERS = "your-email@gmail.com,other@email.com"
DEBUG = "true"
DEVELOPMENT_MODE = "false"  # NEVER set to "true" in production!
```

### 3. Set Secrets

```bash
# Database connection (Neon PostgreSQL)
wrangler secret put MODFLOW_AI_MCP_01_CONNECTION_STRING

# GitHub OAuth credentials
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# Google OAuth credentials  
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET

# Cookie encryption (generate with: openssl rand -base64 32)
wrangler secret put COOKIE_ENCRYPTION_KEY
```

### 4. Deploy

```bash
# Install dependencies
pnpm install

# Automated deployment
./scripts/deploy.sh

# Or manual deployment
npx wrangler deploy

# Update secrets easily
./scripts/update-secrets.sh
```

## 💻 Development

### Local Development (Recommended)

```bash
# Development mode (no OAuth required)
pnpm run dev

# Test all tools
pnpm run test:client

# Access at http://localhost:8787
```

**Development Features**:
- No authentication required
- Mock user created automatically
- All tools available
- Status page with configuration info

### Production Testing

```bash
# Test with OAuth (requires setup)
pnpm run dev:prod

# View deployment logs
pnpm run tail

# Check production logs
npx wrangler tail your-worker-name --format pretty
```

### Adding New Tools

#### 1. Create Tool File
```typescript
// tools/my-advanced-tool.ts
import type { NeonQueryFunction } from "@neondatabase/serverless";

export const myAdvancedToolSchema = {
  name: "my_advanced_tool",
  description: "Advanced tool with user controls",
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      advanced_mode: { type: 'boolean', description: 'Enable advanced features' },
      options: {
        type: 'object',
        properties: {
          include_metadata: { type: 'boolean' },
          max_depth: { type: 'number' }
        }
      }
    },
    required: ['query']
  }
};

export async function myAdvancedTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    // Parse boolean values for MCP compatibility
    const parseBool = (value: any, defaultValue: boolean): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'false') return false;
        if (value.toLowerCase() === 'true') return true;
      }
      return defaultValue;
    };

    const { query } = args;
    const advanced_mode = parseBool(args.advanced_mode, false);
    const include_metadata = parseBool(args.options?.include_metadata, true);

    // Implement your advanced logic here
    console.log(`[MY ADVANCED TOOL] Processing: ${query}, advanced: ${advanced_mode}`);

    // Return MCP-compatible response
    return {
      content: [{
        type: "text" as const,
        text: `Advanced tool executed: ${query}`
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

#### 2. Register Tool
```typescript
// mcp-agent.ts
import { myAdvancedToolSchema, myAdvancedTool } from "./tools/my-advanced-tool.js";

// Add to toolsList
const toolsList = [
  // ... existing tools
  {
    name: myAdvancedToolSchema.name,
    description: myAdvancedToolSchema.description,
    inputSchema: myAdvancedToolSchema.inputSchema,
  }
];

// Add handler
switch (name) {
  // ... existing cases
  case 'my_advanced_tool':
    return await myAdvancedTool(args, this.sql);
}
```

## 🔐 Security & Access Control

### Authentication Flow
1. User visits MCP endpoint → Redirected to OAuth selection
2. User selects provider (GitHub/Google) → OAuth flow
3. Server validates user against allowlist → Issues encrypted session
4. Authenticated user accesses MCP tools

### Security Features
- **OAuth 2.0** with GitHub and Google providers
- **User allowlists** for both GitHub usernames and Google emails  
- **Encrypted session cookies** with secure token handling
- **No public access** - all tools require authentication
- **Environment isolation** between development and production
- **Comprehensive logging** for security monitoring

### User Management
```toml
# wrangler.toml
[vars]
ALLOWED_GITHUB_USERS = "user1,user2,user3"
ALLOWED_GOOGLE_USERS = "email1@gmail.com,email2@company.com"
```

## 🔧 Troubleshooting

### Common Issues

#### Authentication Problems
```
"Authentication failed" / "Access denied"
```
**Solutions**:
- Verify your GitHub username or Google email is in allowlist
- Check `wrangler.toml` environment variables
- Ensure OAuth redirect URLs match deployed worker URL
- Clear browser cookies and retry authentication

#### Database Connection Issues  
```
"Database connection error"
```
**Solutions**:
- Verify `MODFLOW_AI_MCP_01_CONNECTION_STRING` secret is set correctly
- Test Neon database connectivity outside of Cloudflare
- Check database credentials and permissions
- Review Cloudflare Workers logs for detailed error messages

#### Boolean Parameter Issues
```
include_snippet=false still shows snippets
```
**Solutions**:
- This was fixed in our implementation with `parseBool` helper
- MCP passes booleans as strings - our tools handle this automatically
- Verify you're using the latest deployed version

### Development Debugging

```bash
# Check deployment status
npx wrangler tail your-worker-name --format pretty

# Local development with full logging
pnpm run dev

# Test specific tools
pnpm run test:client

# Check configuration
curl https://your-worker-name.your-subdomain.workers.dev/
```

## 📊 Recent Improvements & Version History

### Latest Version: Advanced User Controls (2025)

#### 🎛️ Complete Feature Set
- **5 search strategies** with user-controlled targeting
- **Rich metadata arrays** with comprehensive display options
- **Field-specific search** for docstrings, purpose, arrays, and source code
- **Advanced filters** by package code, model family, and category
- **Boolean parameter parsing** for MCP compatibility
- **Acronym expansion** with centralized mappings
- **GitHub URL integration** for all code results
- **Highlighted snippets** with ts_headline
- **Comprehensive debugging** with detailed execution logs

#### 🔧 Technical Improvements
- **MCP compatibility** for string-to-boolean conversion
- **Performance optimization** with targeted SQL queries
- **User-controlled output** - no hardcoded assumptions
- **Clean architecture** with modular tool design
- **Production-ready deployment** on Cloudflare Workers Edge

#### 🛠️ Tool Specialization
- **search_code**: Advanced multi-strategy API/module search
- **text_search_repository**: Full-text with boolean parsing and wildcards
- **semantic_search_repository**: Vector-based concept search
- **get_file_content**: Complete file retrieval without truncation

### Design Philosophy

**User Control**: Every feature is explicitly controlled by user parameters - no "intelligent" assumptions or hardcoded behavior.

**Performance**: Efficient SQL queries with proper indexing and caching strategies.

**Reliability**: Comprehensive error handling and fallback mechanisms.

**Extensibility**: Clean, modular architecture for easy feature additions.

## 🔮 Community & Contributing

### Getting Involved

This project is designed to serve the MODFLOW/PEST community with powerful, user-controlled search capabilities. We welcome:

- **Feature requests** based on real user needs
- **Performance improvements** and optimization suggestions  
- **Documentation improvements** and usage examples
- **Integration suggestions** with other groundwater modeling tools

### Development Guidelines

- **No hardcoding** - everything must be user-controlled
- **Comprehensive testing** - all features must be thoroughly tested
- **Clear documentation** - every parameter and option explained
- **Performance first** - efficient queries and minimal latency
- **Security focused** - proper authentication and access control

### Support Channels

- **Issues**: GitHub Issues for bug reports and feature requests
- **Documentation**: This README and technical documentation in `docs/`
- **Examples**: Working examples in `examples/` directory
- **Community**: MODFLOW user forums and mailing lists

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🤝 Acknowledgments

Built for the MODFLOW/PEST community with comprehensive search capabilities across:
- **MODFLOW 6** documentation and examples
- **FloPy** Python package modules and workflows
- **PyEMU** uncertainty analysis tools and tutorials  
- **PEST** parameter estimation documentation
- **MODFLOW-USG** unstructured grid resources

---

**Built with ❤️ for the groundwater modeling community**

*Empowering researchers, consultants, and students with intelligent access to MODFLOW/PEST knowledge*