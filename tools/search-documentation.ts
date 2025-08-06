/**
 * Search Documentation Tool
 * Searches for theory, mathematical background, conceptual explanations, and reference material
 * Focuses on repository_files table with comprehensive documentation content
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchDocumentationSchema = {
  name: "search_documentation",
  description: `
    Search for theory, mathematical background, conceptual explanations, and reference material across MODFLOW/PEST documentation repositories.
    
    Use when user wants:
    - Mathematical theory and formulations
    - Conceptual explanations and background
    - Reference documentation and guides
    - Scientific principles and methods
    - Theoretical foundations
    - Detailed technical explanations
    
    Searches comprehensive documentation collections including MODFLOW 6, PEST, PEST++, MODFLOW-USG guides with detailed theoretical content.
    Available repositories: mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils (documentation), flopy, pyemu (limited documentation).
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for documentation and theoretical content',
      },
      search_type: {
        type: 'string',
        enum: ['text', 'semantic', 'auto'],
        description: 'Search method: text for exact terminology, semantic for conceptual similarity, auto for intelligent selection',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils, flopy, pyemu',
      },
      file_type: {
        type: 'string',
        description: 'Filter by file type: md, txt, pdf, tex, rst',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-50, default: 10)',
      },
    },
    required: ['query'],
  }
};

interface DocumentationResult {
  filepath: string;
  repo_name: string;
  file_type: string;
  title?: string;
  summary?: string;
  key_concepts?: string[];
  similarity_score?: number;
  search_rank?: number;
  snippet?: string;
  search_source: 'documentation';
}

interface DocumentationSearchResponse {
  results: DocumentationResult[];
  search_metadata: {
    method_used: 'text' | 'semantic' | 'hybrid';
    total_results: number;
    coverage: 'documentation';
    query_analyzed: string;
  };
  recommendations?: {
    try_also?: string;
    reason?: string;
    suggested_query?: string;
  };
}

// Intelligent search method selection for documentation
function selectSearchMethod(query: string, searchType: string): 'text' | 'semantic' | 'hybrid' {
  if (searchType === 'text') return 'text';
  if (searchType === 'semantic') return 'semantic';
  
  // Auto-selection based on query characteristics
  const hasMathTerms = /\b(equation|formula|derivative|integral|matrix|solve|calculate)\b/i.test(query);
  const hasExactTerms = /["'].*["']/.test(query);
  const hasAcronyms = /\b[A-Z]{2,}\b/.test(query);
  const isConceptual = /\b(concept|theory|principle|approach|method|understand|explain)\b/i.test(query);
  
  if (hasExactTerms || hasAcronyms) return 'text';
  if (hasMathTerms || isConceptual) return 'semantic';
  return 'hybrid';
}

// Generate smart recommendations for documentation search
function generateRecommendations(query: string, results: DocumentationResult[], method: string): DocumentationSearchResponse['recommendations'] {
  const hasTheoretical = results.some(r => 
    /\b(theory|mathematical|equation|formula|principle)\b/i.test(r.title || r.summary || '')
  );
  const hasImplementation = results.some(r => 
    /\b(implementation|code|example|tutorial)\b/i.test(r.title || r.summary || '')
  );
  const isSpecificTopic = /\b(wel|riv|ghb|maw|uzf|sfr|lak|finite|difference|conductivity)\b/i.test(query);
  
  if (hasTheoretical && !hasImplementation && isSpecificTopic) {
    const topic = query.split(' ')[0];
    return {
      try_also: 'search_examples',
      reason: 'For practical implementations and working examples',
      suggested_query: `${topic} implementation tutorial example`
    };
  }
  
  if (!hasTheoretical && results.length > 0) {
    return {
      try_also: 'search_code',
      reason: 'For specific API details and programming interfaces',
      suggested_query: `${query} API parameters functions`
    };
  }
  
  return undefined;
}

// Search documentation with text method
async function searchDocumentationWithText(
  query: string, 
  sql: NeonQueryFunction<false, false>, 
  repository?: string, 
  fileType?: string,
  limit: number = 10
) {
  const repositories = repository ? [repository] : ['mf6', 'pest', 'pestpp', 'pest_hp', 'mfusg', 'plproc', 'gwutils'];
  let filters = `rf.repo_name = ANY($2)`;
  const params: any[] = [query, repositories];
  
  if (fileType) {
    params.push(fileType.toLowerCase());
    filters += ` AND lower(rf.file_type) = $${params.length}`;
  }
  
  params.push(limit);
  
  return await sql`
    SELECT 
      rf.filepath,
      rf.repo_name,
      rf.file_type,
      rf.analysis->>'title' as title,
      rf.analysis->>'summary' as summary,
      rf.analysis->'key_concepts' as key_concepts,
      ts_rank_cd(
        to_tsvector('english', 
          coalesce(rf.analysis->>'title', '') || ' ' ||
          coalesce(rf.analysis->>'summary', '') || ' ' ||
          coalesce(rf.content, '')
        ),
        plainto_tsquery('english', $1),
        1 | 4 | 32  -- Weight title and summary higher
      ) as search_rank,
      ts_headline('english', 
        coalesce(rf.content, rf.analysis->>'summary', ''),
        plainto_tsquery('english', $1),
        'MaxWords=30, MinWords=20, MaxFragments=2, FragmentDelimiter=" ... "'
      ) as snippet,
      'documentation' as search_source
    FROM repository_files rf
    WHERE ${filters}
    AND (
      to_tsvector('english', 
        coalesce(rf.analysis->>'title', '') || ' ' ||
        coalesce(rf.analysis->>'summary', '') || ' ' ||
        coalesce(rf.content, '')
      ) @@ plainto_tsquery('english', $1)
      OR lower(rf.content) LIKE '%' || lower($1) || '%'
    )
    ORDER BY search_rank DESC
    LIMIT $${params.length}
  `.execute();
}

// Search documentation with semantic method (enhanced text search for now)
async function searchDocumentationWithEmbeddings(
  query: string, 
  sql: NeonQueryFunction<false, false>, 
  repository?: string,
  fileType?: string, 
  limit: number = 10
) {
  // For now, use enhanced text search with semantic-like weighting
  // TODO: Implement true embedding search when embeddings are available
  
  const repositories = repository ? [repository] : ['mf6', 'pest', 'pestpp', 'pest_hp', 'mfusg', 'plproc', 'gwutils'];
  let filters = `rf.repo_name = ANY($2)`;
  const params: any[] = [query, repositories];
  
  if (fileType) {
    params.push(fileType.toLowerCase());
    filters += ` AND lower(rf.file_type) = $${params.length}`;
  }
  
  params.push(limit);
  
  // Enhanced semantic-like search with expanded query terms
  const expandedQuery = query + ' ' + query.split(' ').map(term => {
    // Add conceptual expansions for common terms
    const expansions: Record<string, string> = {
      'flow': 'hydraulic fluid groundwater',
      'conductivity': 'permeability hydraulic transmission',
      'boundary': 'condition constraint limit',
      'package': 'module component feature',
      'solver': 'solution method algorithm numerical',
      'grid': 'mesh discretization finite difference',
      'transport': 'solute contaminant advection dispersion',
      'calibration': 'parameter estimation optimization fitting',
      'uncertainty': 'sensitivity monte carlo stochastic'
    };
    return expansions[term.toLowerCase()] || '';
  }).join(' ');
  
  return await sql`
    SELECT 
      rf.filepath,
      rf.repo_name,
      rf.file_type,
      rf.analysis->>'title' as title,
      rf.analysis->>'summary' as summary,
      rf.analysis->'key_concepts' as key_concepts,
      ts_rank_cd(
        to_tsvector('english', 
          coalesce(rf.analysis->>'title', '') || ' ' ||
          coalesce(rf.analysis->>'summary', '') || ' ' ||
          coalesce(rf.content, '')
        ),
        plainto_tsquery('english', ${expandedQuery}),
        1 | 4 | 32  -- Weight title and summary higher
      ) as similarity_score,
      ts_headline('english', 
        coalesce(rf.content, rf.analysis->>'summary', ''),
        plainto_tsquery('english', $1),
        'MaxWords=30, MinWords=20, MaxFragments=2, FragmentDelimiter=" ... "'
      ) as snippet,
      'documentation' as search_source
    FROM repository_files rf
    WHERE ${filters}
    AND to_tsvector('english', 
      coalesce(rf.analysis->>'title', '') || ' ' ||
      coalesce(rf.analysis->>'summary', '') || ' ' ||
      coalesce(rf.content, '')
    ) @@ plainto_tsquery('english', ${expandedQuery})
    ORDER BY similarity_score DESC
    LIMIT $${params.length}
  `.execute();
}

export async function searchDocumentation(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { 
      query, 
      search_type = 'auto', 
      repository, 
      file_type,
      limit = 10 
    } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new Error('Limit must be between 1 and 50');
    }

    const method = selectSearchMethod(query, search_type);
    
    console.log(`[SEARCH DOCUMENTATION] Query: "${query}", Method: ${method}, Repository: ${repository || 'all'}, FileType: ${file_type || 'any'}`);

    let results: DocumentationResult[] = [];
    
    if (method === 'semantic') {
      results = await searchDocumentationWithEmbeddings(query, sql, repository, file_type, limit);
    } else if (method === 'text') {
      results = await searchDocumentationWithText(query, sql, repository, file_type, limit);
    } else {
      // Hybrid: combine both methods
      const semanticResults = await searchDocumentationWithEmbeddings(query, sql, repository, file_type, Math.ceil(limit / 2));
      const textResults = await searchDocumentationWithText(query, sql, repository, file_type, Math.ceil(limit / 2));
      
      // Merge and deduplicate
      const seen = new Set();
      results = [...semanticResults, ...textResults].filter((result: any) => {
        const key = `${result.repo_name}:${result.filepath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).sort((a, b) => (b.similarity_score || b.search_rank || 0) - (a.similarity_score || a.search_rank || 0));
    }
    
    // Limit final results
    results = results.slice(0, limit);

    const recommendations = generateRecommendations(query, results, method);

    const response: DocumentationSearchResponse = {
      results,
      search_metadata: {
        method_used: method,
        total_results: results.length,
        coverage: 'documentation',
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
    console.error('[SEARCH DOCUMENTATION] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}