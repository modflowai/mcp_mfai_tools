/**
 * Simple Code Search Tool - Based on working text-search.ts approach
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Helper functions for Phase 1.2: Enhanced formatting
function formatArrayItems(
  items: string[], 
  maxItems: number, 
  maxSnippetLength: number, 
  title: string,
  compact: boolean = false
): string {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return '';
  }
  
  let output = compact ? `   ${title}: ` : `   ${title}:\n`;
  const displayItems = items.slice(0, maxItems);
  
  if (compact) {
    // Compact format: "Title: item1 | item2 | item3..."
    const compactItems = displayItems.map(item => 
      item.substring(0, Math.min(maxSnippetLength, 80)).replace(/\n/g, ' ')
    );
    output += compactItems.join(' | ');
    if (items.length > maxItems) {
      output += ` | ... and ${items.length - maxItems} more`;
    }
    output += '\n';
  } else {
    // Full format: numbered list with proper truncation
    displayItems.forEach((item, i) => {
      const truncated = item.length > maxSnippetLength 
        ? item.substring(0, maxSnippetLength) + '...' 
        : item;
      output += `     ${i + 1}. ${truncated}\n`;
    });
    if (items.length > maxItems) {
      output += `     ... and ${items.length - maxItems} more\n`;
    }
  }
  
  return output;
}

function validateGitHubUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'github.com' && parsedUrl.pathname.includes('/');
  } catch {
    return false;
  }
}

function formatSourceCode(sourceSnippet: string, maxLength: number = 500): string {
  if (!sourceSnippet) return '';
  
  const truncated = sourceSnippet.length > maxLength
    ? sourceSnippet.substring(0, maxLength) + '\n...'
    : sourceSnippet;
    
  return `   Source Code:\n\`\`\`python\n${truncated}\n\`\`\`\n`;
}

// Phase 2: Search strategy helper functions
async function executeSearchStrategy(
  sql: NeonQueryFunction<false, false>,
  searchStrategy: string,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: {
    include_github: boolean;
    include_scenarios: boolean;
    include_concepts: boolean;
    include_errors: boolean;
    include_pest: boolean;
    include_source: boolean;
  }
): Promise<any[]> {
  console.log(`[SEARCH CODE] Using search strategy: ${searchStrategy}`);
  
  switch (searchStrategy) {
    case 'package':
      return await executePackageSearch(sql, searchTerm, repository, limit, includeOptions);
    case 'error':
      return await executeErrorSearch(sql, searchTerm, repository, limit, includeOptions);
    case 'usage':
      return await executeUsageSearch(sql, searchTerm, repository, limit, includeOptions);
    case 'concept':
      return await executeConceptSearch(sql, searchTerm, repository, limit, includeOptions);
    case 'general':
    default:
      return await executeGeneralSearch(sql, searchTerm, repository, limit, includeOptions);
  }
}

async function executeGeneralSearch(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: any
): Promise<any[]> {
  // This is the existing search logic (current behavior)
  let results: any[] = [];
  let debugInfo: string[] = [];
  
  // Search flopy_modules (existing logic)
  if (!repository || repository === 'flopy') {
    const flopQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions);
    debugInfo.push(`FloPy general query: ${flopQuery}`);
    console.log('[SEARCH CODE] FloPy query (general):', flopQuery);
    const flopResults = await sql.query(flopQuery, [searchTerm]);
    debugInfo.push(`FloPy general results: ${flopResults?.length || 0}`);
    console.log('[SEARCH CODE] FloPy results count (general):', flopResults?.length || 0);
    results.push(...flopResults);
  }
  
  // Search pyemu_modules (existing logic) - but note: general search doesn't use ILIKE for arrays
  if (!repository || repository === 'pyemu') {
    const pyemuQuery = buildPyemuQuery(searchTerm, Math.ceil(limit / 2), includeOptions);
    debugInfo.push(`PyEMU general query: ${pyemuQuery}`);
    console.log('[SEARCH CODE] PyEMU query (general):', pyemuQuery);
    const pyemuResults = await sql.query(pyemuQuery, [searchTerm]);
    debugInfo.push(`PyEMU general results: ${pyemuResults?.length || 0}`);
    console.log('[SEARCH CODE] PyEMU results count (general):', pyemuResults?.length || 0);
    results.push(...pyemuResults);
  }
  
  // Store debug info in results for output
  if (results.length > 0) {
    results[0]._debug_general = debugInfo;
  } else {
    results.push({ _debug_general: debugInfo, _debug_only: true });
  }
  
  return results;
}

async function executePackageSearch(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: any
): Promise<any[]> {
  // Strategy: Exact package code matching first, then general search
  let results: any[] = [];
  
  if (!repository || repository === 'flopy') {
    // Try exact package code match first
    const exactPackageQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions, true);
    console.log('[SEARCH CODE] FloPy exact package query:', exactPackageQuery);
    const exactResults = await sql.query(exactPackageQuery, [searchTerm.toUpperCase()]);
    console.log('[SEARCH CODE] Exact package results:', exactResults?.length || 0);
    results.push(...exactResults);
    
    // If no exact matches, fall back to general search
    if (exactResults.length === 0) {
      const generalQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions);
      const generalResults = await sql.query(generalQuery, [searchTerm]);
      results.push(...generalResults);
    }
  }
  
  // PyEMU doesn't have package codes, so use general search
  if (!repository || repository === 'pyemu') {
    const pyemuQuery = buildPyemuQuery(searchTerm, Math.ceil(limit / 2), includeOptions);
    const pyemuResults = await sql.query(pyemuQuery, [searchTerm]);
    results.push(...pyemuResults);
  }
  
  return results;
}

async function executeErrorSearch(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: any
): Promise<any[]> {
  // Strategy: Search error arrays first, then general search
  let results: any[] = [];
  
  if (!repository || repository === 'flopy') {
    const errorQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions, false, 'error');
    console.log('[SEARCH CODE] FloPy error-focused query:', errorQuery);
    const errorResults = await sql.query(errorQuery, [searchTerm]);
    console.log('[SEARCH CODE] Error-focused results:', errorResults?.length || 0);
    results.push(...errorResults);
  }
  
  if (!repository || repository === 'pyemu') {
    const pyemuErrorQuery = buildPyemuQuery(searchTerm, Math.ceil(limit / 2), includeOptions, 'error');
    const flexiblePattern = `%${searchTerm.replace(/\s*&\s*/g, '%').replace(/\s+/g, '%')}%`;
    const pyemuErrorResults = await sql.query(pyemuErrorQuery, [searchTerm, flexiblePattern]);
    results.push(...pyemuErrorResults);
  }
  
  return results;
}

async function executeUsageSearch(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: any
): Promise<any[]> {
  // Strategy: Search usage/scenario arrays first
  let results: any[] = [];
  
  if (!repository || repository === 'flopy') {
    const usageQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions, false, 'usage');
    const usageResults = await sql.query(usageQuery, [searchTerm]);
    results.push(...usageResults);
  }
  
  if (!repository || repository === 'pyemu') {
    const pyemuUsageQuery = buildPyemuQuery(searchTerm, Math.ceil(limit / 2), includeOptions, 'usage');
    const flexiblePattern = `%${searchTerm.replace(/\s*&\s*/g, '%').replace(/\s+/g, '%')}%`;
    const pyemuUsageResults = await sql.query(pyemuUsageQuery, [searchTerm, flexiblePattern]);
    results.push(...pyemuUsageResults);
  }
  
  return results;
}

async function executeConceptSearch(
  sql: NeonQueryFunction<false, false>,
  searchTerm: string,
  repository: string | undefined,
  limit: number,
  includeOptions: any
): Promise<any[]> {
  // Strategy: Search concept arrays first
  let results: any[] = [];
  let debugInfo: string[] = [];
  
  if (!repository || repository === 'flopy') {
    const conceptQuery = buildFloepyQuery(searchTerm, Math.ceil(limit / 2), includeOptions, false, 'concept');
    debugInfo.push(`FloPy concept query: ${conceptQuery}`);
    const conceptResults = await sql.query(conceptQuery, [searchTerm]);
    debugInfo.push(`FloPy concept results: ${conceptResults?.length || 0}`);
    results.push(...conceptResults);
  }
  
  if (!repository || repository === 'pyemu') {
    const pyemuConceptQuery = buildPyemuQuery(searchTerm, Math.ceil(limit / 2), includeOptions, 'concept');
    debugInfo.push(`PyEMU concept query: ${pyemuConceptQuery}`);
    
    // Create flexible search pattern for arrays (e.g., "first order" -> "%first%order%")
    const flexiblePattern = `%${searchTerm.replace(/\s*&\s*/g, '%').replace(/\s+/g, '%')}%`;
    const pyemuConceptResults = await sql.query(pyemuConceptQuery, [searchTerm, flexiblePattern]);
    debugInfo.push(`PyEMU concept results: ${pyemuConceptResults?.length || 0}`);
    debugInfo.push(`Flexible pattern used: ${flexiblePattern}`);
    results.push(...pyemuConceptResults);
  }
  
  // Store debug info in results for output
  if (results.length > 0) {
    results[0]._debug_concept = debugInfo;
  } else {
    results.push({ _debug_concept: debugInfo, _debug_only: true });
  }
  
  return results;
}

function buildFloepyQuery(
  searchTerm: string,
  limit: number,
  includeOptions: any,
  exactPackage: boolean = false,
  searchFocus: string = 'general'
): string {
  const { include_github, include_scenarios, include_concepts, include_errors, include_source } = includeOptions;
  
  let whereClause;
  let orderClause;
  
  if (exactPackage) {
    // Exact package code matching
    whereClause = `WHERE UPPER(package_code) = $1`;
    orderClause = `ORDER BY package_code, module_name`;
  } else if (searchFocus === 'error') {
    // Focus on error arrays
    whereClause = `WHERE (
      to_tsvector('english', array_to_string(typical_errors, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN to_tsvector('english', array_to_string(typical_errors, ' ')) @@ to_tsquery('english', $1) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else if (searchFocus === 'usage') {
    // Focus on usage/scenario arrays
    whereClause = `WHERE (
      to_tsvector('english', array_to_string(user_scenarios, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN to_tsvector('english', array_to_string(user_scenarios, ' ')) @@ to_tsquery('english', $1) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else if (searchFocus === 'concept') {
    // Focus on concept arrays
    whereClause = `WHERE (
      to_tsvector('english', array_to_string(related_concepts, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN to_tsvector('english', array_to_string(related_concepts, ' ')) @@ to_tsquery('english', $1) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else {
    // General search (existing behavior)
    whereClause = `WHERE search_vector @@ to_tsquery('english', $1)`;
    orderClause = `ORDER BY ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  }

  return `
    SELECT 
      relative_path as filepath,
      'flopy' as repo_name,
      module_name,
      package_code,
      model_family,
      semantic_purpose as title,
      ${include_github ? 'github_url,' : 'NULL as github_url,'}
      ${include_scenarios ? 'user_scenarios,' : 'NULL as user_scenarios,'}
      ${include_concepts ? 'related_concepts,' : 'NULL as related_concepts,'}
      ${include_errors ? 'typical_errors,' : 'NULL as typical_errors,'}
      ${include_source ? 'LEFT(source_code, 500) as source_snippet,' : 'NULL as source_snippet,'}
      ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
      'modules' as search_source
    FROM flopy_modules
    ${whereClause}
    ${orderClause}
    LIMIT ${limit}
  `;
}

function buildPyemuQuery(
  searchTerm: string,
  limit: number,
  includeOptions: any,
  searchFocus: string = 'general'
): string {
  const { include_github, include_scenarios, include_concepts, include_errors, include_pest, include_source } = includeOptions;
  
  let whereClause;
  let orderClause;
  
  if (searchFocus === 'error') {
    // Focus on error/pitfall arrays - use flexible ILIKE matching  
    whereClause = `WHERE (
      array_to_string(common_pitfalls, ' ') ILIKE $2
      OR to_tsvector('english', array_to_string(common_pitfalls, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN (
        array_to_string(common_pitfalls, ' ') ILIKE $2
        OR to_tsvector('english', array_to_string(common_pitfalls, ' ')) @@ to_tsquery('english', $1)
      ) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else if (searchFocus === 'usage') {
    // Focus on use case arrays - use flexible ILIKE matching
    whereClause = `WHERE (
      array_to_string(use_cases, ' ') ILIKE $2
      OR to_tsvector('english', array_to_string(use_cases, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN (
        array_to_string(use_cases, ' ') ILIKE $2
        OR to_tsvector('english', array_to_string(use_cases, ' ')) @@ to_tsquery('english', $1)
      ) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else if (searchFocus === 'concept') {
    // Focus on statistical concept arrays - use flexible ILIKE matching
    whereClause = `WHERE (
      array_to_string(statistical_concepts, ' ') ILIKE $2
      OR to_tsvector('english', array_to_string(statistical_concepts, ' ')) @@ to_tsquery('english', $1)
      OR search_vector @@ to_tsquery('english', $1)
    )`;
    orderClause = `ORDER BY 
      CASE WHEN (
        array_to_string(statistical_concepts, ' ') ILIKE $2
        OR to_tsvector('english', array_to_string(statistical_concepts, ' ')) @@ to_tsquery('english', $1)
      ) THEN 2.0 ELSE 1.0 END * 
      ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  } else {
    // General search (existing behavior)
    whereClause = `WHERE search_vector @@ to_tsquery('english', $1)`;
    orderClause = `ORDER BY ts_rank_cd(search_vector, to_tsquery('english', $1)) DESC`;
  }

  return `
    SELECT 
      relative_path as filepath,
      'pyemu' as repo_name,
      module_name,
      NULL as package_code,
      NULL as model_family,
      category,
      semantic_purpose as title,
      ${include_github ? 'github_url,' : 'NULL as github_url,'}
      ${include_scenarios ? 'use_cases,' : 'NULL as use_cases,'}
      ${include_concepts ? 'statistical_concepts,' : 'NULL as statistical_concepts,'}
      ${include_errors ? 'common_pitfalls,' : 'NULL as common_pitfalls,'}
      ${include_pest ? 'pest_integration,' : 'NULL as pest_integration,'}
      ${include_source ? 'LEFT(source_code, 500) as source_snippet,' : 'NULL as source_snippet,'}
      ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
      'modules' as search_source
    FROM pyemu_modules
    ${whereClause}
    ${orderClause}
    LIMIT ${limit}
  `;
}

export const searchCodeSchema = {
  name: "search_code",
  description: `
    Advanced code search for MODFLOW/PEST APIs, functions, classes, and implementations.
    
    Searches through rich metadata including:
    - Full source code with function/class definitions
    - Module docstrings and semantic descriptions
    - Package codes (WEL, BCF, CLN, etc.) and model families
    - Related concepts and real-world usage scenarios
    
    Smart multi-stage search:
    - Exact package/function matching
    - Rich metadata text search
    - Source code pattern detection
    - Workflow cross-references
    
    Use for finding:
    - Specific functions or classes (def/class patterns)
    - Package implementations (WEL, RCH, etc.)
    - API signatures and parameters
    - Usage examples and scenarios
    - Related modules and workflows
    
    Repositories: flopy, pyemu (modules + workflows)
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (functions, classes, packages, concepts)',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, or omit for all',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-50, default: 10)',
      },
      // Phase 1: Display options
      include_scenarios: {
        type: 'boolean',
        description: 'Include user scenarios and use cases (default: false)',
      },
      include_concepts: {
        type: 'boolean',
        description: 'Include related concepts and statistical concepts (default: false)',
      },
      include_errors: {
        type: 'boolean',
        description: 'Include typical errors and common pitfalls (default: false)',
      },
      include_pest: {
        type: 'boolean',
        description: 'Include PEST integration details (default: false)',
      },
      include_source: {
        type: 'boolean',
        description: 'Include source code snippets (default: false)',
      },
      include_github: {
        type: 'boolean',
        description: 'Include GitHub URLs (default: true)',
      },
      // Phase 1.2: Enhanced formatting options
      max_array_items: {
        type: 'number',
        description: 'Maximum array items to display (1-10, default: 3)',
      },
      snippet_length: {
        type: 'number', 
        description: 'Maximum length for array item snippets (50-300, default: 150)',
      },
      compact_format: {
        type: 'boolean',
        description: 'Use compact formatting for results (default: false)',
      },
      // Phase 2: Search strategy options
      search_type: {
        type: 'string',
        enum: ['general', 'package', 'error', 'usage', 'concept'],
        description: 'Search strategy: general (default), package (exact codes), error (troubleshooting), usage (scenarios), concept (theory)',
      },
    },
    required: ['query'],
  }
};

export async function searchCode(
  args: any, 
  sql: NeonQueryFunction<false, false>
) {
  try {
    const { 
      query, 
      repository, 
      limit = 10,
      include_scenarios = false,
      include_concepts = false,
      include_errors = false,
      include_pest = false,
      include_source = false,
      include_github = true,
      // Phase 1.2: Enhanced formatting options
      max_array_items = 3,
      snippet_length = 150,
      compact_format = false,
      // Phase 2: Search strategy options
      search_type = 'general'
    } = args;

    // Validate formatting parameters
    const maxItems = Math.min(Math.max(max_array_items || 3, 1), 10);
    const maxSnippetLength = Math.min(Math.max(snippet_length || 150, 50), 300);
    
    // Validate search type parameter
    const validSearchTypes = ['general', 'package', 'error', 'usage', 'concept'];
    const searchStrategy = validSearchTypes.includes(search_type) ? search_type : 'general';

    console.log('[SEARCH CODE] Args received:', JSON.stringify({
      query,
      repository,
      limit,
      include_scenarios,
      include_concepts,
      include_errors,
      include_pest,
      include_source,
      include_github,
      max_array_items: maxItems,
      snippet_length: maxSnippetLength,
      compact_format,
      search_type: searchStrategy
    }));

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    const searchTerm = query.trim().replace(/[^\w\s]/g, '').split(/\s+/).join(' & ');
    console.log('[SEARCH CODE] Processed search term:', searchTerm);
    
    // Phase 2: Execute search using selected strategy
    const includeOptions = {
      include_github,
      include_scenarios, 
      include_concepts,
      include_errors,
      include_pest,
      include_source
    };
    
    let results = await executeSearchStrategy(
      sql,
      searchStrategy,
      searchTerm,
      repository,
      limit,
      includeOptions
    );

    // Sort by relevance and filter out debug-only entries
    const displayResults = results.filter(r => !r._debug_only);
    displayResults.sort((a, b) => b.relevance_score - a.relevance_score);
    const finalResults = displayResults.slice(0, limit);
    
    console.log('[SEARCH CODE] Final results count:', finalResults.length);

    // Format output with enhanced metadata formatting
    let output = `Found ${finalResults.length} code modules for "${query}"\n\n`;
    
    finalResults.forEach((result, index) => {
      const resultPrefix = compact_format ? `${index + 1}. ` : `${index + 1}. `;
      output += `${resultPrefix}**${result.filepath}** (${result.repo_name})\n`;
      
      // Basic metadata - use compact format if requested
      const metadataItems = [];
      if (result.module_name) metadataItems.push(`Module: ${result.module_name}`);
      if (result.package_code) metadataItems.push(`Package: ${result.package_code}`);
      if (result.model_family) metadataItems.push(`Model: ${result.model_family}`);
      if (result.category) metadataItems.push(`Category: ${result.category}`);
      
      if (compact_format && metadataItems.length > 0) {
        output += `   ${metadataItems.join(' | ')}\n`;
      } else {
        metadataItems.forEach(item => output += `   ${item}\n`);
      }
      
      if (result.title) {
        const purposeText = result.title.substring(0, compact_format ? 100 : 200);
        output += `   Purpose: ${purposeText}${result.title.length > (compact_format ? 100 : 200) ? '...' : ''}\n`;
      }
      
      // GitHub URL with validation
      if (result.github_url && validateGitHubUrl(result.github_url)) {
        output += `   GitHub: ${result.github_url}\n`;
      }
      
      // Rich arrays - FloPy fields with enhanced formatting
      output += formatArrayItems(result.user_scenarios, maxItems, maxSnippetLength, 'User Scenarios', compact_format);
      output += formatArrayItems(result.related_concepts, maxItems, maxSnippetLength, 'Related Concepts', compact_format);
      output += formatArrayItems(result.typical_errors, maxItems, maxSnippetLength, 'Typical Errors', compact_format);
      
      // Rich arrays - PyEMU fields with enhanced formatting
      output += formatArrayItems(result.use_cases, maxItems, maxSnippetLength, 'Use Cases', compact_format);
      output += formatArrayItems(result.statistical_concepts, maxItems, maxSnippetLength, 'Statistical Concepts', compact_format);
      output += formatArrayItems(result.common_pitfalls, maxItems, maxSnippetLength, 'Common Pitfalls', compact_format);
      output += formatArrayItems(result.pest_integration, maxItems, maxSnippetLength, 'PEST Integration', compact_format);
      
      // Source code snippet with enhanced formatting
      if (result.source_snippet) {
        output += formatSourceCode(result.source_snippet, compact_format ? 300 : 500);
      }
      
      output += `   Relevance: ${result.relevance_score.toFixed(3)}\n\n`;
    });
    
    // Add enhanced debug information with SQL queries
    output += `\nDebug Info:\n`;
    output += `- Search term: "${searchTerm}"\n`;
    output += `- Repository: ${repository || 'all'}\n`;
    output += `- Search strategy: ${searchStrategy}\n`;
    output += `- Rich arrays requested: ${[
      include_scenarios && 'scenarios',
      include_concepts && 'concepts', 
      include_errors && 'errors',
      include_pest && 'pest',
      include_source && 'source',
      include_github && 'github'
    ].filter(Boolean).join(', ') || 'none'}\n`;
    output += `- Formatting: ${compact_format ? 'compact' : 'full'} (max ${maxItems} items, ${maxSnippetLength} chars)\n`;
    output += `- Results found: ${finalResults.length}/${limit}\n`;
    
    // Add strategy-specific debug information
    if (results.length > 0) {
      const debugResult = results.find(r => r._debug_concept || r._debug_general);
      if (debugResult?._debug_concept) {
        output += `\nCONCEPT STRATEGY DEBUG:\n`;
        debugResult._debug_concept.forEach((info: string, i: number) => {
          output += `${i + 1}. ${info}\n`;
        });
      }
      if (debugResult?._debug_general) {
        output += `\nGENERAL STRATEGY DEBUG:\n`;
        debugResult._debug_general.forEach((info: string, i: number) => {
          output += `${i + 1}. ${info}\n`;
        });
      }
    }

    return {
      content: [{
        type: "text" as const,
        text: output
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