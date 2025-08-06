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
  // Module-specific fields
  module_name?: string;
  package_code?: string;
  model_family?: string;
  category?: string;
  user_scenarios?: string[];
  related_concepts?: string[];
  pest_integration?: string[];
  use_cases?: string[];
  search_source?: 'documentation' | 'modules';
}

// Tool schema definition
export const semanticSearchSchema = {
  name: "semantic_search_repository",
  description: `
    **AI-POWERED CONCEPTUAL SEARCH** - Find content by meaning and concepts, not just keywords
    
    🎯 **When to use this tool:**
    - You're exploring a topic and don't know exact terms (e.g., "pumping water from aquifer")
    - Want conceptually similar content even with different wording
    - Looking for examples or implementations of an approach
    - Research phase: "What tools exist for X?" 
    
    📝 **Example queries:**
    - "pumping water" → finds WEL, MNW, injection wells (different terms, same concept)
    - "uncertain parameters" → finds calibration, PEST, ensemble methods
    - "groundwater boundaries" → finds RIV, GHB, DRN packages (related concepts)
    - "model calibration" → finds parameter estimation across FloPy/PyEMU
    
    🤖 **How it works:**
    - Uses OpenAI to understand query meaning 
    - Finds content with similar concepts (not just matching words)
    - Ranks by conceptual similarity (0-1 score)
    - Returns rich metadata: use cases, related concepts, examples
    
    📚 **What this searches:**
    - **MODFLOW Documentation**: Examples, theory, package descriptions
    - **FloPy Modules**: Organized by model family (MODFLOW 6, MODFLOW-2005, USG)
    - **PyEMU Modules**: Uncertainty analysis tools with PEST workflow integration
    
    🎛️ **Filter options:**
    - FloPy: Filter by package_code (WEL, RIV) or model_family (mf6, modflow)  
    - PyEMU: Filter by category (core, utils) for focused results
    
    💡 **Pro tip**: Start here for exploration and research. Use text_search when you know exact terms.
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
        description: 'Repository to search: Documentation (mfusg, pest, pestpp, pest_hp, mf6, plproc, gwutils) or Code modules (flopy, pyemu). If not specified, searches all repositories.',
      },
      filter: {
        type: 'object',
        description: 'Metadata filters (only for code repositories)',
        properties: {
          model_family: {
            type: 'string',
            description: 'FloPy model family filter (mf6, mfusg, etc.)'
          },
          package_code: {
            type: 'string', 
            description: 'FloPy package code filter (WEL, RIV, BCF, etc.)'
          },
          category: {
            type: 'string',
            description: 'PyEMU category filter (core, utils, etc.)'
          }
        }
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default: 10)',
      },
    },
    required: ['query'],
  }
};

// Tool implementation with real OpenAI embeddings
export async function semanticSearchTool(args: any, sql: NeonQueryFunction<false, false>, openaiApiKey?: string) {
  try {
    const { query, repository, limit = 10, filter = {} } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Search query is required and cannot be empty');
    }

    if (query.length > 500) {
      throw new Error('Search query too long. Please limit to 500 characters');
    }

    // Validate repository if specified
    const docRepos = ['mfusg', 'pest', 'pestpp', 'pest_hp', 'mf6', 'plproc', 'gwutils'];
    const codeRepos = ['flopy', 'pyemu'];
    const allRepos = [...docRepos, ...codeRepos];
    
    if (repository && !allRepos.includes(repository)) {
      throw new Error(`Invalid repository '${repository}'. Valid options: ${allRepos.join(', ')}`);
    }
    
    // Determine search strategy
    const isCodeRepo = repository && codeRepos.includes(repository);
    const isDocRepo = repository && docRepos.includes(repository);
    const searchAllRepos = !repository;

    console.log('[SEMANTIC SEARCH] Searching for:', query);
    console.log('[SEMANTIC SEARCH] Repository:', repository || 'all repos');
    console.log('[SEMANTIC SEARCH] Strategy:', isCodeRepo ? 'modules' : isDocRepo ? 'documentation' : 'hybrid');
    console.log('[SEMANTIC SEARCH] Filter:', filter);
    console.log('[SEMANTIC SEARCH] Limit:', limit);

    // Generate query embedding if OpenAI key is available
    let queryEmbedding: number[] | null = null;
    if (openaiApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: query,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          queryEmbedding = data.data[0].embedding;
          console.log('[SEMANTIC SEARCH] Generated embedding for query');
        } else {
          console.warn('[SEMANTIC SEARCH] Failed to generate embedding, falling back to text search');
        }
      } catch (error) {
        console.warn('[SEMANTIC SEARCH] OpenAI API error, falling back to text search:', error);
      }
    } else {
      console.warn('[SEMANTIC SEARCH] No OpenAI API key, falling back to text search');
    }

    // Execute search based on repository type
    let results: any[] = [];
    
    if (!queryEmbedding) {
      return {
        content: [{
          type: "text" as const,
          text: `Error: No OpenAI API key available. Semantic search requires embeddings to be generated.`
        }]
      };
    }

    // Use vector similarity search
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    if (isCodeRepo) {
      // Search code modules with embeddings
      results = await searchModulesWithEmbeddings(sql, repository, embeddingString, filter, limit);
    } else if (isDocRepo) {
      // Search documentation with embeddings
      results = await searchDocumentationWithEmbeddings(sql, repository, embeddingString, limit);
    } else {
      // Hybrid search with embeddings
      const docResults = await searchDocumentationWithEmbeddings(sql, null, embeddingString, Math.ceil(limit / 2));
      const moduleResults = await searchAllModulesWithEmbeddings(sql, embeddingString, filter, Math.floor(limit / 2));
      results = [...docResults, ...moduleResults].sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
    }

    if (!results || results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No results found for "${query}"${repository ? ` in ${repository}` : ''}`
        }]
      };
    }

    // Format results for output
    return formatSemanticSearchResults(results, query, repository, queryEmbedding !== null);

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}

