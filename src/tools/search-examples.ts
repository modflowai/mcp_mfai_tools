/**
 * Search Examples Tool - Phase 3.1: Rich Array Search + Previous Features  
 * Phase 0: Basic search functionality
 * Phase 1.1: Display control options
 * Phase 1.2: Enhanced snippet display with ts_headline highlighting
 * Phase 2.1: Advanced filtering (model type, packages, complexity, workflow filtering)
 * Phase 3.1: Rich array search within array fields (best_use_cases, prerequisites, etc.)
 * Tables: flopy_workflows, pyemu_workflows
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchExamplesSchema = {
  name: "search_examples",
  description: `
    Search for tutorials, workflows, and working examples in FloPy and PyEMU.
    Supports filtering by model type, packages, complexity, and workflow type.
    Enhanced snippet highlighting with ts_headline for better search result display.
    Rich array search capability to find content within array fields (use cases, prerequisites, etc.).
    Searches ONLY workflow tables (flopy_workflows, pyemu_workflows).
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query for tutorials and examples',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, or omit for all',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-50, default: 10)',
      },
      
      // Phase 1: Display control options
      include_use_cases: {
        type: 'boolean',
        description: 'Include best_use_cases/common_applications (default: false)',
      },
      include_prerequisites: {
        type: 'boolean',
        description: 'Include prerequisites (default: false)',
      },
      include_modifications: {
        type: 'boolean',
        description: 'Include common_modifications (FloPy only, default: false)',
      },
      include_tips: {
        type: 'boolean',
        description: 'Include implementation_tips/best_practices (PyEMU only, default: false)',
      },
      include_purpose: {
        type: 'boolean',
        description: 'Include full workflow_purpose (can be long, default: false)',
      },
      include_tags: {
        type: 'boolean',
        description: 'Include tags (default: false)',
      },
      compact_arrays: {
        type: 'boolean',
        description: 'Show only first 2 items of arrays (default: false)',
      },
      
      // Phase 1.2: Enhanced snippet display
      include_snippet: {
        type: 'boolean',
        description: 'Show highlighted search snippets using ts_headline (default: false)',
      },
      snippet_length: {
        type: 'number',
        description: 'Maximum snippet length in characters (50-500, default: 200)',
      },
      snippet_source: {
        type: 'string',
        enum: ['description', 'purpose', 'both'],
        description: 'Which field to generate snippets from (default: description)',
      },
      
      // Phase 3.1: Rich array search
      search_arrays: {
        type: 'boolean',
        description: 'Include array fields in search (best_use_cases, prerequisites, etc.)',
      },
      array_fields: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific array fields to search: use_cases, prerequisites, modifications, tips, practices',
      },
      search_mode: {
        type: 'string',
        enum: ['title_first', 'arrays_first', 'balanced'],
        description: 'Search prioritization: title_first (default), arrays_first, or balanced',
      },
      
      // Phase 2: Filtering options
      model_type: {
        type: 'string',
        description: 'Filter by model type (mf6, mf6-gwf, mf2005, mt3d, mfnwt, modpath)',
      },
      packages: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by packages used (e.g., WEL, DIS, RCH)',
      },
      has_packages: {
        type: 'string',
        enum: ['any', 'all'],
        description: 'Match any or all specified packages (default: any)',
      },
      complexity: {
        type: 'string',
        enum: ['beginner', 'simple', 'intermediate', 'advanced'],
        description: 'Filter by complexity level',
      },
      workflow_type: {
        type: 'string',
        description: 'Filter by workflow type (PyEMU only)',
      },
      pest_concepts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by PEST concepts (PyEMU only)',
      },
      uncertainty_methods: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by uncertainty methods (PyEMU only)',
      },
    },
    required: ['query'],
  }
};

// Helper for boolean parameter parsing (MCP compatibility)
const parseBool = (value: any, defaultValue: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'false') return false;
    if (value.toLowerCase() === 'true') return true;
  }
  return defaultValue;
};

// Helper to format arrays with compact option
const formatArray = (items: any[], compact: boolean, maxItems: number = 5): string => {
  if (!items || !Array.isArray(items) || items.length === 0) return '';
  
  const displayItems = compact ? items.slice(0, 2) : items.slice(0, maxItems);
  let result = displayItems.map((item, i) => `     ${i + 1}. ${item}`).join('\n');
  
  if (items.length > displayItems.length) {
    result += `\n     ... and ${items.length - displayItems.length} more`;
  }
  
  return result;
};

// Helper to build array search conditions
const buildArraySearchConditions = (query: string, arrayFields: string[] | undefined, repositoryType: 'flopy' | 'pyemu'): string => {
  if (!arrayFields || arrayFields.length === 0) {
    // Default array fields for each repository
    if (repositoryType === 'flopy') {
      arrayFields = ['use_cases', 'prerequisites', 'modifications'];
    } else {
      arrayFields = ['use_cases', 'prerequisites', 'tips', 'practices'];
    }
  }
  
  const conditions = [];
  
  // Map user-friendly field names to actual database columns
  const fieldMapping: Record<string, string> = {
    'use_cases': repositoryType === 'flopy' ? 'best_use_cases' : 'common_applications',
    'prerequisites': 'prerequisites',
    'modifications': 'common_modifications', // FloPy only
    'tips': 'implementation_tips', // PyEMU only  
    'practices': 'best_practices' // PyEMU only
  };
  
  for (const field of arrayFields) {
    const dbColumn = fieldMapping[field];
    if (dbColumn) {
      // Only include valid fields for each repository
      if (repositoryType === 'flopy' && ['implementation_tips', 'best_practices'].includes(dbColumn)) {
        continue; // Skip PyEMU-only fields
      }
      if (repositoryType === 'pyemu' && dbColumn === 'common_modifications') {
        continue; // Skip FloPy-only fields
      }
      
      conditions.push(`EXISTS (
        SELECT 1 FROM unnest(${dbColumn}) AS array_item 
        WHERE array_item ILIKE '%' || $1 || '%'
      )`);
    }
  }
  
  return conditions.join(' OR ');
};

export async function searchExamples(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    // Parse array parameters that might come as JSON strings from MCP
    const parseArrayParam = (param: any): any[] | undefined => {
      if (!param) return undefined;
      if (Array.isArray(param)) return param;
      if (typeof param === 'string') {
        try {
          const parsed = JSON.parse(param);
          return Array.isArray(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };
    
    const { 
      query, 
      repository, 
      limit = 10,
      // Filtering parameters
      model_type,
      has_packages = 'any',
      complexity,
      workflow_type,
      // Snippet parameters
      snippet_source = 'description',
      // Array search parameters
      search_mode = 'title_first',
    } = args;
    
    // Parse array parameters
    const packages = parseArrayParam(args.packages);
    const pest_concepts = parseArrayParam(args.pest_concepts);
    const uncertainty_methods = parseArrayParam(args.uncertainty_methods);
    const array_fields = parseArrayParam(args.array_fields);
    
    // Parse display options with MCP boolean compatibility
    const include_use_cases = parseBool(args.include_use_cases, false);
    const include_prerequisites = parseBool(args.include_prerequisites, false);
    const include_modifications = parseBool(args.include_modifications, false);
    const include_tips = parseBool(args.include_tips, false);
    const include_purpose = parseBool(args.include_purpose, false);
    const include_tags = parseBool(args.include_tags, false);
    const compact_arrays = parseBool(args.compact_arrays, false);
    const include_snippet = parseBool(args.include_snippet, false);
    const search_arrays = parseBool(args.search_arrays, false);
    
    // Validate and parse snippet_length
    let snippet_length = args.snippet_length || 200;
    if (snippet_length < 50) snippet_length = 50;
    if (snippet_length > 500) snippet_length = 500;

    // Input validation
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }

    // Determine which repositories to search
    const repositories = repository ? [repository] : ['flopy', 'pyemu'];
    const validRepos = repositories.filter(r => ['flopy', 'pyemu'].includes(r));
    
    if (validRepos.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: "No tutorials found. Repository must be 'flopy' or 'pyemu'."
        }]
      };
    }

    console.log(`[SEARCH EXAMPLES PHASE 2] Query: "${query}", Repository: ${repository || 'all'}, Limit: ${limit}`);
    console.log(`[SEARCH EXAMPLES PHASE 2] Display options: use_cases=${include_use_cases}, prereqs=${include_prerequisites}, mods=${include_modifications}, tips=${include_tips}, purpose=${include_purpose}, tags=${include_tags}, compact=${compact_arrays}`);
    console.log(`[SEARCH EXAMPLES PHASE 2] Snippet options: include=${include_snippet}, length=${snippet_length}, source=${snippet_source}`);
    console.log(`[SEARCH EXAMPLES PHASE 2] Array search: enabled=${search_arrays}, mode=${search_mode}, fields=${Array.isArray(array_fields) ? `[${array_fields.join(',')}]` : 'default'}`);
    console.log(`[SEARCH EXAMPLES PHASE 2] Filters: model_type=${model_type}, complexity=${complexity}, workflow_type=${workflow_type}`);
    console.log(`[SEARCH EXAMPLES PHASE 2] Package filters: packages=${Array.isArray(packages) ? `[${packages.join(',')}]` : packages}, has_packages=${has_packages}`);

    const allResults = [];

    // Search FloPy workflows with filtering
    if (validRepos.includes('flopy')) {
      // Build WHERE clause with filters
      let whereConditions = [];
      let queryParams = [query];
      let paramIndex = 2;
      
      // Build main search condition based on search_mode
      if (search_arrays) {
        const arraySearchCondition = buildArraySearchConditions(query, array_fields, 'flopy');
        
        if (search_mode === 'title_first') {
          // Standard search first, then arrays
          whereConditions.push(`(search_vector @@ plainto_tsquery('english', $1)${arraySearchCondition ? ` OR (${arraySearchCondition})` : ''})`);
        } else if (search_mode === 'arrays_first') {
          // Arrays first, then standard search
          whereConditions.push(`(${arraySearchCondition ? `(${arraySearchCondition}) OR ` : ''}search_vector @@ plainto_tsquery('english', $1))`);
        } else { // balanced
          // Equal weight to both
          whereConditions.push(`(search_vector @@ plainto_tsquery('english', $1)${arraySearchCondition ? ` OR (${arraySearchCondition})` : ''})`);
        }
      } else {
        // Standard search only
        whereConditions.push('search_vector @@ plainto_tsquery(\'english\', $1)');
      }
      
      if (model_type) {
        whereConditions.push(`model_type = $${paramIndex}`);
        queryParams.push(model_type);
        paramIndex++;
      }
      
      if (complexity) {
        whereConditions.push(`complexity = $${paramIndex}`);
        queryParams.push(complexity);
        paramIndex++;
      }
      
      // Package filtering
      if (packages && Array.isArray(packages) && packages.length > 0) {
        if (has_packages === 'all') {
          // Must have ALL specified packages
          whereConditions.push(`packages_used @> $${paramIndex}::text[]`);
        } else {
          // Must have ANY of the specified packages
          whereConditions.push(`packages_used && $${paramIndex}::text[]`);
        }
        queryParams.push(packages);
        paramIndex++;
      }
      
      // Build snippet fields based on user preference
      const snippetFields = include_snippet ? `
          ${snippet_source === 'description' || snippet_source === 'both' ? 
            `, ts_headline('english', description, plainto_tsquery('english', $1), 
              'MaxWords=${Math.floor(snippet_length/5)}, MinWords=${Math.floor(snippet_length/10)}, 
               StartSel=<mark>, StopSel=</mark>') as description_snippet` : ''}
          ${snippet_source === 'purpose' || snippet_source === 'both' ? 
            `, ts_headline('english', workflow_purpose, plainto_tsquery('english', $1), 
              'MaxWords=${Math.floor(snippet_length/5)}, MinWords=${Math.floor(snippet_length/10)}, 
               StartSel=<mark>, StopSel=</mark>') as purpose_snippet` : ''}
      ` : '';
      
      const flopyQuery = `
        SELECT 
          tutorial_file as filepath,
          'flopy' as repo_name,
          title,
          description,
          complexity,
          model_type,
          packages_used,
          workflow_purpose,
          best_use_cases,
          prerequisites,
          common_modifications,
          tags,
          ts_rank_cd(search_vector, plainto_tsquery('english', $1)) as relevance,
          'workflows' as source_type
          ${snippetFields}
        FROM flopy_workflows
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY relevance DESC
        LIMIT $${paramIndex}
      `;
      
      queryParams.push(limit);
      
      const flopyResults = await sql.query(flopyQuery, queryParams);
      allResults.push(...flopyResults);
    }

    // Search PyEMU workflows with filtering
    if (validRepos.includes('pyemu')) {
      // Build WHERE clause with filters
      let whereConditions = [];
      let queryParams = [query];
      let paramIndex = 2;
      
      // Build main search condition based on search_mode
      if (search_arrays) {
        const arraySearchCondition = buildArraySearchConditions(query, array_fields, 'pyemu');
        
        if (search_mode === 'title_first') {
          // Standard search first, then arrays
          whereConditions.push(`(search_vector @@ plainto_tsquery('english', $1)${arraySearchCondition ? ` OR (${arraySearchCondition})` : ''})`);
        } else if (search_mode === 'arrays_first') {
          // Arrays first, then standard search
          whereConditions.push(`(${arraySearchCondition ? `(${arraySearchCondition}) OR ` : ''}search_vector @@ plainto_tsquery('english', $1))`);
        } else { // balanced
          // Equal weight to both
          whereConditions.push(`(search_vector @@ plainto_tsquery('english', $1)${arraySearchCondition ? ` OR (${arraySearchCondition})` : ''})`);
        }
      } else {
        // Standard search only
        whereConditions.push('search_vector @@ plainto_tsquery(\'english\', $1)');
      }
      
      if (workflow_type) {
        whereConditions.push(`workflow_type = $${paramIndex}`);
        queryParams.push(workflow_type);
        paramIndex++;
      }
      
      if (complexity) {
        whereConditions.push(`complexity = $${paramIndex}`);
        queryParams.push(complexity);
        paramIndex++;
      }
      
      // PEST concepts filtering
      if (pest_concepts && Array.isArray(pest_concepts) && pest_concepts.length > 0) {
        if (has_packages === 'all') {
          whereConditions.push(`pest_concepts @> $${paramIndex}::text[]`);
        } else {
          whereConditions.push(`pest_concepts && $${paramIndex}::text[]`);
        }
        queryParams.push(pest_concepts);
        paramIndex++;
      }
      
      // Uncertainty methods filtering
      if (uncertainty_methods && Array.isArray(uncertainty_methods) && uncertainty_methods.length > 0) {
        if (has_packages === 'all') {
          whereConditions.push(`uncertainty_methods @> $${paramIndex}::text[]`);
        } else {
          whereConditions.push(`uncertainty_methods && $${paramIndex}::text[]`);
        }
        queryParams.push(uncertainty_methods);
        paramIndex++;
      }
      
      // Build snippet fields for PyEMU (reuse same snippet configuration)
      const pyemuSnippetFields = include_snippet ? `
          ${snippet_source === 'description' || snippet_source === 'both' ? 
            `, ts_headline('english', description, plainto_tsquery('english', $1), 
              'MaxWords=${Math.floor(snippet_length/5)}, MinWords=${Math.floor(snippet_length/10)}, 
               StartSel=<mark>, StopSel=</mark>') as description_snippet` : ''}
          ${snippet_source === 'purpose' || snippet_source === 'both' ? 
            `, ts_headline('english', workflow_purpose, plainto_tsquery('english', $1), 
              'MaxWords=${Math.floor(snippet_length/5)}, MinWords=${Math.floor(snippet_length/10)}, 
               StartSel=<mark>, StopSel=</mark>') as purpose_snippet` : ''}
      ` : '';
      
      const pyemuQuery = `
        SELECT 
          notebook_file as filepath,
          'pyemu' as repo_name,
          title,
          description,
          complexity,
          workflow_type as model_type,
          pest_concepts as packages_used,
          workflow_purpose,
          common_applications as best_use_cases,
          prerequisites,
          implementation_tips,
          best_practices,
          tags,
          uncertainty_methods,
          ts_rank_cd(search_vector, plainto_tsquery('english', $1)) as relevance,
          'workflows' as source_type
          ${pyemuSnippetFields}
        FROM pyemu_workflows
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY relevance DESC
        LIMIT $${paramIndex}
      `;
      
      queryParams.push(limit);
      
      const pyemuResults = await sql.query(pyemuQuery, queryParams);
      allResults.push(...pyemuResults);
    }

    // Sort by relevance and limit
    const sortedResults = allResults
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    // Format output
    if (sortedResults.length === 0) {
      let noResultsMsg = `No tutorials found for query: "${query}"`;
      
      // Add filter information to no results message
      const activeFilters = [];
      if (model_type) activeFilters.push(`model_type=${model_type}`);
      if (complexity) activeFilters.push(`complexity=${complexity}`);
      if (workflow_type) activeFilters.push(`workflow_type=${workflow_type}`);
      if (packages && Array.isArray(packages) && packages.length) {
        activeFilters.push(`packages=[${packages.join(',')}]${has_packages === 'all' ? ' (ALL)' : ' (ANY)'}`);
      }
      if (pest_concepts && Array.isArray(pest_concepts) && pest_concepts.length) {
        activeFilters.push(`pest_concepts=[${pest_concepts.join(',')}]`);
      }
      if (uncertainty_methods && Array.isArray(uncertainty_methods) && uncertainty_methods.length) {
        activeFilters.push(`uncertainty_methods=[${uncertainty_methods.join(',')}]`);
      }
      
      if (activeFilters.length > 0) {
        noResultsMsg += `\nActive filters: ${activeFilters.join(', ')}`;
        noResultsMsg += `\nTry relaxing some filters for more results.`;
      }
      
      return {
        content: [{
          type: "text" as const,
          text: noResultsMsg
        }]
      };
    }

    let output = `Found ${sortedResults.length} tutorial${sortedResults.length > 1 ? 's' : ''} for "${query}"\n\n`;

    sortedResults.forEach((result, index) => {
      output += `${index + 1}. **${result.title}** (${result.repo_name})\n`;
      output += `   File: ${result.filepath}\n`;
      
      if (result.complexity) {
        output += `   Complexity: ${result.complexity}\n`;
      }
      
      if (result.model_type) {
        output += `   Type: ${result.model_type}\n`;
      }
      
      if (result.packages_used && result.packages_used.length > 0) {
        const packages = result.packages_used.slice(0, 5).join(', ');
        output += `   Packages: ${packages}\n`;
      }
      
      // Display uncertainty methods for PyEMU if present
      if (result.uncertainty_methods && result.uncertainty_methods.length > 0) {
        const methods = result.uncertainty_methods.slice(0, 3).join(', ');
        output += `   Uncertainty Methods: ${methods}\n`;
      }
      
      // Display optional arrays based on user preferences
      if (include_tags && result.tags && result.tags.length > 0) {
        output += `   Tags: ${result.tags.slice(0, 5).join(', ')}\n`;
      }
      
      // Show description or highlighted snippet
      if (include_snippet && (result.description_snippet || result.purpose_snippet)) {
        if (result.description_snippet && (snippet_source === 'description' || snippet_source === 'both')) {
          output += `   Description Snippet: ${result.description_snippet}\n`;
        }
        if (result.purpose_snippet && (snippet_source === 'purpose' || snippet_source === 'both')) {
          output += `   Purpose Snippet: ${result.purpose_snippet}\n`;
        }
      } else if (result.description) {
        const desc = result.description.substring(0, 200);
        output += `   Description: ${desc}${result.description.length > 200 ? '...' : ''}\n`;
      }
      
      // Rich arrays with user control
      if (include_use_cases && result.best_use_cases) {
        output += `   Use Cases:\n${formatArray(result.best_use_cases, compact_arrays, 3)}\n`;
      }
      
      if (include_prerequisites && result.prerequisites) {
        output += `   Prerequisites:\n${formatArray(result.prerequisites, compact_arrays, 3)}\n`;
      }
      
      if (include_modifications && result.common_modifications && result.repo_name === 'flopy') {
        output += `   Common Modifications:\n${formatArray(result.common_modifications, compact_arrays, 3)}\n`;
      }
      
      if (include_tips && result.repo_name === 'pyemu') {
        if (result.implementation_tips) {
          output += `   Implementation Tips:\n${formatArray(result.implementation_tips, compact_arrays, 3)}\n`;
        }
        if (result.best_practices) {
          output += `   Best Practices:\n${formatArray(result.best_practices, compact_arrays, 3)}\n`;
        }
      }
      
      if (include_purpose && result.workflow_purpose) {
        const purpose = compact_arrays 
          ? result.workflow_purpose.substring(0, 300) + (result.workflow_purpose.length > 300 ? '...' : '')
          : result.workflow_purpose;
        output += `   Purpose: ${purpose}\n`;
      }
      
      output += `   Relevance: ${result.relevance.toFixed(3)}\n`;
      output += '\n';
    });

    // Add debug info
    output += `\nDebug Info:\n`;
    output += `- Search term: "${query}"\n`;
    output += `- Repositories searched: ${validRepos.join(', ')}\n`;
    output += `- Results found: ${sortedResults.length}/${limit}\n`;
    
    // Display active filters
    const activeFilters = [];
    if (model_type) activeFilters.push(`model_type=${model_type}`);
    if (complexity) activeFilters.push(`complexity=${complexity}`);
    if (workflow_type) activeFilters.push(`workflow_type=${workflow_type}`);
    if (packages && Array.isArray(packages) && packages.length) {
      activeFilters.push(`packages=[${packages.join(',')}]${has_packages === 'all' ? ' (ALL)' : ' (ANY)'}`);
    }
    if (pest_concepts && Array.isArray(pest_concepts) && pest_concepts.length) {
      activeFilters.push(`pest_concepts=[${pest_concepts.join(',')}]`);
    }
    if (uncertainty_methods && Array.isArray(uncertainty_methods) && uncertainty_methods.length) {
      activeFilters.push(`uncertainty_methods=[${uncertainty_methods.join(',')}]`);
    }
    
    if (activeFilters.length > 0) {
      output += `- Active filters: ${activeFilters.join(', ')}\n`;
    }
    
    // Display options
    output += `- Display options: `;
    const activeOptions = [];
    if (include_use_cases) activeOptions.push('use_cases');
    if (include_prerequisites) activeOptions.push('prerequisites');
    if (include_modifications) activeOptions.push('modifications');
    if (include_tips) activeOptions.push('tips');
    if (include_purpose) activeOptions.push('purpose');
    if (include_tags) activeOptions.push('tags');
    if (compact_arrays) activeOptions.push('compact');
    if (include_snippet) activeOptions.push(`snippets(${snippet_source},${snippet_length}chars)`);
    if (search_arrays) activeOptions.push(`array_search(${search_mode},${Array.isArray(array_fields) ? array_fields.join('|') : 'default'})`);
    output += activeOptions.length > 0 ? activeOptions.join(', ') : 'none';
    output += '\n';

    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };

  } catch (error) {
    console.error('[SEARCH EXAMPLES PHASE 2] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}