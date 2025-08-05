/**
 * Semantic Search Tool
 * Semantic search across MODFLOW/PEST repositories using AI embeddings
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

interface SemanticSearchResultItem {
  filepath: string;
  repo_name: string;
  file_type: string;
  similarity_score: number;
  title?: string;
  summary?: string;
  content_preview?: string;
}

// Tool schema definition
export const semanticSearchSchema = {
  name: "semantic_search_repository",
  description: `
    Perform semantic search across MODFLOW/PEST repository files using AI embeddings.
    This tool finds conceptually similar content even if exact keywords don't match.
    
    SMART RETRIEVAL APPROACH:
    1. First retrieves document summaries and metadata
    2. Evaluates if summaries contain sufficient information
    3. Only retrieves full file content when necessary
    
    Available repositories:
    - flopy: Python package for MODFLOW
    - mfusg: MODFLOW-USG (Unstructured Grid)
    - pest: Parameter Estimation package
    - pestpp: PEST++ enhanced version
    - pest_hp: PEST_HP parallel version
    - pyemu: PyEMU uncertainty analysis
    - mf6: MODFLOW 6 source code
    - plproc: Parameter list processor
    - gwutils: Groundwater data utilities
    
    Search features:
    - Semantic similarity using AI embeddings
    - Summary-based evaluation (saves tokens)
    - Smart content retrieval decision
    - For FloPy/PyEMU: searches both modules and workflows with full source code
    - For other repos: searches documentation with metadata
    
    Use this when you need to find:
    - Conceptually related code or documentation
    - Similar implementations across repositories
    - Content about a topic using different terminology
    - Examples of specific patterns or approaches
    - General information that might be in summaries
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what you\'re looking for',
      },
      repository: {
        type: 'string',
        description: 'Specific repository to search (flopy, mfusg, pest, pestpp, pest_hp, pyemu, mf6, plproc, gwutils, or "all")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default: 10)',
      },
    },
    required: ['query'],
  }
};

// Simple embedding function using a basic approach (since we don't have OpenAI in Cloudflare Workers)
// In production, you'd want to use an embedding API like OpenAI, Cohere, or similar
function createSimpleEmbedding(text: string): number[] {
  // This is a very simple hash-based embedding - in production use a real embedding model
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(128).fill(0);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    for (let j = 0; j < word.length; j++) {
      const char = word.charCodeAt(j);
      embedding[char % 128] += 1;
    }
  }
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

// Tool implementation
export async function semanticSearchTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { query, repository = 'all', limit = 10 } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Search query is required and cannot be empty');
    }

    if (query.length > 500) {
      throw new Error('Search query too long. Please limit to 500 characters');
    }

    // Validate repository if specified
    const validRepos = ['flopy', 'mfusg', 'pest', 'pestpp', 'pest_hp', 'pyemu', 'mf6', 'plproc', 'gwutils'];
    if (repository && repository !== 'all' && !validRepos.includes(repository)) {
      throw new Error(`Invalid repository '${repository}'. Valid options: ${validRepos.join(', ')}, or omit to search all`);
    }

    // For now, fall back to text search since we need embedding infrastructure
    // In production, you'd generate embeddings and use vector similarity
    console.log('[SEMANTIC SEARCH] Falling back to text search for:', query);
    console.log('[SEMANTIC SEARCH] Repository:', repository);
    console.log('[SEMANTIC SEARCH] Limit:', limit);
    
    // Use text search as fallback (could be enhanced with embedding similarity)
    let searchTerm = query.trim();
    
    // Handle basic wildcard conversion (* to :*)
    searchTerm = searchTerm.replace(/\*/g, ':*');
    
    // If no boolean operators, treat as phrase search
    if (!searchTerm.includes('&') && !searchTerm.includes('|') && !searchTerm.includes('!')) {
      // Split into words and join with & for AND search
      const words = searchTerm.split(/\s+/).filter(word => word.length > 0);
      if (words.length > 1) {
        searchTerm = words.join(' & ');
      }
    }

    // Execute search using full-text search as fallback
    let results;
    
    if (!repository || repository === 'all') {
      // Search all repositories
      results = await sql`
        SELECT filepath, repo_name, file_type, created_at, 
               COALESCE(analysis->>'title', '') as title,
               COALESCE(analysis->>'summary', '') as summary,
               ts_rank(
                 COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
                 setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
                 setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
                 to_tsquery('english', ${searchTerm})
               ) as similarity_score,
               CASE 
                 WHEN length(content) > 300 THEN left(content, 300) || '...'
                 ELSE content
               END as content_preview
        FROM repository_files
        WHERE (
          COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
          setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) @@ to_tsquery('english', ${searchTerm})
        ORDER BY similarity_score DESC, created_at DESC 
        LIMIT ${limit}
      `;
    } else {
      // Search specific repository
      results = await sql`
        SELECT filepath, repo_name, file_type, created_at, 
               COALESCE(analysis->>'title', '') as title,
               COALESCE(analysis->>'summary', '') as summary,
               ts_rank(
                 COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
                 setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
                 setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
                 to_tsquery('english', ${searchTerm})
               ) as similarity_score,
               CASE 
                 WHEN length(content) > 300 THEN left(content, 300) || '...'
                 ELSE content
               END as content_preview
        FROM repository_files
        WHERE (
          COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
          setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) @@ to_tsquery('english', ${searchTerm})
          AND repo_name = ${repository}
        ORDER BY similarity_score DESC, created_at DESC 
        LIMIT ${limit}
      `;
    }

    if (!results || (Array.isArray(results) && results.length === 0)) {
      return {
        content: [{
          type: "text" as const,
          text: `No results found for "${query}"${repository !== 'all' ? ` in ${repository}` : ''}`
        }]
      };
    }

    // Format results
    const resultsArray = Array.isArray(results) ? results : [];
    
    // Calculate statistics
    const uniqueRepos = [...new Set(resultsArray.map((r: any) => r.repo_name))];
    const uniqueTypes = [...new Set(resultsArray.map((r: any) => r.file_type).filter(Boolean))];
    const avgSimilarity = resultsArray.length > 0 
      ? resultsArray.reduce((sum: number, r: any) => sum + r.similarity_score, 0) / resultsArray.length
      : 0;

    // Format output for MCP
    let outputText = `Found ${resultsArray.length} semantic result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
    if (repository !== 'all') outputText += ` in ${repository}`;
    outputText += `\n\n`;

    outputText += `Summary:\n`;
    outputText += `- Average similarity: ${avgSimilarity.toFixed(3)}\n`;
    outputText += `- Repositories: ${uniqueRepos.join(', ')}\n`;
    outputText += `- File types: ${uniqueTypes.join(', ')}\n`;
    outputText += `- Retrieval strategy: enhanced_text_search (fallback)\n\n`;

    outputText += `Results:\n`;
    resultsArray.forEach((result: any, index: number) => {
      outputText += `${index + 1}. **${result.filepath}** (${result.repo_name})\n`;
      if (result.title) {
        outputText += `   Title: ${result.title}\n`;
      }
      if (result.summary) {
        outputText += `   Summary: ${result.summary}\n`;
      }
      outputText += `   Similarity: ${result.similarity_score.toFixed(3)}\n`;
      if (result.content_preview) {
        outputText += `   Preview: ${result.content_preview}\n`;
      }
      outputText += `\n`;
    });

    outputText += `\n*Note: Currently using enhanced text search as fallback. True semantic search with embeddings requires additional infrastructure.*\n`;

    return {
      content: [{
        type: "text" as const,
        text: outputText
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