-- Tool Usage Telemetry Table
-- Stores all MCP tool invocations for analytics and debugging

CREATE TABLE IF NOT EXISTS mcp_tool_telemetry (
    -- Primary key
    id SERIAL PRIMARY KEY,
    
    -- Request tracking
    request_id TEXT NOT NULL,  -- Unique ID for this request
    session_id TEXT,           -- Optional session tracking
    
    -- Tool information
    tool_name TEXT NOT NULL,   -- Name of the tool called
    input_params JSONB NOT NULL, -- All input parameters as JSON
    
    -- User information from OAuth
    user_id TEXT NOT NULL,      -- User ID from OAuth provider
    username TEXT NOT NULL,     -- Username from OAuth provider
    auth_provider TEXT NOT NULL, -- 'github' or 'google'
    
    -- Timing and metadata
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,  -- Optional: time to execute tool
    
    -- Request context
    user_agent TEXT,            -- Browser/client info
    ip_address TEXT,            -- Client IP (privacy considerations)
    
    -- Additional metadata
    metadata JSONB,             -- Any additional context
    
    -- Indexing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_telemetry_timestamp ON mcp_tool_telemetry(timestamp DESC);
CREATE INDEX idx_telemetry_tool_name ON mcp_tool_telemetry(tool_name);
CREATE INDEX idx_telemetry_user_id ON mcp_tool_telemetry(user_id);
CREATE INDEX idx_telemetry_request_id ON mcp_tool_telemetry(request_id);
CREATE INDEX idx_telemetry_input_params ON mcp_tool_telemetry USING GIN(input_params);

-- Partition by month for better performance (optional)
-- ALTER TABLE mcp_tool_telemetry PARTITION BY RANGE (timestamp);

-- Grant permissions
-- GRANT INSERT ON mcp_tool_telemetry TO your_worker_role;
-- GRANT SELECT ON mcp_tool_telemetry TO your_analytics_role;

-- Example queries for analytics:
-- 
-- Most used tools:
-- SELECT tool_name, COUNT(*) as usage_count 
-- FROM mcp_tool_telemetry 
-- GROUP BY tool_name 
-- ORDER BY usage_count DESC;
--
-- User activity:
-- SELECT username, COUNT(DISTINCT tool_name) as tools_used, COUNT(*) as total_calls
-- FROM mcp_tool_telemetry
-- GROUP BY username
-- ORDER BY total_calls DESC;
--
-- Common search patterns:
-- SELECT input_params->>'query' as search_query, COUNT(*) as count
-- FROM mcp_tool_telemetry
-- WHERE tool_name LIKE 'search_%'
-- GROUP BY search_query
-- ORDER BY count DESC;