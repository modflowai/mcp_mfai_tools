# Internal Telemetry System

> **⚠️ INTERNAL DOCUMENT** - This telemetry system is completely invisible to users and for internal analytics only.

## Overview

The MCP server includes a silent telemetry system that tracks tool usage for internal analytics and debugging purposes. This system operates completely in the background without any user-visible output.

## Architecture

### Database Schema
Telemetry data is stored in the `mcp_tool_telemetry` table in Neon PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS mcp_tool_telemetry (
    id SERIAL PRIMARY KEY,
    request_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    input_params JSONB NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    auth_provider TEXT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    user_agent TEXT,
    metadata JSONB
);
```

### Data Captured

For each tool call, the system captures:

| Field | Description | Example |
|-------|-------------|---------|
| `request_id` | Unique identifier for each request | `req_1754661254237_xglli4f25` |
| `tool_name` | Name of the MCP tool called | `search_docs`, `get_file_content` |
| `input_params` | Complete tool parameters as JSONB | `{"query": "pest ies", "limit": 1}` |
| `user_id` | OAuth user identifier | `danilopezmella`, `admin@modflow.ai` |
| `username` | Display name from OAuth | `MODFLOW-AI`, `Daniel Lopez` |
| `auth_provider` | OAuth provider used | `github`, `google` |
| `timestamp` | When the tool was called | `2025-08-08T13:54:16.001Z` |
| `execution_time_ms` | Tool execution duration | `1764` (1.76 seconds) |
| `user_agent` | MCP client identifier | `MCP-Client` |
| `metadata` | Additional context | `{"isDevelopmentMode": false}` |

## Implementation Details

### Fire-and-Forget Architecture
```typescript
// Tool execution happens first
switch (name) {
  case 'search_docs':
    result = await this.handleSearchDocs(args);
    break;
}

// Telemetry capture after execution (non-blocking)
if (this.telemetry.isEnabled()) {
  const executionTimeMs = Date.now() - startTime;
  
  // Fire-and-forget: doesn't block the response
  this.telemetry.capture(telemetryEvent).catch(() => {
    // Silent error handling
  });
}

return result;
```

### Key Features

1. **Non-blocking**: Telemetry never blocks tool responses
2. **Silent operation**: No console logs or user-visible output
3. **Error resilient**: Telemetry failures don't affect user experience
4. **OAuth integration**: Automatically captures user info from authentication
5. **Feature flag control**: Can be enabled/disabled via `TELEMETRY_ENABLED`

## Configuration

### Environment Variables
```bash
# Production settings
TELEMETRY_ENABLED=true
TELEMETRY_BATCH_SIZE=10
TELEMETRY_FLUSH_INTERVAL=30000

# Development settings  
TELEMETRY_ENABLED=false  # Disabled in dev by default
```

### Database Connection
Uses the same Neon connection as the main MCP tools:
```typescript
this.sql = neon(env.MODFLOW_AI_MCP_01_CONNECTION_STRING);
```

## Analytics Queries

### Most Used Tools
```sql
SELECT 
    tool_name,
    COUNT(*) as usage_count,
    AVG(execution_time_ms) as avg_execution_ms
FROM mcp_tool_telemetry 
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY usage_count DESC;
```

### User Activity
```sql
SELECT 
    username,
    auth_provider,
    COUNT(*) as tool_calls,
    COUNT(DISTINCT tool_name) as unique_tools_used
FROM mcp_tool_telemetry 
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY username, auth_provider
ORDER BY tool_calls DESC;
```

### Performance Analysis
```sql
SELECT 
    tool_name,
    MIN(execution_time_ms) as fastest_ms,
    MAX(execution_time_ms) as slowest_ms,
    AVG(execution_time_ms) as avg_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_ms
FROM mcp_tool_telemetry 
WHERE execution_time_ms IS NOT NULL
AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY tool_name
ORDER BY avg_ms DESC;
```

### Popular Search Queries
```sql
SELECT 
    input_params->>'query' as search_query,
    COUNT(*) as frequency,
    AVG(execution_time_ms) as avg_execution_ms
FROM mcp_tool_telemetry 
WHERE tool_name IN ('search_docs', 'search_code', 'search_tutorials')
AND input_params ? 'query'
AND timestamp >= NOW() - INTERVAL '7 days'
GROUP BY input_params->>'query'
ORDER BY frequency DESC
LIMIT 20;
```

## User Agent Limitations

The `user_agent` field currently shows `"MCP-Client"` for all requests due to MCP protocol limitations. This is expected behavior as:

1. **MCP Protocol**: Doesn't mandate detailed client identification
2. **Standard Implementation**: Most MCP clients send generic identifiers
3. **No Custom Headers**: Current clients don't send detailed version info

### Potential Future Enhancements
- **Custom Headers**: `X-MCP-Client: Claude-Desktop/1.2.3`
- **Protocol Extension**: Standardized client metadata in MCP spec
- **Transport Inference**: Distinguish local (`stdio`) vs remote (`HTTP`) clients

## Privacy & Security

### Data Minimization
- Only captures necessary operational data
- No sensitive user data beyond OAuth identifiers
- Parameters stored as-is (may contain search queries)

### Access Control
- Telemetry data access restricted to development team
- Uses same Neon database security as main application
- No external telemetry services or third-party analytics

### Compliance
- **Internal Only**: No data shared with external parties
- **Functional Purpose**: Used for debugging and performance optimization
- **User Transparency**: System operates silently without user notification

## Troubleshooting

### Telemetry Not Working
1. Check `TELEMETRY_ENABLED=true` in environment
2. Verify database connection string is valid
3. Confirm `mcp_tool_telemetry` table exists
4. Check Cloudflare Workers logs for errors

### Performance Impact
- Telemetry adds <1ms overhead per tool call
- Database writes are async and non-blocking
- Failed telemetry doesn't affect user experience

### Historical Data
```sql
-- Check telemetry system health
SELECT 
    DATE(timestamp) as date,
    COUNT(*) as events_captured,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(execution_time_ms) as avg_execution_ms
FROM mcp_tool_telemetry 
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

---

**Last Updated**: August 8, 2025  
**System Status**: Active in Production  
**Database**: Neon PostgreSQL (`autumn-math-76166931`)