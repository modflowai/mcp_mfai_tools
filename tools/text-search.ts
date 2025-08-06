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
}

// Tool schema definition
export const textSearchSchema = {
  name: "text_search_repository",
  description: `
    Perform full-text search across MODFLOW/PEST documentation repository files using PostgreSQL's powerful search capabilities.
    This tool finds exact keyword matches and uses advanced text ranking for relevance.
    Best for finding specific functions, classes, variables, or exact terminology in documentation.
    
    IMPORTANT: This tool searches ONLY documentation repositories, not code repositories.
    For code search, use different approaches for FloPy/PyEMU modules.
    
    Available documentation repositories:
    - mfusg: MODFLOW-USG (Unstructured Grid) documentation
    - pest: Parameter Estimation package documentation  
    - pestpp: PEST++ enhanced version documentation
    - pest_hp: PEST_HP parallel version documentation
    - mf6: MODFLOW 6 documentation
    - plproc: Parameter list processor documentation
    - gwutils: Groundwater data utilities documentation
    
    Search features:
    - Exact keyword matching with acronym expansion
    - Multi-word phrase search
    - Boolean operators (AND, OR, NOT)
    - Wildcard search with * and ?
    - Case-insensitive search
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Your search terms. Use quotes for exact phrases, * for wildcards, AND/OR for boolean logic',
      },
      repository: {
        type: 'string',
        description: 'Specific documentation repository to search (mfusg, pest, pestpp, pest_hp, mf6, plproc, gwutils). If not specified, searches all documentation repositories.',
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

    // Validate repository if specified - exclude code repos (flopy, pyemu)
    const validRepos = ['mfusg', 'pest', 'pestpp', 'pest_hp', 'mf6', 'plproc', 'gwutils'];
    const codeRepos = ['flopy', 'pyemu'];
    
    if (repository) {
      if (codeRepos.includes(repository)) {
        throw new Error(`'${repository}' is a code repository. Use different tools for FloPy/PyEMU code search. Available documentation repositories: ${validRepos.join(', ')}`);
      }
      if (!validRepos.includes(repository)) {
        throw new Error(`Invalid repository '${repository}'. Valid documentation repositories: ${validRepos.join(', ')}`);
      }
    }

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
    
    // Most common case - search all docs with content
    if (!repository && !file_type && include_content) {
      console.log('[TEXT SEARCH] Using default query path (all docs with content)');
      results = await sql`
        SELECT filepath, repo_name, file_type, created_at, 
               COALESCE(analysis->>'title', '') as title,
               ts_rank(
                 COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
                 setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
                 to_tsquery('english', ${searchTerm})
               ) as relevance_score,
               ts_headline('english', 
                 COALESCE(analysis->>'title', '') || ' ' || COALESCE(content, ''), 
                 to_tsquery('english', ${searchTerm}), 
                 'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
               ) as content_snippet,
               CASE 
                 WHEN length(content) > 300 THEN left(content, 300) || '...'
                 ELSE content
               END as content_preview
        FROM repository_files
        WHERE (
          COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) @@ to_tsquery('english', ${searchTerm}) 
          AND repo_name NOT IN ('flopy', 'pyemu')
        ORDER BY relevance_score DESC, created_at DESC 
        LIMIT ${limit}
      `;
      console.log('[TEXT SEARCH] SQL query completed, results:', results?.length || 0);
    } else if (repository) {
      // Search specific repository
      results = await sql`
        SELECT filepath, repo_name, file_type, created_at, 
               COALESCE(analysis->>'title', '') as title,
               ts_rank(
                 COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
                 setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
                 to_tsquery('english', ${searchTerm})
               ) as relevance_score,
               ${include_content ? sql`ts_headline('english', 
                 COALESCE(analysis->>'title', '') || ' ' || COALESCE(content, ''), 
                 to_tsquery('english', ${searchTerm}), 
                 'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
               ) as content_snippet,
               CASE 
                 WHEN length(content) > 300 THEN left(content, 300) || '...'
                 ELSE content
               END as content_preview` : sql`null as content_snippet, null as content_preview`}
        FROM repository_files
        WHERE (
          COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) @@ to_tsquery('english', ${searchTerm}) 
          AND repo_name = ${repository}
        ORDER BY relevance_score DESC, created_at DESC 
        LIMIT ${limit}
      `;
    } else {
      // Search all documentation repos without content
      results = await sql`
        SELECT filepath, repo_name, file_type, created_at, 
               COALESCE(analysis->>'title', '') as title,
               ts_rank(
                 COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
                 setweight(to_tsvector('english', COALESCE(content, '')), 'C'),
                 to_tsquery('english', ${searchTerm})
               ) as relevance_score,
               ${include_content ? sql`ts_headline('english', 
                 COALESCE(analysis->>'title', '') || ' ' || COALESCE(content, ''), 
                 to_tsquery('english', ${searchTerm}), 
                 'MaxWords=50, MinWords=20, StartSel=**[, StopSel=]**'
               ) as content_snippet,
               CASE 
                 WHEN length(content) > 300 THEN left(content, 300) || '...'
                 ELSE content
               END as content_preview` : sql`null as content_snippet, null as content_preview`}
        FROM repository_files
        WHERE (
          COALESCE(setweight(to_tsvector('english', COALESCE(analysis->>'title', '')), 'A'), '') ||
          setweight(to_tsvector('english', COALESCE(content, '')), 'C')
        ) @@ to_tsquery('english', ${searchTerm}) 
          AND repo_name NOT IN ('flopy', 'pyemu')
        ORDER BY relevance_score DESC, created_at DESC 
        LIMIT ${limit}
      `;
    }

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

    // Format output for MCP
    let outputText = `Found ${resultsArray.length} result${resultsArray.length !== 1 ? 's' : ''} for "${query}"`;
    if (repository) outputText += ` in ${repository}`;
    outputText += `\n\n`;

    outputText += `Summary:\n`;
    outputText += `- Average relevance: ${avgRelevance.toFixed(3)}\n`;
    outputText += `- Repositories: ${uniqueRepos.join(', ')}\n`;
    outputText += `- File types: ${uniqueTypes.join(', ')}\n\n`;

    outputText += `Results:\n`;
    resultsArray.forEach((result: any, index: number) => {
      outputText += `${index + 1}. **${result.filepath}** (${result.repo_name})\n`;
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