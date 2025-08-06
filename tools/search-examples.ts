/**
 * Search Examples Tool
 * Searches for tutorials, workflows, complete implementations, and step-by-step guides
 * Focuses on workflow tables (flopy_workflows, pyemu_workflows) with examples and tutorials
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchExamplesSchema = {
  name: "search_examples",
  description: `
    Search for tutorials, workflows, complete implementations, step-by-step guides, and working code examples across MODFLOW/PEST resources.
    
    Use when user wants:
    - Tutorials and how-to guides
    - Complete working examples  
    - Step-by-step implementations
    - Workflow demonstrations
    - Practical applications
    - Learning materials
    
    Searches primarily FloPy/PyEMU workflow collections with rich metadata including complexity, tags, packages used, and use cases.
    Available repositories: flopy, pyemu (workflows), mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils (documentation examples).
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for examples and tutorials',
      },
      search_type: {
        type: 'string',
        enum: ['text', 'semantic', 'auto'],
        description: 'Search method: text for keyword matching, semantic for concept similarity, auto for intelligent selection',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils',
      },
      complexity: {
        type: 'string',
        enum: ['beginner', 'intermediate', 'advanced'],
        description: 'Filter by complexity level',
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
  const isSpecificPackage = /\b(wel|riv|ghb|maw|uzf|sfr|lak|drn|evt|rch)\b/i.test(query);
  
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
    return sql`
      SELECT 
        fw.filepath,
        '${repo}' as repo_name,
        fw.analysis->>'title' as title,
        fw.analysis->>'summary' as summary,
        fw.complexity,
        fw.workflow_type,
        fw.packages_used,
        fw.tags,
        fw.best_use_cases,
        fw.workflow_purpose,
        ts_rank_cd(
          to_tsvector('english', 
            coalesce(fw.analysis->>'title', '') || ' ' ||
            coalesce(fw.analysis->>'summary', '') || ' ' ||
            coalesce(fw.workflow_purpose, '') || ' ' ||
            array_to_string(fw.tags, ' ')
          ),
          plainto_tsquery('english', ${query})
        ) as search_rank,
        ts_headline('english',
          coalesce(fw.analysis->>'summary', fw.workflow_purpose, ''),
          plainto_tsquery('english', ${query}),
          'MaxWords=20, MinWords=10, MaxFragments=1'
        ) as snippet,
        'workflows' as search_source
      FROM ${tableName} fw
      WHERE to_tsvector('english', 
        coalesce(fw.analysis->>'title', '') || ' ' ||
        coalesce(fw.analysis->>'summary', '') || ' ' ||
        coalesce(fw.workflow_purpose, '') || ' ' ||
        array_to_string(fw.tags, ' ')
      ) @@ plainto_tsquery('english', ${query})
      ${complexity ? `AND fw.complexity = ${complexity}` : ''}
      ORDER BY search_rank DESC
      LIMIT ${limit}
    `.execute();
  });
  
  const results = await Promise.all(workflowQueries);
  return results.flat().sort((a: any, b: any) => (b.search_rank || 0) - (a.search_rank || 0));
}

// Search documentation examples with text method
async function searchDocumentationExamples(query: string, sql: NeonQueryFunction<false, false>, repository?: string, limit: number = 5) {
  const repositories = repository ? [repository] : ['mf6', 'pest', 'pestpp', 'pest_hp', 'mfusg', 'plproc', 'gwutils'];
  const docRepos = repositories.filter(r => !['flopy', 'pyemu'].includes(r));
  
  if (docRepos.length === 0) return [];
  
  const repoFilter = docRepos.map(r => `'${r}'`).join(', ');
  
  return await sql`
    SELECT 
      rf.filepath,
      rf.repo_name,
      rf.analysis->>'title' as title,
      rf.analysis->>'summary' as summary,
      ts_rank_cd(
        to_tsvector('english', rf.content),
        plainto_tsquery('english', ${query})
      ) as search_rank,
      ts_headline('english', rf.content,
        plainto_tsquery('english', ${query}),
        'MaxWords=20, MinWords=10, MaxFragments=1'
      ) as snippet,
      'documentation' as search_source
    FROM repository_files rf
    WHERE rf.repo_name = ANY(${docRepos})
    AND (
      lower(rf.filepath) LIKE '%example%'
      OR lower(rf.filepath) LIKE '%tutorial%'
      OR lower(rf.analysis->>'title') LIKE '%example%'
      OR to_tsvector('english', rf.content) @@ plainto_tsquery('english', ${query})
    )
    ORDER BY search_rank DESC
    LIMIT ${limit}
  `.execute();
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
    const { query, search_type = 'auto', repository, complexity, limit = 10 } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new Error('Limit must be between 1 and 50');
    }

    const method = selectSearchMethod(query, search_type);
    const workflowLimit = Math.floor(limit * 0.8); // 80% workflows
    const docLimit = Math.ceil(limit * 0.2); // 20% documentation examples
    
    console.log(`[SEARCH EXAMPLES] Query: "${query}", Method: ${method}, Repository: ${repository || 'all'}, Complexity: ${complexity || 'any'}`);

    let workflowResults: ExampleResult[] = [];
    let docResults: ExampleResult[] = [];
    
    if (method === 'semantic') {
      workflowResults = await searchWorkflowsWithEmbeddings(query, sql, repository, complexity, workflowLimit);
    } else if (method === 'text') {
      workflowResults = await searchWorkflowsWithText(query, sql, repository, complexity, workflowLimit);
    } else {
      // Hybrid: combine both methods
      const semanticResults = await searchWorkflowsWithEmbeddings(query, sql, repository, complexity, Math.ceil(workflowLimit / 2));
      const textResults = await searchWorkflowsWithText(query, sql, repository, complexity, Math.ceil(workflowLimit / 2));
      
      // Merge and deduplicate
      const seen = new Set();
      workflowResults = [...semanticResults, ...textResults].filter((result: any) => {
        const key = `${result.repo_name}:${result.filepath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    
    // Add documentation examples if not repository-specific or if targeting doc repos
    if (!repository || !['flopy', 'pyemu'].includes(repository)) {
      docResults = await searchDocumentationExamples(query, sql, repository, docLimit);
    }
    
    // Combine and rank results
    const allResults = [...workflowResults, ...docResults]
      .sort((a, b) => (b.similarity_score || b.search_rank || 0) - (a.similarity_score || a.search_rank || 0))
      .slice(0, limit);

    const recommendations = generateRecommendations(query, allResults, method);

    const response: ExampleSearchResponse = {
      results: allResults,
      search_metadata: {
        method_used: method,
        total_results: allResults.length,
        coverage: 'examples',
        query_analyzed: query
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