// Helper functions for semantic search with embeddings
async function searchModulesWithEmbeddings(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  embeddingString: string,
  filter: any,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  // Build filter conditions
  let filterClause = '';
  const queryParams = [embeddingString];
  
  if (repository === 'flopy') {
    if (filter.model_family) {
      filterClause += ' AND LOWER(model_family) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.model_family);
    }
    if (filter.package_code) {
      filterClause += ' AND LOWER(package_code) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.package_code);
    }
  } else if (repository === 'pyemu') {
    if (filter.category) {
      filterClause += ' AND LOWER(category) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.category);
    }
  }
  
  // Execute search based on repository
  let results;
  if (repository === 'flopy') {
    const queryString = `
      SELECT 
        relative_path as filepath,
        '${repository}' as repo_name,
        'py' as file_type,
        module_name,
        package_code,
        model_family,
        semantic_purpose as title,
        semantic_purpose as summary,
        user_scenarios,
        related_concepts,
        1 - (embedding <=> $1::vector) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'modules' as search_source
      FROM flopy_modules
      WHERE embedding IS NOT NULL${filterClause}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  } else {
    const queryString = `
      SELECT 
        relative_path as filepath,
        '${repository}' as repo_name,
        'py' as file_type,
        module_name,
        NULL as package_code,
        NULL as model_family,
        category,
        semantic_purpose as title,
        semantic_purpose as summary,
        pest_integration,
        use_cases,
        1 - (embedding <=> $1::vector) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'modules' as search_source
      FROM pyemu_modules
      WHERE embedding IS NOT NULL${filterClause}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  }
  
  return Array.isArray(results) ? results : [];
}

