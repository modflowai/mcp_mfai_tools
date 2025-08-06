/**
 * Search Code Tool  
 * Searches for API details, function signatures, parameter lists, class definitions, and implementation specifics
 * Focuses on module tables (flopy_modules, pyemu_modules) with detailed API information
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchCodeSchema = {
  name: "search_code",
  description: `
    Search for API details, function signatures, parameter lists, class definitions, and implementation specifics across MODFLOW/PEST code modules.
    
    Use when user wants:
    - API details and function signatures
    - Parameter lists and types
    - Class definitions and methods
    - Implementation specifics
    - Code structure and organization
    - Programming interface documentation
    
    Searches FloPy/PyEMU module collections with rich metadata including packages, model families, categories, and detailed code analysis.
    Available repositories: flopy, pyemu (modules), other repos search documentation for code references.
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for code modules and API details',
      },
      search_type: {
        type: 'string',
        enum: ['text', 'semantic', 'auto'],
        description: 'Search method: text for exact API matching, semantic for conceptual similarity, auto for intelligent selection',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, mf6, pest, pestpp, pest_hp, mfusg, plproc, gwutils',
      },
      package_code: {
        type: 'string',
        description: 'Filter by FloPy package code (WEL, RIV, GHB, MAW, etc.)',
      },
      model_family: {
        type: 'string',
        description: 'Filter by FloPy model family (mf6, mfusg, mt3d, etc.)',
      },
      category: {
        type: 'string',
        description: 'Filter by PyEMU category (core, utils, etc.)',
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
  };
  recommendations?: {
    try_also?: string;
    reason?: string;
    suggested_query?: string;
  };
}

// Intelligent search method selection for code
function selectSearchMethod(query: string, searchType: string): 'text' | 'semantic' | 'hybrid' {
  if (searchType === 'text') return 'text';
  if (searchType === 'semantic') return 'semantic';
  
  // Auto-selection based on query characteristics
  const hasExactAPI = /\b(\.|\(|\)|def |class |import |from )\b/.test(query);
  const hasPackageName = /\b(wel|riv|ghb|maw|uzf|sfr|lak|drn|evt|rch|bcf|lpf|hfb)\b/i.test(query);
  const hasQuotes = /["'].*["']/.test(query);
  const isConceptual = /\b(similar|like|related|concept|approach)\b/i.test(query);
  
  if (hasExactAPI || hasQuotes || hasPackageName) return 'text';
  if (isConceptual) return 'semantic';
  return 'hybrid';
}

// Generate smart recommendations for code search
function generateRecommendations(query: string, results: CodeResult[], method: string): CodeSearchResponse['recommendations'] {
  const hasPackageResults = results.some(r => r.package_code);
  const hasParameters = results.some(r => r.parameters?.length);
  const isGeneralQuery = !(/\b(parameter|function|method|class|constructor)\b/i.test(query));
  
  if (hasPackageResults && isGeneralQuery) {
    const packageName = results.find(r => r.package_code)?.package_code;
    return {
      try_also: 'search_examples',
      reason: 'For complete tutorials and working implementations',
      suggested_query: `${packageName || query.split(' ')[0]} package tutorial example`
    };
  }
  
  if (!hasParameters && results.length > 0) {
    return {
      try_also: 'search_documentation',
      reason: 'For mathematical theory and conceptual background',
      suggested_query: `${query} mathematical formulation theory`
    };
  }
  
  return undefined;
}

// Search modules with text method
async function searchModulesWithText(
  query: string, 
  sql: NeonQueryFunction<false, false>, 
  repository?: string, 
  packageCode?: string,
  modelFamily?: string,
  category?: string,
  limit: number = 10
) {
  const repositories = repository ? [repository] : ['flopy', 'pyemu'];
  const moduleRepos = repositories.filter(r => ['flopy', 'pyemu'].includes(r));
  
  if (moduleRepos.length === 0) return [];
  
  const moduleQueries = moduleRepos.map(repo => {
    const tableName = `${repo}_modules`;
    let filters = '';
    const params: any[] = [query];
    
    if (packageCode) {
      params.push(packageCode.toUpperCase());
      filters += ` AND upper(fm.package_code) = $${params.length}`;
    }
    if (modelFamily && repo === 'flopy') {
      params.push(modelFamily.toLowerCase());
      filters += ` AND lower(fm.model_family) = $${params.length}`;
    }
    if (category && repo === 'pyemu') {
      params.push(category.toLowerCase());
      filters += ` AND lower(fm.category) = $${params.length}`;
    }
    
    params.push(limit);
    
    return sql`
      SELECT 
        fm.filepath,
        '${repo}' as repo_name,
        fm.analysis->>'title' as title,
        fm.analysis->>'summary' as summary,
        fm.package_code,
        fm.model_family,
        fm.category,
        fm.key_concepts,
        fm.usage_examples,
        fm.parameters,
        ts_rank_cd(
          to_tsvector('english', 
            coalesce(fm.analysis->>'title', '') || ' ' ||
            coalesce(fm.analysis->>'summary', '') || ' ' ||
            coalesce(fm.package_code, '') || ' ' ||
            array_to_string(fm.key_concepts, ' ') || ' ' ||
            array_to_string(fm.parameters, ' ')
          ),
          plainto_tsquery('english', ${query})
        ) as search_rank,
        ts_headline('english',
          coalesce(fm.analysis->>'summary', ''),
          plainto_tsquery('english', ${query}),
          'MaxWords=25, MinWords=15, MaxFragments=1'
        ) as snippet,
        'modules' as search_source
      FROM ${tableName} fm
      WHERE to_tsvector('english', 
        coalesce(fm.analysis->>'title', '') || ' ' ||
        coalesce(fm.analysis->>'summary', '') || ' ' ||
        coalesce(fm.package_code, '') || ' ' ||
        array_to_string(fm.key_concepts, ' ') || ' ' ||
        array_to_string(fm.parameters, ' ')
      ) @@ plainto_tsquery('english', ${query})
      ${packageCode ? `AND upper(fm.package_code) = '${packageCode.toUpperCase()}'` : ''}
      ${modelFamily && repo === 'flopy' ? `AND lower(fm.model_family) = '${modelFamily.toLowerCase()}'` : ''}
      ${category && repo === 'pyemu' ? `AND lower(fm.category) = '${category.toLowerCase()}'` : ''}
      ORDER BY search_rank DESC
      LIMIT ${limit}
    `.execute();
  });
  
  const results = await Promise.all(moduleQueries);
  return results.flat().sort((a: any, b: any) => (b.search_rank || 0) - (a.search_rank || 0));
}

// Search documentation for code references
async function searchDocumentationCode(query: string, sql: NeonQueryFunction<false, false>, repository?: string, limit: number = 5) {
  const repositories = repository ? [repository] : ['mf6', 'pest', 'pestpp', 'pest_hp', 'mfusg', 'plproc', 'gwutils'];
  const docRepos = repositories.filter(r => !['flopy', 'pyemu'].includes(r));
  
  if (docRepos.length === 0) return [];
  
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
        'MaxWords=25, MinWords=15, MaxFragments=1'
      ) as snippet,
      'documentation' as search_source
    FROM repository_files rf
    WHERE rf.repo_name = ANY(${docRepos})
    AND (
      lower(rf.content) LIKE '%' || lower(${query}) || '%'
      OR to_tsvector('english', rf.content) @@ plainto_tsquery('english', ${query})
    )
    AND (
      rf.file_type IN ('py', 'f90', 'f', 'c', 'cpp', 'h')
      OR lower(rf.filepath) LIKE '%api%'
      OR lower(rf.filepath) LIKE '%reference%'
      OR lower(rf.analysis->>'title') LIKE '%api%'
    )
    ORDER BY search_rank DESC
    LIMIT ${limit}
  `.execute();
}

// Search modules with semantic method
async function searchModulesWithEmbeddings(
  query: string, 
  sql: NeonQueryFunction<false, false>, 
  repository?: string,
  packageCode?: string,
  modelFamily?: string, 
  category?: string,
  limit: number = 10
) {
  // For now, fall back to enhanced text search
  // TODO: Implement true embedding search when embeddings are available for modules
  const results = await searchModulesWithText(query, sql, repository, packageCode, modelFamily, category, limit);
  
  // Add similarity scores based on text ranking
  return results.map((result: any) => ({
    ...result,
    similarity_score: result.search_rank || 0
  }));
}

export async function searchCode(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    // Handle both direct args and potentially wrapped args
    const actualArgs = args || {};
    
    const { 
      query, 
      search_type = 'auto', 
      repository, 
      package_code, 
      model_family, 
      category, 
      limit = 10 
    } = actualArgs;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit && (limit < 1 || limit > 50)) {
      throw new Error('Limit must be between 1 and 50');
    }

    const method = selectSearchMethod(query, search_type);
    const moduleLimit = Math.floor(limit * 0.85); // 85% modules
    const docLimit = Math.ceil(limit * 0.15); // 15% documentation
    
    console.log(`[SEARCH CODE] Query: "${query}", Method: ${method}, Repository: ${repository || 'all'}, Package: ${package_code || 'any'}`);

    let moduleResults: CodeResult[] = [];
    let docResults: CodeResult[] = [];
    
    if (method === 'semantic') {
      moduleResults = await searchModulesWithEmbeddings(query, sql, repository, package_code, model_family, category, moduleLimit);
    } else if (method === 'text') {
      moduleResults = await searchModulesWithText(query, sql, repository, package_code, model_family, category, moduleLimit);
    } else {
      // Hybrid: combine both methods
      const semanticResults = await searchModulesWithEmbeddings(query, sql, repository, package_code, model_family, category, Math.ceil(moduleLimit / 2));
      const textResults = await searchModulesWithText(query, sql, repository, package_code, model_family, category, Math.ceil(moduleLimit / 2));
      
      // Merge and deduplicate
      const seen = new Set();
      moduleResults = [...semanticResults, ...textResults].filter((result: any) => {
        const key = `${result.repo_name}:${result.filepath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    
    // Add documentation code references if not module-specific or if targeting doc repos
    if (!repository || !['flopy', 'pyemu'].includes(repository)) {
      docResults = await searchDocumentationCode(query, sql, repository, docLimit);
    }
    
    // Combine and rank results
    const allResults = [...moduleResults, ...docResults]
      .sort((a, b) => (b.similarity_score || b.search_rank || 0) - (a.similarity_score || a.search_rank || 0))
      .slice(0, limit);

    const recommendations = generateRecommendations(query, allResults, method);

    const response: CodeSearchResponse = {
      results: allResults,
      search_metadata: {
        method_used: method,
        total_results: allResults.length,
        coverage: 'code',
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
    console.error('[SEARCH CODE] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}