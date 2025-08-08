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
export const searchDocsSchema = {
  name: "search_docs",
  description: 'Full-text search across MODFLOW/PEST documentation for exact keywords and phrases. Searches documentation (MODFLOW AI, MODFLOW 6, MODFLOW-USG, PEST, PEST++, PEST_HP, PLPROC, gwutils) and code modules (FloPy, PyEMU). Supports Boolean operators (AND/OR/NOT), wildcards (*), phrase search, and acronym expansion. Returns relevance-ranked results with highlighted snippets and rich metadata (packages, complexity, tags). Use for specific technical terms, parameter names, package codes, workflow types. Examples: "what is modflow ai", "WEL package", "hydraulic conductivity", "parameter estimation", "time series". For conceptual searches, use semantic_search_docs instead.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Your search terms. Use quotes for exact phrases, * for wildcards, AND/OR for boolean logic',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: Documentation (modflowai, mf6, mfusg, pest, pestpp, pest_hp, plproc, gwutils) or Code modules (flopy, pyemu). If not specified, searches all repositories.',
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
export async function searchDocs(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    console.log('[SEARCH DOCS] Starting documentation search with args:', args);
    
    // Parse boolean values that might come as strings from MCP
    const parseBool = (value: any, defaultValue: boolean): boolean => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.toLowerCase() === 'false') return false;
        if (value.toLowerCase() === 'true') return true;
      }
      return defaultValue;
    };
    
    const { query, repository, file_type, limit = 15 } = args;
    const include_content = parseBool(args.include_content, true);
    
    console.log(`[SEARCH DOCS] After parsing: include_content=${include_content}, type=${typeof include_content}, original=${args.include_content}, original type=${typeof args.include_content}`);

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Search query is required and cannot be empty');
    }

    if (query.length > 500) {
      throw new Error('Search query too long. Please limit to 500 characters');
    }

    // Validate repository if specified
    const docRepos = ['modflowai', 'mfusg', 'pest', 'pestpp', 'pest_hp', 'mf6', 'plproc', 'gwutils'];
    const codeRepos = ['flopy', 'pyemu'];
    const allRepos = [...docRepos, ...codeRepos];
    
    if (repository && !allRepos.includes(repository)) {
      throw new Error(`Invalid repository '${repository}'. Valid repositories: ${allRepos.join(', ')}`);
    }
    
    // Determine search strategy
    const isCodeRepo = repository && codeRepos.includes(repository);
    const isDocRepo = repository && docRepos.includes(repository);
    const searchAllRepos = !repository;

    // Prepare search query - use plainto_tsquery for simple queries, to_tsquery for advanced
    let searchTerm = query.trim();
    let useAdvancedQuery = false;
    
    // Check if this is an advanced query that needs to_tsquery
    const hasAdvancedOperators = searchTerm.includes('&') || searchTerm.includes('|') || 
                                searchTerm.includes('!') || searchTerm.includes('*') || 
                                searchTerm.includes('"');
    
    // Expand acronyms in the search query
    const expandedTerms: string[] = [];
    const words = searchTerm.split(/\s+/);
    let hasAcronymExpansion = false;
    
    for (const word of words) {
      const upperWord = word.toUpperCase();
      if ((acronymMappings as any)[upperWord]) {
        const mapping = (acronymMappings as any)[upperWord];
        console.log(`[SEARCH DOCS] Expanding acronym: ${word} -> ${mapping.full}`);
        if (hasAdvancedOperators) {
          // For to_tsquery, we need to format it properly
          const fullTerms = mapping.full.toLowerCase().split(/\s+/).join('<->');
          expandedTerms.push(`(${word} | ${fullTerms})`);
        } else {
          // For plainto_tsquery, include both the acronym and its expansion
          expandedTerms.push(`${word} ${mapping.full}`);
        }
        hasAcronymExpansion = true;
      } else {
        expandedTerms.push(word);
      }
    }
    
    if (hasAdvancedOperators) {
      useAdvancedQuery = true;
      // Handle wildcards for advanced queries
      searchTerm = searchTerm.replace(/\*/g, ':*');
      console.log('[SEARCH DOCS] Using advanced query:', searchTerm);
    } else if (hasAcronymExpansion) {
      // For acronym expansion, use simple natural language with plainto_tsquery
      searchTerm = expandedTerms.join(' ');
      console.log('[SEARCH DOCS] Using simple plainto_tsquery with acronym expansion for:', searchTerm);
    } else {
      // Simple query - let plainto_tsquery handle it
      console.log('[SEARCH DOCS] Using simple plainto_tsquery for:', searchTerm);
    }

    console.log('[SEARCH DOCS] Searching for:', searchTerm);
    console.log('[SEARCH DOCS] Repository:', repository || 'all documentation repos');
    console.log('[SEARCH DOCS] File type:', file_type || 'all types');
    console.log(`[SEARCH DOCS] Include content: ${include_content} (type: ${typeof include_content})`);
    console.log('[SEARCH DOCS] Limit:', limit);
    
    // Execute search - simplified approach using tagged template literals
    let results;
    
    console.log('[SEARCH DOCS] About to execute SQL query');
    console.log('[SEARCH DOCS] Strategy:', isCodeRepo ? 'modules' : isDocRepo ? 'documentation' : 'hybrid');
    
    // Execute search based on repository type
    if (isCodeRepo) {
      // Search code modules and workflows
      const moduleResults = await searchModulesWithText(sql, repository, searchTerm, Math.ceil(limit / 2), include_content, useAdvancedQuery);
      const workflowResults = await searchWorkflowsWithText(sql, repository, searchTerm, Math.floor(limit / 2), include_content, useAdvancedQuery);
      results = [...moduleResults, ...workflowResults].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, limit);
    } else if (isDocRepo) {
      // Search specific documentation repository
      results = await searchDocumentationWithText(sql, repository, searchTerm, file_type, limit, include_content, useAdvancedQuery);
    } else if (searchAllRepos) {
      // Hybrid search - docs, modules, and workflows
      const docResults = await searchDocumentationWithText(sql, null, searchTerm, file_type, Math.ceil(limit / 3), include_content, useAdvancedQuery);
      const moduleResults = await searchAllModulesWithText(sql, searchTerm, Math.ceil(limit / 3), include_content, useAdvancedQuery);
      const workflowResults = await searchAllWorkflowsWithText(sql, searchTerm, Math.floor(limit / 3), include_content, useAdvancedQuery);
      results = [...docResults, ...moduleResults, ...workflowResults].sort((a, b) => b.relevance_score - a.relevance_score).slice(0, limit);
    } else {
      // Fallback to original logic for edge cases
      results = await searchDocumentationWithText(sql, repository, searchTerm, file_type, limit, include_content, useAdvancedQuery);
    }
    
    console.log('[SEARCH DOCS] SQL query completed, results:', results?.length || 0);

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
    const workflowCount = resultsArray.filter((r: any) => r.search_source === 'workflows').length;

    // Format output for MCP
    let outputText = `Found ${resultsArray.length} result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
    if (repository) outputText += ` in ${repository}`;
    outputText += `\n\n`;

    outputText += `Summary:\n`;
    outputText += `- Average relevance: ${avgRelevance.toFixed(3)}\n`;
    outputText += `- Sources: ${docCount} docs, ${moduleCount} modules, ${workflowCount} workflows\n`;
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
      outputText += `   Relevance: ${result.relevance_score.toFixed(3)}\n`;
      if (result.content_snippet) {
        outputText += `   Snippet: ${result.content_snippet}\n`;
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
  include_content: boolean,
  useAdvancedQuery: boolean = false
): Promise<SearchResultItem[]> {
  console.log(`[searchModulesWithText] include_content=${include_content}, useAdvancedQuery=${useAdvancedQuery}`);
  let results;
  const queryFunc = useAdvancedQuery ? 'to_tsquery' : 'plainto_tsquery';
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
        ts_rank_cd(search_vector, ${queryFunc}('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(semantic_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          ${queryFunc}('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'modules' as search_source
      FROM flopy_modules
      WHERE search_vector @@ ${queryFunc}('english', $1)
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
        ts_rank_cd(search_vector, ${queryFunc}('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(semantic_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          ${queryFunc}('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'modules' as search_source
      FROM pyemu_modules
      WHERE search_vector @@ ${queryFunc}('english', $1)
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
  include_content: boolean,
  useAdvancedQuery: boolean = false
): Promise<SearchResultItem[]> {
  console.log(`[searchDocumentationWithText] include_content=${include_content}, useAdvancedQuery=${useAdvancedQuery}`);
  const queryFunc = useAdvancedQuery ? 'to_tsquery' : 'plainto_tsquery';
  // Build conditions
  let whereClause = `WHERE (
    COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
    setweight(to_tsvector('english', COALESCE(content, '')), 'C')
  ) @@ ${queryFunc}('english', $1)`;
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
        ${queryFunc}('english', $1)
      ) as relevance_score,
      ${include_content ? `
      ts_headline('english', 
        COALESCE(analysis->>'title', '') || ' ' || COALESCE(content, ''), 
        ${queryFunc}('english', $1), 
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
  include_content: boolean,
  useAdvancedQuery: boolean = false
): Promise<SearchResultItem[]> {
  const floepyResults = await searchModulesWithText(sql, 'flopy', searchTerm, Math.ceil(limit / 2), include_content, useAdvancedQuery);
  const pyemuResults = await searchModulesWithText(sql, 'pyemu', searchTerm, Math.floor(limit / 2), include_content, useAdvancedQuery);
  
  return [...floepyResults, ...pyemuResults]
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}

