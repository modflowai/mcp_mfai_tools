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
  // Workflow-specific fields
  model_type?: string;
  workflow_type?: string;
  complexity?: string;
  packages_used?: string[];
  tags?: string[];
  workflow_purpose?: string;
  best_use_cases?: string[];
  prerequisites?: string[];
  pest_concepts?: string[];
  uncertainty_methods?: string[];
  pyemu_modules?: string[];
  search_source?: 'documentation' | 'modules' | 'workflows';
}

// Tool schema definition
export const semanticSearchDocsSchema = {
  name: "semantic_search_docs",
  description: 'AI-powered semantic search using OpenAI embeddings to find conceptually related content across MODFLOW/PEST repositories. Understands query meaning and finds similar concepts even with different terminology. Searches documentation (MODFLOW 6, PEST, MODFLOW-USG), code modules (FloPy, PyEMU), and workflow tutorials/examples with vector similarity ranking. Supports filtering by model_family, package_code, category, workflow_type, or complexity. Use for conceptual questions, "how to" queries, and exploratory research. Examples: "pumping water from aquifer", "model calibration workflow", "uncertainty analysis", "time-varying boundary conditions". For exact keyword matching, use search_docs instead.',
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
export async function semanticSearchDocs(args: any, sql: NeonQueryFunction<false, false>, openaiApiKey?: string) {
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
          text: `Error: Failed to generate embeddings for semantic search. Please ensure OpenAI API key is configured and valid.`
        }]
      };
    }

    // Use vector similarity search
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    if (isCodeRepo) {
      // Search code modules and workflows with embeddings
      const moduleResults = await searchModulesWithEmbeddings(sql, repository, embeddingString, filter, Math.ceil(limit / 2));
      const workflowResults = await searchWorkflowsWithEmbeddings(sql, repository, embeddingString, filter, Math.floor(limit / 2));
      results = [...moduleResults, ...workflowResults].sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
    } else if (isDocRepo) {
      // Search documentation with embeddings
      results = await searchDocumentationWithEmbeddings(sql, repository, embeddingString, limit);
    } else {
      // Hybrid search with embeddings - docs, modules, and workflows
      const docResults = await searchDocumentationWithEmbeddings(sql, null, embeddingString, Math.ceil(limit / 3));
      const moduleResults = await searchAllModulesWithEmbeddings(sql, embeddingString, filter, Math.ceil(limit / 3));
      const workflowResults = await searchAllWorkflowsWithEmbeddings(sql, embeddingString, filter, Math.floor(limit / 3));
      results = [...docResults, ...moduleResults, ...workflowResults].sort((a, b) => b.similarity_score - a.similarity_score).slice(0, limit);
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

// Note: Text search fallback has been intentionally removed.
// Semantic search should always use embeddings for accurate results.
// If embeddings are not available, an error is returned to maintain search quality.

// Helper functions for workflow search with embeddings
async function searchWorkflowsWithEmbeddings(
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
    if (filter.model_type) {
      filterClause += ' AND LOWER(model_type) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.model_type);
    }
    if (filter.complexity) {
      filterClause += ' AND LOWER(complexity) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.complexity);
    }
  } else if (repository === 'pyemu') {
    if (filter.workflow_type) {
      filterClause += ' AND LOWER(workflow_type) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.workflow_type);
    }
    if (filter.complexity) {
      filterClause += ' AND LOWER(complexity) = LOWER($' + (queryParams.length + 1) + ')';
      queryParams.push(filter.complexity);
    }
  }
  
  // Execute search based on repository
  let results;
  if (repository === 'flopy') {
    const queryString = `
      SELECT 
        tutorial_file as filepath,
        '${repository}' as repo_name,
        'py' as file_type,
        title,
        description,
        model_type,
        complexity,
        packages_used,
        tags,
        workflow_purpose,
        best_use_cases,
        prerequisites,
        1 - (embedding <=> $1::vector) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'workflows' as search_source
      FROM flopy_workflows
      WHERE embedding IS NOT NULL${filterClause}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  } else {
    const queryString = `
      SELECT 
        notebook_file as filepath,
        '${repository}' as repo_name,
        'ipynb' as file_type,
        title,
        description,
        workflow_type,
        complexity,
        pest_concepts,
        uncertainty_methods,
        pyemu_modules,
        tags,
        workflow_purpose,
        common_applications as best_use_cases,
        prerequisites,
        1 - (embedding <=> $1::vector) as similarity_score,
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        'workflows' as search_source
      FROM pyemu_workflows
      WHERE embedding IS NOT NULL${filterClause}
      ORDER BY embedding <=> $1::vector
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, queryParams);
  }
  
  return Array.isArray(results) ? results : [];
}

async function searchAllWorkflowsWithEmbeddings(
  sql: NeonQueryFunction<false, false>,
  embeddingString: string,
  filter: any,
  limit: number
): Promise<SemanticSearchResultItem[]> {
  const floepyResults = await searchWorkflowsWithEmbeddings(sql, 'flopy', embeddingString, filter, Math.ceil(limit / 2));
  const pyemuResults = await searchWorkflowsWithEmbeddings(sql, 'pyemu', embeddingString, filter, Math.floor(limit / 2));
  
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
  const workflowCount = resultsArray.filter((r: any) => r.search_source === 'workflows').length;

  // Format output for MCP
  let outputText = `Found ${resultsArray.length} semantic result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
  if (repository) outputText += ` in ${repository}`;
  outputText += `\n\n`;

  outputText += `Summary:\n`;
  outputText += `- Average similarity: ${avgSimilarity.toFixed(3)}\n`;
  outputText += `- Sources: ${docCount} docs, ${moduleCount} modules, ${workflowCount} workflows\n`;
  outputText += `- Repositories: ${uniqueRepos.join(', ')}\n`;
  if (uniqueTypes.length > 0) {
    outputText += `- File types: ${uniqueTypes.join(', ')}\n`;
  }
  outputText += `- Search method: ${usedEmbeddings ? 'vector_similarity (OpenAI embeddings)' : 'text_fallback (full-text search)'}\n\n`;

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
    
    // Workflow-specific metadata
    if (result.model_type) {
      outputText += `   Model Type: ${result.model_type}\n`;
    }
    if (result.workflow_type) {
      outputText += `   Workflow Type: ${result.workflow_type}\n`;
    }
    if (result.complexity) {
      outputText += `   Complexity: ${result.complexity}\n`;
    }
    if (result.packages_used && result.packages_used.length > 0) {
      outputText += `   Packages: ${result.packages_used.slice(0, 5).join(', ')}${result.packages_used.length > 5 ? '...' : ''}\n`;
    }
    if (result.tags && result.tags.length > 0) {
      outputText += `   Tags: ${result.tags.slice(0, 5).join(', ')}${result.tags.length > 5 ? '...' : ''}\n`;
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


  // Add important reminder about using get_file_content
  outputText += `\n📋 **IMPORTANT REMINDER**: These are only previews and snippets. For complete, accurate file content without truncation or potential hallucinations, always use the \`get_file_content\` tool with the exact filepath shown above. This ensures you get the full, unmodified source code or documentation.\n`;

  return {
    content: [{
      type: "text" as const,
      text: outputText
    }]
  };
}