async function searchDocumentationWithEmbeddings(
  sql: NeonQueryFunction<false, false>,
  repository: string | null,
  embeddingString: string,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  // Build conditions
  let whereClause = 'WHERE embedding IS NOT NULL';
  const queryParams = [embeddingString];
  
  if (repository) {
    whereClause += ' AND repo_name = $' + (queryParams.length + 1);
    queryParams.push(repository);
  } else {
    whereClause += " AND repo_name NOT IN ('flopy', 'pyemu')";
  }
  
  const queryString = `
    SELECT 
      filepath, 
      repo_name, 
      file_type, 
      created_at, 
      COALESCE(analysis->>'title', '') as title,
      COALESCE(analysis->>'summary', '') as summary,
      1 - (embedding <=> $1::vector) as similarity_score,
      CASE 
        WHEN length(content) > 300 THEN left(content, 300) || '...'
        ELSE content
      END as content_preview,
      'documentation' as search_source
    FROM repository_files
    ${whereClause}
    ORDER BY embedding <=> $1::vector
    LIMIT ${limit}
  `;
  
  const results = await sql.query(queryString, queryParams);
  
  return Array.isArray(results) ? results : [];
}

async function searchAllModulesWithEmbeddings(
  sql: NeonQueryFunction<false, false>,
  embeddingString: string,
  filter: any,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  const floepyResults = await searchModulesWithEmbeddings(sql, 'flopy', embeddingString, filter, Math.ceil(limit / 2));
  const pyemuResults = await searchModulesWithEmbeddings(sql, 'pyemu', embeddingString, filter, Math.floor(limit / 2));
  
  return [...floepyResults, ...pyemuResults]
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

// Text search fallback functions (reuse logic from text search tool)
function prepareTextSearchTerm(query: string): string {
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
  
  return searchTerm;
}

async function searchModulesWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  searchTerm: string,
  filter: any,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  // Build filter conditions
  let filterClause = '';
  const queryParams = [searchTerm];
  
  if (repository === 'flopy') {
    if (filter.model_family) {
      filterClause += ' AND LOWER(model_family) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.model_family);
    }
    if (filter.package_code) {
      filterClause += ' AND LOWER(package_code) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.package_code);
    }
  } else if (repository === 'pyemu') {
    if (filter.category) {
      filterClause += ' AND LOWER(category) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.category);
    }
  }
  
  let results;
  if (repository === 'flopy') {
    const queryString = `
      SELECT 
        relative_path as filepath,
        '${repository}' as repo_name,
        'py' as file_type,
        module_name,
        package_code,
        model_family,
        semantic_purpose as title,
        semantic_purpose as summary,
        user_scenarios,
        related_concepts,
        ts_rank_cd(search_vector, to_tsquery('english', $1)) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'modules' as search_source
      FROM flopy_modules
      WHERE search_vector @@ to_tsquery('english', $1)${filterClause}
      ORDER BY similarity_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  } else {
    const queryString = `
      SELECT 
        relative_path as filepath,
        '${repository}' as repo_name,
        'py' as file_type,
        module_name,
        NULL as package_code,
        NULL as model_family,
        category,
        semantic_purpose as title,
        semantic_purpose as summary,
        pest_integration,
        use_cases,
        ts_rank_cd(search_vector, to_tsquery('english', $1)) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'modules' as search_source
      FROM pyemu_modules
      WHERE search_vector @@ to_tsquery('english', $1)${filterClause}
      ORDER BY similarity_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  }
  
  return Array.isArray(results) ? results : [];
}

async function searchDocumentationWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string | null,
  searchTerm: string,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  // Build conditions
  let whereClause = `WHERE (
      COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
      setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
      setweight(to_tsvector('english', COALESCE(content, '')), 'C')
    ) @@ to_tsquery('english', $1)`;
  const queryParams = [searchTerm];
  
  if (repository) {
    whereClause += ' AND repo_name = $' + (queryParams.length + 1);
    queryParams.push(repository);
  } else {
    whereClause += " AND repo_name NOT IN ('flopy', 'pyemu')";
  }
  
  const queryString = `
    SELECT 
      filepath, 
      repo_name, 
      file_type, 
      created_at, 
      COALESCE(analysis->>'title', '') as title,
      COALESCE(analysis->>'summary', '') as summary,
      ts_rank(
        COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
        setweight(to_tsvector('english', COALESCE(analysis->>'summary', '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
        to_tsquery('english', $1)
      ) as similarity_score,
      CASE 
        WHEN length(content) > 300 THEN left(content, 300) || '...'
        ELSE content
      END as content_preview,
      'documentation' as search_source
    FROM repository_files
    ${whereClause}
    ORDER BY similarity_score DESC, created_at DESC 
    LIMIT ${limit}
  `;
  
  const results = await sql.query(queryString, queryParams);
  
  return Array.isArray(results) ? results : [];
}

