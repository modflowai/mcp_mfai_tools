/**
 * Text Search Tool
 * Advanced full-text search across MODFLOW/PEST documentation repositories
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import acronymMappings from './acronym-mappings.json';

interface SearchResultItem {
  filepath: string;
  repo_name: string;
  file_type: string;
  relevance_score: number;
  title?: string;
  content_snippet?: string;
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
export const textSearchSchema = {
  name: "text_search_repository",
  description: 'Full-text search across MODFLOW/PEST repositories for exact keywords and phrases. Searches documentation (MODFLOW 6, PEST, MODFLOW-USG) and code modules (FloPy, PyEMU). Supports Boolean operators (AND/OR/NOT), wildcards (*), phrase search, and acronym expansion. Returns relevance-ranked results with highlighted snippets. Use for specific technical terms, parameter names, package codes. Examples: "WEL package", "hydraulic conductivity", "BCF OR LPF", "NOPTMAX". For conceptual searches, use semantic_search_repository instead.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Your search terms. Use quotes for exact phrases, * for wildcards, AND/OR for boolean logic',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: Documentation (mfusg, pest, pestpp, pest_hp, mf6, plproc, gwutils) or Code modules (flopy, pyemu). If not specified, searches all repositories.',
      },
      file_type: {
        type: 'string',
        description: 'Filter by file type (py, f90, f, md, txt, etc.). If not specified, searches all file types.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-50, default: 15)',
      },
      include_content: {
        type: 'boolean',
        description: 'Include file content snippets in results (default: true). Set to false for faster results with just file paths.',
      },
    },
    required: ['query'],
  }
};

// Tool implementation
export async function textSearchTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    console.log('[TEXT SEARCH] Starting text search with args:', args);
    const { query, repository, file_type, limit = 15, include_content = true } = args;

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
      throw new Error(`Invalid repository '${repository}'. Valid repositories: ${allRepos.join(', ')}`);
    }
    
    // Determine search strategy
    const isCodeRepo = repository && codeRepos.includes(repository);
    const isDocRepo = repository && docRepos.includes(repository);
    const searchAllRepos = !repository;

    // Prepare search query - convert to PostgreSQL full-text search format  
    let searchTerm = query.trim();
    
    // Expand acronyms in the search query
    const expandedTerms: string[] = [];
    const words = searchTerm.split(/\s+/);
    let hasAcronymExpansion = false;
    
    for (const word of words) {
      const upperWord = word.toUpperCase();
      if (acronymMappings[upperWord]) {
        const mapping = acronymMappings[upperWord];
        // For tsquery, we need to format it properly
        const fullTerms = mapping.full.toLowerCase().split(/\s+/).join('<->');
        expandedTerms.push(`(${word} | ${fullTerms})`);
        hasAcronymExpansion = true;
      } else {
        expandedTerms.push(word);
      }
    }
    
    // If we expanded any acronyms, use the expanded query
    if (hasAcronymExpansion) {
      searchTerm = expandedTerms.join(' & ');
    } else {
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
    }

    console.log('[TEXT SEARCH] Searching for:', searchTerm);
    console.log('[TEXT SEARCH] Repository:', repository || 'all documentation repos');
    console.log('[TEXT SEARCH] File type:', file_type || 'all types');
    console.log('[TEXT SEARCH] Include content:', include_content);
    console.log('[TEXT SEARCH] Limit:', limit);
    
    // Execute search - simplified approach using tagged template literals
    let results;
    
    console.log('[TEXT SEARCH] About to execute SQL query');
    console.log('[TEXT SEARCH] Strategy:', isCodeRepo ? 'modules' : isDocRepo ? 'documentation' : 'hybrid');
    
    // Execute search based on repository type
    if (isCodeRepo) {
      // Search code modules
      results = await searchModulesWithText(sql, repository, searchTerm, limit, include_content);
    } else if (isDocRepo) {
      // Search specific documentation repository
      results = await searchDocumentationWithText(sql, repository, searchTerm, file_type, limit, include_content);
    } else if (searchAllRepos) {
      // Hybrid search - both docs and modules
      const docResults = await searchDocumentationWithText(sql, null, searchTerm, file_type, Math.ceil(limit / 2), include_content);
      const moduleResults = await searchAllModulesWithText(sql, searchTerm, Math.floor(limit / 2), include_content);
      results = [...docResults, ...moduleResults].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, limit);
    } else {
      // Fallback to original logic for edge cases
      results = await searchDocumentationWithText(sql, repository, searchTerm, file_type, limit, include_content);
    }
    
    console.log('[TEXT SEARCH] SQL query completed, results:', results?.length || 0);

    if (!results || (Array.isArray(results) && results.length === 0)) {
      return {
        content: [{
          type: "text" as const,
          text: `No results found for "${query}"${repository ? ` in ${repository}` : ''}`
        }]
      };
    }

    // Format results
    const resultsArray = Array.isArray(results) ? results : [];
    
    // Calculate statistics
    const uniqueRepos = [...new Set(resultsArray.map((r: any) => r.repo_name))];
    const uniqueTypes = [...new Set(resultsArray.map((r: any) => r.file_type).filter(Boolean))];
    const avgRelevance = resultsArray.length > 0 
      ? resultsArray.reduce((sum: number, r: any) => sum + r.relevance_score, 0) / resultsArray.length
      : 0;

    const moduleCount = resultsArray.filter((r: any) => r.search_source === 'modules').length;
    const docCount = resultsArray.filter((r: any) => r.search_source === 'documentation').length;

    // Format output for MCP
    let outputText = `Found ${resultsArray.length} result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
    if (repository) outputText += ` in ${repository}`;
    outputText += `\n\n`;

    outputText += `Summary:\n`;
    outputText += `- Average relevance: ${avgRelevance.toFixed(3)}\n`;
    outputText += `- Sources: ${docCount} docs, ${moduleCount} modules\n`;
    outputText += `- Repositories: ${uniqueRepos.join(', ')}\n`;
    if (uniqueTypes.length > 0) {
      outputText += `- File types: ${uniqueTypes.join(', ')}\n`;
    }
    outputText += `\n`;

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
      outputText += `   Relevance: ${result.relevance_score.toFixed(3)}\n`;
      if (result.content_snippet) {
        outputText += `   Snippet: ${result.content_snippet}\n`;
      }
      
      outputText += `\n`;
    });

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

// Helper functions for module search
async function searchModulesWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  searchTerm: string,
  limit: number,
  include_content: boolean
): Promise<SearchResultItem[]> {
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
        ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(semantic_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          to_tsquery('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'modules' as search_source
      FROM flopy_modules
      WHERE search_vector @@ to_tsquery('english', $1)
      ORDER BY relevance_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, [searchTerm]);
  } else {
    // PyEMU
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
        ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(semantic_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          to_tsquery('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'modules' as search_source
      FROM pyemu_modules
      WHERE search_vector @@ to_tsquery('english', $1)
      ORDER BY relevance_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, [searchTerm]);
  }
  
  return Array.isArray(results) ? results as SearchResultItem[] : [];
}

async function searchDocumentationWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string | null,
  searchTerm: string,
  file_type: string | undefined,
  limit: number,
  include_content: boolean
): Promise<SearchResultItem[]> {
  // Build conditions
  let whereClause = `WHERE (
    COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
    setweight(to_tsvector('english', COALESCE(content, '')), 'C')
  ) @@ to_tsquery('english', $1)`;
  const queryParams = [searchTerm];
  
  if (repository) {
    whereClause += ' AND repo_name = $' + (queryParams.length + 1);
    queryParams.push(repository);
  } else {
    whereClause += " AND repo_name NOT IN ('flopy', 'pyemu')";
  }
  
  if (file_type) {
    whereClause += ' AND file_type = $' + (queryParams.length + 1);
    queryParams.push(file_type);
  }
  
  const queryString = `
    SELECT 
      filepath, 
      repo_name, 
      file_type, 
      created_at, 
      COALESCE(analysis->>'title', '') as title,
      ts_rank(
        COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
        setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
        to_tsquery('english', $1)
      ) as relevance_score,
      ${include_content ? `
      ts_headline('english', 
        COALESCE(analysis->>'title', '') || ' ' || COALESCE(content, ''), 
        to_tsquery('english', $1), 
        'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
      ) as content_snippet,
      CASE 
        WHEN length(content) > 300 THEN left(content, 300) || '...'
        ELSE content
      END as content_preview
      ` : `
      null as content_snippet,
      null as content_preview
      `},
      'documentation' as search_source
    FROM repository_files
    ${whereClause}
    ORDER BY relevance_score DESC, created_at DESC 
    LIMIT ${limit}
  `;
  
  const results = await sql.query(queryString, queryParams);
  return Array.isArray(results) ? results as SearchResultItem[] : [];
}

async function searchAllModulesWithText(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  limit: number,
  include_content: boolean
): Promise<SearchResultItem[]> {
  const floepyResults = await searchModulesWithText(sql, 'flopy', searchTerm, Math.ceil(limit / 2), include_content);
  const pyemuResults = await searchModulesWithText(sql, 'pyemu', searchTerm, Math.floor(limit / 2), include_content);
  
  return [...floepyResults, ...pyemuResults]
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}