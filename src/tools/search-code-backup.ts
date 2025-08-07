/**
 * BACKUP/REFERENCE: Search Code Tool with Rich Metadata Text Search Improvements
 * 
 * This file contains the improved search-code.ts with the following key enhancements:
 * 
 * 1. **Prioritizes Text Search**: Found that text search with rich metadata works better 
 *    than semantic search for code-specific queries
 * 
 * 2. **Rich Metadata Integration**: Uses package_code, model_family, semantic_purpose, 
 *    related_concepts, user_scenarios for more accurate text matching
 * 
 * 3. **Smart Method Selection**: Defaults to text search instead of semantic/hybrid 
 *    for better accuracy with API details, function signatures, package codes
 * 
 * 4. **Working Vector Search**: Has the fixed semantic search using JSON.stringify() 
 *    and template literals for cases where semantic search is needed
 * 
 * 5. **Acronym Detection**: Automatic acronym expansion for better search results
 * 
 * KEY INSIGHT: Text search with FloPy's rich metadata (package codes, semantic purposes, 
 * related concepts, user scenarios) provides more precise results than semantic search 
 * for code modules. Semantic search can be too broad for code-specific queries.
 * 
 * BACKUP DATE: 2025-08-06
 * STATUS: Working well, prioritizes text search over semantic search
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import acronymMappings from './acronym-mappings.json';

export const searchCodeSchema = {
  name: "search_code",
  description: "Search for API details, function signatures, parameter lists, class definitions, and implementation specifics across MODFLOW/PEST code modules. Uses intelligent text search with rich metadata for optimal accuracy. Prioritizes text search over semantic search for precise code-related results. Use when user wants: API details, function signatures, parameter lists, class definitions, implementation specifics, or programming interfaces. Searches FloPy/PyEMU module collections with rich metadata. Available repositories: flopy, pyemu (modules), mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for code modules and API details',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-50, default: 10)',
      },
    },
    required: ['query'],
  }
};

interface CodeResult {
  filepath: string;
  repo_name: string;
  github_url?: string;
  title?: string;
  summary?: string;
  package_code?: string;
  model_family?: string;
  category?: string;
  key_concepts?: string[];
  usage_examples?: string[];
  parameters?: string[];
  similarity_score?: number;
  search_rank?: number;
  snippet?: string;
  search_source: 'modules' | 'documentation';
}

interface CodeSearchResponse {
  results: CodeResult[];
  search_metadata: {
    method_used: 'text' | 'semantic' | 'hybrid';
    total_results: number;
    coverage: 'code';
    query_analyzed: string;
    acronyms_detected?: { [key: string]: string };
  };
  recommendations?: {
    try_also: string;
    reason: string;
    suggested_query?: string;
  };
}

// Intelligent search method selection for code - prioritizing text search for better accuracy
function selectSearchMethod(query: string, searchType: string): 'text' | 'semantic' | 'hybrid' {
  if (searchType === 'text') return 'text';
  if (searchType === 'semantic') return 'semantic';
  
  // For code search, prioritize text search with rich metadata over semantic search
  // Text search provides more accurate results for API details, function signatures, and package codes
  // Semantic search can be too broad for code-specific queries
  
  const hasExactAPI = /\b(\.|\(|\)|def |class |import |from )\b/.test(query);
  const hasQuotes = /["'].*["']/.test(query);
  const isConceptual = /\b(similar|like|related|concept|approach)\b/i.test(query);
  
  // Check if query contains any known acronyms (which would benefit from text search)
  const queryWords = query.toLowerCase().split(/\s+/);
  const hasKnownAcronym = queryWords.some(word => word.toUpperCase() in acronymMappings);
  
  // Prioritize text search for most queries - it's more accurate for code modules
  if (hasExactAPI || hasQuotes || hasKnownAcronym) return 'text';
  
  // Only use semantic search for explicitly conceptual queries
  // Even then, consider if text search might be more appropriate
  if (isConceptual) return 'text'; // Changed from 'semantic' to 'text'
  
  // Default to text search instead of hybrid for better accuracy
  return 'text'; // Changed from 'hybrid' to 'text'
}

// Generate smart recommendations for code search
function generateRecommendations(query: string, results: CodeResult[], method: string): CodeSearchResponse['recommendations'] {
  const hasPackageResults = results.some(r => r.package_code);
  const hasModuleResults = results.some(r => r.search_source === 'modules');
  
  if (hasPackageResults && !hasModuleResults) {
    return {
      try_also: 'search_examples',
      reason: 'For complete tutorials and working implementations',
      suggested_query: `${results[0].package_code} package tutorial example`
    };
  }
  
  if (!hasPackageResults && results.length > 0) {
    return {
      try_also: 'search_examples',  
      reason: 'For complete tutorials and working implementations',
      suggested_query: `${query} tutorial example`
    };
  }
  
  return {
    try_also: 'search_examples',
    reason: 'For complete tutorials and working implementations',
    suggested_query: `${query.split(' ')[0]} tutorial example`
  };
}

// Search modules with text method using rich metadata
async function searchModulesWithText(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  query: string,
  limit: number = 10
): Promise<CodeResult[]> {
  
  // Detect and expand acronyms for better search
  const queryWords = query.toLowerCase().split(/\s+/);
  const detectedAcronyms: { [key: string]: string } = {};
  const expandedTerms: string[] = [];
  
  for (const word of queryWords) {
    const upperWord = word.toUpperCase();
    expandedTerms.push(word);
    if ((acronymMappings as any)[upperWord]) {
      const mapping = (acronymMappings as any)[upperWord];
      detectedAcronyms[upperWord] = mapping.full;
      expandedTerms.push(mapping.full.toLowerCase());
    }
  }
  
  const expandedQuery = expandedTerms.join(' ');
  const tableName = repository === 'flopy' ? 'flopy_modules' : 'pyemu_modules';
  
  try {
    const results = await sql`
      SELECT 
        relative_path as filepath,
        ${repository} as repo_name,
        'https://github.com/modflowpy/' || ${repository} || '/blob/develop/' || relative_path as github_url,
        semantic_purpose as title,
        semantic_purpose as summary,
        package_code,
        model_family,
        category,
        string_to_array(coalesce(related_concepts, ''), ',') as key_concepts,
        string_to_array(coalesce(user_scenarios, ''), ',') as usage_examples,
        null as parameters,
        ts_rank_cd(
          to_tsvector('english', 
            coalesce(semantic_purpose, '') || ' ' ||
            coalesce(package_code, '') || ' ' ||
            coalesce(model_family, '') || ' ' ||
            coalesce(related_concepts, '') || ' ' ||
            coalesce(user_scenarios, '') || ' ' ||
            coalesce(embedding_text, '')
          ),
          plainto_tsquery('english', ${expandedQuery}),
          32 | 16 | 8 | 4
        ) as search_rank,
        ts_headline('english', 
          coalesce(semantic_purpose, '') || ' ' || coalesce(embedding_text, ''),
          plainto_tsquery('english', ${query}),
          'MaxWords=20, MinWords=10'
        ) as snippet,
        'modules' as search_source
      FROM ${sql(tableName)}
      WHERE to_tsvector('english', 
        coalesce(semantic_purpose, '') || ' ' ||
        coalesce(package_code, '') || ' ' ||
        coalesce(model_family, '') || ' ' ||
        coalesce(related_concepts, '') || ' ' ||
        coalesce(user_scenarios, '') || ' ' ||
        coalesce(embedding_text, '')
      ) @@ plainto_tsquery('english', ${expandedQuery})
      ORDER BY search_rank DESC
      LIMIT ${limit}
    `;
    
    return Array.isArray(results) ? results : [];
    
  } catch (error) {
    console.warn(`[SEARCH CODE TEXT] Error searching ${tableName}:`, error);
    return [];
  }
}

// Search modules with semantic method using embeddings (FIXED VERSION)
async function searchModulesWithEmbeddings(
  sql: NeonQueryFunction<false, false>,
  repository: string,
  queryEmbedding: number[],
  limit: number = 10
): Promise<CodeResult[]> {
  
  // Use the working vector search approach with JSON.stringify and template literals
  const embeddingString = JSON.stringify(queryEmbedding);
  const tableName = repository === 'flopy' ? 'flopy_modules' : 'pyemu_modules';
  
  try {
    const results = await sql`
      SELECT 
        relative_path as filepath,
        ${repository} as repo_name,
        'https://github.com/modflowpy/' || ${repository} || '/blob/develop/' || relative_path as github_url,
        semantic_purpose as title,
        semantic_purpose as summary,
        package_code,
        model_family,
        category,
        string_to_array(coalesce(related_concepts, ''), ',') as key_concepts,
        string_to_array(coalesce(user_scenarios, ''), ',') as usage_examples,
        null as parameters,
        1 - (embedding <=> ${embeddingString}::vector(1536)) as similarity_score,
        ts_headline('english', 
          coalesce(embedding_text, ''),
          plainto_tsquery('english', 'code'),
          'MaxWords=20, MinWords=10'
        ) as snippet,
        'modules' as search_source
      FROM ${sql(tableName)}
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingString}::vector(1536)
      LIMIT ${limit}
    `;
    
    return Array.isArray(results) ? results : [];
    
  } catch (error) {
    console.warn(`[SEARCH CODE EMBEDDINGS] Error searching ${tableName}:`, error);
    return [];
  }
}

export async function searchCode(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { query, repository, limit = 10, search_type = 'auto' } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new Error('Limit must be between 1 and 50');
    }

    const method = selectSearchMethod(query, search_type);
    console.log(`[SEARCH CODE] Query: "${query}", Repository: ${repository || 'all'}, Method: ${method}`);

    // Detect and expand acronyms
    const queryWords = query.trim().split(/\s+/);
    const detectedAcronyms: { [key: string]: string } = {};
    
    for (const word of queryWords) {
      const upperWord = word.toUpperCase();
      if ((acronymMappings as any)[upperWord]) {
        const mapping = (acronymMappings as any)[upperWord];
        detectedAcronyms[upperWord] = mapping.full;
      }
    }

    let results: CodeResult[] = [];

    if (method === 'semantic') {
      // Generate embedding for semantic search
      let queryEmbedding: number[] | null = null;
      
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: query,
            model: 'text-embedding-3-small'
          })
        });
        
        if (openaiResponse.ok) {
          const embeddingResult: any = await openaiResponse.json();
          queryEmbedding = embeddingResult.data[0].embedding;
        }
      } catch (error) {
        console.warn(`[SEARCH CODE] OpenAI API error, falling back to text search:`, error);
      }

      if (queryEmbedding) {
        if (repository) {
          if (['flopy', 'pyemu'].includes(repository)) {
            results = await searchModulesWithEmbeddings(sql, repository, queryEmbedding, limit);
          }
        } else {
          // Search both FloPy and PyEMU modules
          const [flopyResults, pyemuResults] = await Promise.all([
            searchModulesWithEmbeddings(sql, 'flopy', queryEmbedding, Math.ceil(limit / 2)),
            searchModulesWithEmbeddings(sql, 'pyemu', queryEmbedding, Math.floor(limit / 2))
          ]);
          
          results = [...flopyResults, ...pyemuResults]
            .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
            .slice(0, limit);
        }
      }
      
      // Fall back to text search if semantic search failed or returned no results
      if (!queryEmbedding || results.length === 0) {
        console.log(`[SEARCH CODE] Falling back to text search`);
        method = 'text' as any; // Update method for response metadata
      }
    }

    if (method === 'text' || results.length === 0) {
      if (repository) {
        if (['flopy', 'pyemu'].includes(repository)) {
          results = await searchModulesWithText(sql, repository, query, limit);
        }
      } else {
        // Search both FloPy and PyEMU modules
        const [flopyResults, pyemuResults] = await Promise.all([
          searchModulesWithText(sql, 'flopy', query, Math.ceil(limit / 2)),
          searchModulesWithText(sql, 'pyemu', query, Math.floor(limit / 2))
        ]);
        
        results = [...flopyResults, ...pyemuResults]
          .sort((a, b) => (b.search_rank || 0) - (a.search_rank || 0))
          .slice(0, limit);
      }
    }

    if (!results || results.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No code modules found for "${query}"${repository ? ` in ${repository}` : ''}`
        }]
      };
    }

    const response: CodeSearchResponse = {
      results,
      search_metadata: {
        method_used: method as 'text' | 'semantic' | 'hybrid',
        total_results: results.length,
        coverage: 'code',
        query_analyzed: query,
        ...(Object.keys(detectedAcronyms).length > 0 && { acronyms_detected: detectedAcronyms })
      },
      recommendations: generateRecommendations(query, results, method)
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(response, null, 2)
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