async function searchAllModulesWithText(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  filter: any,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  const floepyResults = await searchModulesWithText(sql, 'flopy', searchTerm, filter, Math.ceil(limit / 2));
  const pyemuResults = await searchModulesWithText(sql, 'pyemu', searchTerm, filter, Math.floor(limit / 2));
  
  return [...floepyResults, ...pyemuResults]
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, limit);
}

// Format results for MCP output
function formatSemanticSearchResults(
  results: SemanticSearchResultItem[],
  query: string,
  repository?: string,
  usedEmbeddings: boolean = false
) {
  const resultsArray = Array.isArray(results) ? results : [];
  
  // Calculate statistics
  const uniqueRepos = [...new Set(resultsArray.map((r: any) => r.repo_name))];
  const uniqueTypes = [...new Set(resultsArray.map((r: any) => r.file_type).filter(Boolean))];
  const avgSimilarity = resultsArray.length > 0 
    ? resultsArray.reduce((sum: number, r: any) => sum + r.similarity_score, 0) / resultsArray.length
    : 0;

  const moduleCount = resultsArray.filter((r: any) => r.search_source === 'modules').length;
  const docCount = resultsArray.filter((r: any) => r.search_source === 'documentation').length;

  // Format output for MCP
  let outputText = `Found ${resultsArray.length} semantic result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
  if (repository) outputText += ` in ${repository}`;
  outputText += `\n\n`;

  outputText += `Summary:\n`;
  outputText += `- Average similarity: ${avgSimilarity.toFixed(3)}\n`;
  outputText += `- Sources: ${docCount} docs, ${moduleCount} modules\n`;
  outputText += `- Repositories: ${uniqueRepos.join(', ')}\n`;
  if (uniqueTypes.length > 0) {
    outputText += `- File types: ${uniqueTypes.join(', ')}\n`;
  }
  outputText += `- Search method: vector_similarity\n\n`;

  outputText += `Results:\n`;
  resultsArray.forEach((result: any, index: number) => {
    outputText += `${index + 1}. **${result.filepath}** (${result.repo_name}${result.search_source ? ` - ${result.search_source}` : ''})\n`;
    
    // Module-specific metadata
    if (result.module_name) {
      outputText += `   Module: ${result.module_name}\n`;
    }
    if (result.package_code) {
      outputText += `   Package: ${result.package_code}\n`;
    }
    if (result.model_family) {
      outputText += `   Model Family: ${result.model_family}\n`;
    }
    if (result.category) {
      outputText += `   Category: ${result.category}\n`;
    }
    
    // Standard fields
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
    
    // Rich metadata arrays
    if (result.user_scenarios && result.user_scenarios.length > 0) {
      outputText += `   Use Cases: ${result.user_scenarios.slice(0, 2).join(', ')}${result.user_scenarios.length > 2 ? '...' : ''}\n`;
    }
    if (result.related_concepts && result.related_concepts.length > 0) {
      outputText += `   Concepts: ${result.related_concepts.slice(0, 3).join(', ')}${result.related_concepts.length > 3 ? '...' : ''}\n`;
    }
    if (result.pest_integration && result.pest_integration.length > 0) {
      outputText += `   PEST: ${result.pest_integration.slice(0, 2).join(', ')}${result.pest_integration.length > 2 ? '...' : ''}\n`;
    }
    if (result.use_cases && result.use_cases.length > 0) {
      outputText += `   Applications: ${result.use_cases.slice(0, 2).join(', ')}${result.use_cases.length > 2 ? '...' : ''}\n`;
    }
    
    outputText += `\n`;
  });


  return {
    content: [{
      type: "text" as const,
      text: outputText
    }]
  };
}