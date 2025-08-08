-- Add output tracking columns to telemetry table
-- This intelligently captures tool outputs while avoiding large payloads

-- Add new columns for output tracking
ALTER TABLE mcp_tool_telemetry
ADD COLUMN IF NOT EXISTS output_summary JSONB,
ADD COLUMN IF NOT EXISTS output_size_bytes INTEGER,
ADD COLUMN IF NOT EXISTS result_count INTEGER,
ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_telemetry_success ON mcp_tool_telemetry(success);
CREATE INDEX IF NOT EXISTS idx_telemetry_result_count ON mcp_tool_telemetry(result_count);
CREATE INDEX IF NOT EXISTS idx_telemetry_tool_success ON mcp_tool_telemetry(tool_name, success);

-- Comment on new columns
COMMENT ON COLUMN mcp_tool_telemetry.output_summary IS 'Intelligent summary of tool output - varies by tool type';
COMMENT ON COLUMN mcp_tool_telemetry.output_size_bytes IS 'Total size of the output in bytes';
COMMENT ON COLUMN mcp_tool_telemetry.result_count IS 'Number of results returned (for search tools)';
COMMENT ON COLUMN mcp_tool_telemetry.success IS 'Whether the tool executed successfully';
COMMENT ON COLUMN mcp_tool_telemetry.error_message IS 'Error message if tool failed';

-- Examples of what output_summary might contain per tool:
-- 
-- search_docs, search_code, search_examples:
-- {
--   "results_found": 10,
--   "top_result": "filename.py",
--   "top_relevance": 0.95,
--   "repositories": ["flopy", "pyemu"],
--   "search_method": "text" | "semantic" | "hybrid",
--   "avg_relevance": 0.78
-- }
--
-- get_file_content:
-- {
--   "repository": "flopy",
--   "filepath": "path/to/file.py",
--   "file_type": "py",
--   "total_size": 42750,
--   "page_requested": 1,
--   "total_pages": 2,
--   "content_truncated": false
-- }
--
-- semantic_search_docs, semantic_search_tutorials:
-- {
--   "results_found": 5,
--   "similarity_threshold": 0.7,
--   "top_similarity": 0.92,
--   "avg_similarity": 0.81,
--   "filter_applied": true
-- }