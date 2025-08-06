/**
 * Search Examples Tool
 * Searches for tutorials, workflows, complete implementations, and step-by-step guides
 * Focuses on workflow tables (flopy_workflows, pyemu_workflows) with examples and tutorials
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import acronymMappings from './acronym-mappings.json';

export const searchExamplesSchema = {
  name: "search_examples",
  description: "Search for tutorials, workflows, complete implementations, step-by-step guides, and working code examples. Use when user wants: tutorials, working examples, step-by-step implementations, workflow demonstrations, practical applications, or learning materials. Searches ONLY FloPy and PyEMU workflow tables (flopy_workflows, pyemu_workflows) with rich metadata including complexity levels, best use cases, and packages used. Available repositories: flopy, pyemu.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for examples and tutorials',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-50, default: 10)',
      },
    },
    required: ['query'],
  }
};

interface ExampleResult {
  filepath: string;
  repo_name: string;
  github_url?: string;
  title?: string;
  summary?: string;
  complexity?: string;
  workflow_type?: string;
  packages_used?: string[];
  tags?: string[];
  best_use_cases?: string[];
  workflow_purpose?: string;
  similarity_score?: number;
  search_rank?: number;
  snippet?: string;
  search_source: 'workflows' | 'documentation';
}

interface ExampleSearchResponse {
  results: ExampleResult[];
  search_metadata: {
    method_used: 'text' | 'semantic' | 'hybrid';
    total_results: number;
    coverage: 'examples';
    query_analyzed: string;
    acronyms_detected?: {
      [key: string]: string;
    };
  };
  recommendations?: {
    try_also?: string;
    reason?: string;
    suggested_query?: string;
  };
}

// Intelligent search method selection
function selectSearchMethod(query: string, searchType: string): 'text' | 'semantic' | 'hybrid' {
  if (searchType === 'text') return 'text';
  if (searchType === 'semantic') return 'semantic';
  
  // Auto-selection based on query characteristics
  const hasSpecificTerms = /\b(package|function|parameter|class|method|API)\b/i.test(query);
  const hasQuotes = /["'].*["']/.test(query);
  const isConceptual = /\b(how to|example|tutorial|workflow|guide|learn)\b/i.test(query);
  
  if (hasQuotes || hasSpecificTerms) return 'text';
  if (isConceptual) return 'semantic';
  return 'hybrid';
}

// Generate smart recommendations
function generateRecommendations(query: string, results: ExampleResult[], method: string): ExampleSearchResponse['recommendations'] {
  const hasCodePackages = results.some(r => r.packages_used?.length);
  const hasComplexExamples = results.some(r => r.complexity === 'advanced');
  
  // Check if query contains any known package acronyms
  const queryWords = query.toLowerCase().split(/\s+/);
  const isSpecificPackage = queryWords.some(word => word.toUpperCase() in acronymMappings);
  
  if (isSpecificPackage && hasCodePackages && method !== 'hybrid') {
    return {
      try_also: 'search_code',
      reason: 'For specific API parameters and implementation details',
      suggested_query: `${query.split(' ')[0]} package constructor parameters`
    };
  }
  
  if (results.length > 0 && !hasComplexExamples) {
    return {
      try_also: 'search_documentation',
      reason: 'For theoretical background and detailed explanations',
      suggested_query: `${query} theory mathematical background`
    };
  }
  
  return undefined;
}

// Search workflows with text method
async function searchWorkflowsWithText(query: string, sql: NeonQueryFunction<false, false>, repository?: string, complexity?: string, limit: number = 10) {
  const repositories = repository ? [repository] : ['flopy', 'pyemu'];
  const workflowRepos = repositories.filter(r => ['flopy', 'pyemu'].includes(r));
  
  if (workflowRepos.length === 0) return [];
  
  const complexityFilter = complexity ? 'AND fw.complexity = $3' : '';
  const params = complexity ? [query, limit, complexity] : [query, limit];
  
  const workflowQueries = workflowRepos.map(repo => {
    const tableName = `${repo}_workflows`;
    const fileColumn = repo === 'flopy' ? 'tutorial_file' : 'notebook_file';
    let queryStr = `
      SELECT 
        fw.${fileColumn} as filepath,
        '${repo}' as repo_name,
        CASE 
          WHEN '${repo}' = 'flopy' AND fw.${fileColumn} LIKE 'scripts/ex-%' THEN 'https://github.com/MODFLOW-ORG/modflow6-examples/blob/develop/' || fw.${fileColumn}
          WHEN '${repo}' = 'flopy' THEN 'https://github.com/modflowpy/flopy/blob/develop/' || fw.${fileColumn}
          WHEN '${repo}' = 'pyemu' THEN 'https://github.com/pypest/pyemu/blob/develop/' || fw.${fileColumn}
          ELSE NULL
        END as github_url,
        fw.title as title,
        fw.description as summary,
        fw.complexity,
        ${repo === 'flopy' ? 'fw.model_type as workflow_type' : 'fw.workflow_type'},
        ${repo === 'flopy' ? 'fw.packages_used' : 'fw.pyemu_modules as packages_used'},
        fw.tags,
        ${repo === 'flopy' ? 'fw.best_use_cases' : 'fw.common_applications as best_use_cases'},
        fw.workflow_purpose,
        ts_rank_cd(
          to_tsvector('english', 
            coalesce(fw.title, '') || ' ' ||
            coalesce(fw.description, '') || ' ' ||
            coalesce(fw.workflow_purpose, '') || ' ' ||
            array_to_string(fw.tags, ' ')
          ),
          plainto_tsquery('english', $1)
        ) as search_rank,
        ts_headline('english',
          coalesce(fw.description, fw.workflow_purpose, ''),
          plainto_tsquery('english', $1),
          'MaxWords=20, MinWords=10, MaxFragments=1'
        ) as snippet,
        'workflows' as search_source
      FROM ${tableName} fw
      WHERE to_tsvector('english', 
        coalesce(fw.title, '') || ' ' ||
        coalesce(fw.description, '') || ' ' ||
        coalesce(fw.workflow_purpose, '') || ' ' ||
        array_to_string(fw.tags, ' ')
      ) @@ plainto_tsquery('english', $1)
      ${complexity ? `AND fw.complexity = '${complexity}'` : ''}
      ORDER BY search_rank DESC
      LIMIT $2
    `;
    return sql.query(queryStr, [query, limit]);
  });
  
  const results = await Promise.all(workflowQueries);
  return results.flat().sort((a: any, b: any) => (b.search_rank || 0) - (a.search_rank || 0));
}

// Search workflows with semantic method  
async function searchWorkflowsWithEmbeddings(query: string, sql: NeonQueryFunction<false, false>, repository?: string, complexity?: string, limit: number = 10) {
  // For now, fall back to text search with enhanced ranking
  // TODO: Implement true embedding search when embeddings are available for workflows
  const results = await searchWorkflowsWithText(query, sql, repository, complexity, limit);
  
  // Add similarity scores based on text ranking
  return results.map((result: any) => ({
    ...result,
    similarity_score: result.search_rank || 0
  }));
}

export async function searchExamples(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    // Handle both direct args and potentially wrapped args
    const actualArgs = args || {};
    
    const { query, search_type = 'auto', repository, complexity, limit = 10 } = actualArgs;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new Error('Limit must be between 1 and 50');
    }

    // Detect acronyms in the query
    const queryWords = query.toLowerCase().split(/\s+/);
    const detectedAcronyms: { [key: string]: string } = {};
    
    for (const word of queryWords) {
      const upperWord = word.toUpperCase();
      if (upperWord in acronymMappings) {
        detectedAcronyms[upperWord] = (acronymMappings as any)[upperWord].full;
      }
    }

    const method = selectSearchMethod(query, search_type);
    
    console.log(`[SEARCH EXAMPLES] Query: "${query}", Method: ${method}, Repository: ${repository || 'all'}, Complexity: ${complexity || 'any'}`);

    let workflowResults: any[] = [];
    
    if (method === 'semantic') {
      workflowResults = await searchWorkflowsWithEmbeddings(query, sql, repository, complexity, limit);
    } else if (method === 'text') {
      workflowResults = await searchWorkflowsWithText(query, sql, repository, complexity, limit);
    } else {
      // Hybrid: combine both methods
      const semanticResults = await searchWorkflowsWithEmbeddings(query, sql, repository, complexity, Math.ceil(limit / 2));
      const textResults = await searchWorkflowsWithText(query, sql, repository, complexity, Math.ceil(limit / 2));
      
      // Merge and deduplicate
      const seen = new Set();
      workflowResults = [...semanticResults, ...textResults].filter((result: any) => {
        const key = `${result.repo_name}:${result.filepath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    
    // ONLY return workflow results - NO documentation
    const allResults = workflowResults
      .sort((a, b) => (b.similarity_score || b.search_rank || 0) - (a.similarity_score || a.search_rank || 0))
      .slice(0, limit);

    const recommendations = generateRecommendations(query, allResults, method);

    const response: ExampleSearchResponse = {
      results: allResults,
      search_metadata: {
        method_used: method,
        total_results: allResults.length,
        coverage: 'examples',
        query_analyzed: query,
        ...(Object.keys(detectedAcronyms).length > 0 && { acronyms_detected: detectedAcronyms })
      },
      recommendations
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(response, null, 2)
      }]
    };

  } catch (error) {
    console.error('[SEARCH EXAMPLES] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}