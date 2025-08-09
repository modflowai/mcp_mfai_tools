# MODFLOW AI Documentation Scripts

Simple script to add MODFLOW AI documentation to the searchable database.

## update-modflowai-docs.ts

Adds MODFLOW AI documentation to the `repository_files` table so users can search for "What is MODFLOW AI" through the MCP tools.

### What it does:

1. **README Documentation**: Adds `README_public.md` (technical MCP server docs)
2. **Website Content**: Adds firecrawled content from https://www.modflow.ai (marketing/overview)
3. **Upsert**: Can be run multiple times without creating duplicates

### Usage:

```bash
# Set your connection string
export MODFLOW_AI_MCP_01_CONNECTION_STRING="your_neon_connection_string"

# Run the script
pnpm run update-docs
```

### Result:

Users can now ask:
- "What is MODFLOW AI?"
- "How does the MCP server work?"  
- "What search capabilities are available?"

And get proper answers from the search tools! 🎉