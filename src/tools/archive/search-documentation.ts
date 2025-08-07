/**
 * Search Documentation Tool
 * Searches for theory, mathematical background, conceptual explanations, and reference material
 * Focuses on repository_files table with comprehensive documentation content
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import acronymMappings from './acronym-mappings.json';

export const searchDocumentationSchema = {
  name: "search_documentation",
  description: "Search for theory, mathematical background, conceptual explanations, and reference material across MODFLOW/PEST documentation repositories. Use when user wants: mathematical theory, conceptual explanations, reference guides, scientific principles, theoretical foundations, or technical explanations. Searches comprehensive documentation including MODFLOW 6, PEST, PEST++, MODFLOW-USG guides. Available repositories: mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils, flopy, pyemu. IMPORTANT: Query limited to 3 words maximum because text search performs significantly better with focused, specific terms rather than long phrases. Use the most important keywords only.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for documentation (maximum 3 words)',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils, flopy, pyemu',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-3, default: 1)',
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
  
  // Expand acronyms in the search query
  let searchTerm = query.trim();
  const words = searchTerm.split(/\s+/);
  const expandedTerms: string[] = [];
  let hasAcronymExpansion = false;
  
  for (const word of words) {
    const upperWord = word.toUpperCase();
    if ((acronymMappings as any)[upperWord]) {
      const mapping = (acronymMappings as any)[upperWord];
      // For tsquery, we need to format it properly
      const fullTerms = mapping.full.toLowerCase().split(/\s+/).join('<->');
      expandedTerms.push(`(${word} | ${fullTerms})`);
      hasAcronymExpansion = true;
    } else {
      expandedTerms.push(word);
    }
  }
  
  // If we expanded any acronyms, use the expanded query with to_tsquery
  // Otherwise, we'll use plainto_tsquery with the original query
  let useTsquery = false;
  if (hasAcronymExpansion) {
    searchTerm = expandedTerms.join(' & ');
    useTsquery = true;
  } else {
    // Keep original query for plainto_tsquery
    searchTerm = query;
  }
  
  let filters = `rf.repo_name = ANY($2)`;
  const params: any[] = [searchTerm, repositories];
  
  if (fileType) {
    params.push(fileType.toLowerCase());
    filters += ` AND lower(rf.file_type) = $${params.length}`;
  }
  
  params.push(limit);
  
  const tsqueryFunc = useTsquery ? 'to_tsquery' : 'plainto_tsquery';
  const queryStr = `
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
        ${tsqueryFunc}('english', $1),
        1 | 4 | 32  -- Weight title and summary higher
      ) as search_rank,
      ts_headline('english', 
        coalesce(rf.content, rf.analysis->>'summary', ''),
        ${tsqueryFunc}('english', $1),
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
      ) @@ ${tsqueryFunc}('english', $1)
    )
    ORDER BY search_rank DESC
    LIMIT $${params.length}
  `;
  return await sql.query(queryStr, params);
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
  
  // For semantic search, expand acronyms but keep it simple for plainto_tsquery
  let expandedQuery = query.trim();
  const words = expandedQuery.split(/\s+/);
  const expandedTerms: string[] = [];
  
  for (const word of words) {
    const upperWord = word.toUpperCase();
    expandedTerms.push(word);
    if ((acronymMappings as any)[upperWord]) {
      const mapping = (acronymMappings as any)[upperWord];
      // Add the full form as additional search terms
      expandedTerms.push(mapping.full.toLowerCase());
    }
  }
  
  expandedQuery = expandedTerms.join(' ');
  
  // Rebuild params array in correct order
  const newParams: any[] = [expandedQuery, query, repositories];
  if (fileType) {
    newParams.push(fileType.toLowerCase());
    filters = filters.replace(/\$3/g, '$4');  // Adjust fileType position
  }
  newParams.push(limit);
  
  // Update filters to use correct positions
  filters = filters.replace(/\$2/g, '$3');  // repositories is now at position 3
  
  const queryStr = `
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
      ) as similarity_score,
      ts_headline('english', 
        coalesce(rf.content, rf.analysis->>'summary', ''),
        plainto_tsquery('english', $2),
        'MaxWords=30, MinWords=20, MaxFragments=2, FragmentDelimiter=" ... "'
      ) as snippet,
      'documentation' as search_source
    FROM repository_files rf
    WHERE ${filters}
    AND to_tsvector('english', 
      coalesce(rf.analysis->>'title', '') || ' ' ||
      coalesce(rf.analysis->>'summary', '') || ' ' ||
      coalesce(rf.content, '')
    ) @@ plainto_tsquery('english', $1)
    ORDER BY similarity_score DESC
    LIMIT $${newParams.length}
  `;
  return await sql.query(queryStr, newParams);
}

export async function searchDocumentation(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    // Handle both direct args and potentially wrapped args
    const actualArgs = args || {};
    
    const { 
      query, 
      search_type = 'auto', 
      repository, 
      file_type,
      limit = 1  // Default to 1 result
    } = actualArgs;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    // Limit query to maximum 3 words
    const words = query.trim().split(/\s+/);
    if (words.length > 3) {
      throw new Error('Query must contain 3 words or fewer for documentation search. Use more specific terms.');
    }

    if (limit && (limit < 1 || limit > 3)) {
      throw new Error('Limit must be between 1 and 3 for documentation search');
    }

    // Detect and expand acronyms
    const queryWords = query.trim().split(/\s+/);
    const detectedAcronyms: { [key: string]: string } = {};
    const expandedTerms: string[] = [];
    
    for (const word of queryWords) {
      const upperWord = word.toUpperCase();
      expandedTerms.push(word);
      if ((acronymMappings as any)[upperWord]) {
        const mapping = (acronymMappings as any)[upperWord];
        detectedAcronyms[upperWord] = mapping.full;
        // Add the full form for search expansion
        expandedTerms.push(mapping.full.toLowerCase());
      }
    }
    
    const expandedQuery = expandedTerms.join(' ');
    const method = selectSearchMethod(query, search_type);
    
    console.log(`[SEARCH DOCUMENTATION] Query: "${query}", Expanded: "${expandedQuery}", Method: ${method}, Repository: ${repository || 'all'}, FileType: ${file_type || 'any'}`);

    let results: any[] = [];
    
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
        query_analyzed: query,
        ...(Object.keys(detectedAcronyms).length > 0 && { 
          acronyms_detected: detectedAcronyms,
          query_expanded: expandedQuery
        })
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