// Helper functions for workflow search
async function searchWorkflowsWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  searchTerm: string,
  limit: number,
  include_content: boolean,
  useAdvancedQuery: boolean = false
): Promise<SearchResultItem[]> {
  console.log(`[searchWorkflowsWithText] include_content=${include_content}, useAdvancedQuery=${useAdvancedQuery}`);
  const queryFunc = useAdvancedQuery ? 'to_tsquery' : 'plainto_tsquery';
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
        ts_rank_cd(search_vector, ${queryFunc}('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(title, '') || ' ' || COALESCE(workflow_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          ${queryFunc}('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'workflows' as search_source
      FROM flopy_workflows
      WHERE search_vector @@ ${queryFunc}('english', $1)
      ORDER BY relevance_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, [searchTerm]);
  } else {
    // PyEMU workflows
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
        ts_rank_cd(search_vector, ${queryFunc}('english', $1)) as relevance_score,
        ${include_content ? `
        CASE 
          WHEN length(embedding_text) > 300 THEN left(embedding_text, 300) || '...'
          ELSE embedding_text
        END as content_preview,
        ts_headline('english', 
          COALESCE(title, '') || ' ' || COALESCE(workflow_purpose, '') || ' ' || COALESCE(embedding_text, ''), 
          ${queryFunc}('english', $1), 
          'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
        ) as content_snippet
        ` : `
        null as content_preview,
        null as content_snippet
        `},
        'workflows' as search_source
      FROM pyemu_workflows
      WHERE search_vector @@ ${queryFunc}('english', $1)
      ORDER BY relevance_score DESC
      LIMIT ${limit}
    `;
    results = await sql.query(queryString, [searchTerm]);
  }
  
  return Array.isArray(results) ? results as SearchResultItem[] : [];
}

async function searchAllWorkflowsWithText(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  limit: number,
  include_content: boolean,
  useAdvancedQuery: boolean = false
): Promise<SearchResultItem[]> {
  const floepyResults = await searchWorkflowsWithText(sql, 'flopy', searchTerm, Math.ceil(limit / 2), include_content, useAdvancedQuery);
  const pyemuResults = await searchWorkflowsWithText(sql, 'pyemu', searchTerm, Math.floor(limit / 2), include_content, useAdvancedQuery);
  
  return [...floepyResults, ...pyemuResults]
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, limit);
}