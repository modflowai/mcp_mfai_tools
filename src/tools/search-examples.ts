/**
 * Search Examples Tool - Phase 1: Display Control Options
 * Adds user-controlled display options to show/hide rich metadata
 * Tables: flopy_workflows, pyemu_workflows
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchExamplesSchema = {
  name: "search_examples",
  description: `
    Search for tutorials, workflows, and working examples in FloPy and PyEMU.
    Returns tutorials with user-controlled display of rich metadata.
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

export async function searchExamples(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { query, repository, limit = 10 } = args;
    
    // Parse display options with MCP boolean compatibility
    const include_use_cases = parseBool(args.include_use_cases, false);
    const include_prerequisites = parseBool(args.include_prerequisites, false);
    const include_modifications = parseBool(args.include_modifications, false);
    const include_tips = parseBool(args.include_tips, false);
    const include_purpose = parseBool(args.include_purpose, false);
    const include_tags = parseBool(args.include_tags, false);
    const compact_arrays = parseBool(args.compact_arrays, false);

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

    console.log(`[SEARCH EXAMPLES PHASE 1] Query: "${query}", Repository: ${repository || 'all'}, Limit: ${limit}`);
    console.log(`[SEARCH EXAMPLES PHASE 1] Display options: use_cases=${include_use_cases}, prereqs=${include_prerequisites}, mods=${include_modifications}, tips=${include_tips}, purpose=${include_purpose}, tags=${include_tags}, compact=${compact_arrays}`);

    const allResults = [];

    // Search FloPy workflows with additional fields
    if (validRepos.includes('flopy')) {
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
        FROM flopy_workflows
        WHERE search_vector @@ plainto_tsquery('english', $1)
        ORDER BY relevance DESC
        LIMIT $2
      `;
      
      const flopyResults = await sql.query(flopyQuery, [query, limit]);
      allResults.push(...flopyResults);
    }

    // Search PyEMU workflows with additional fields
    if (validRepos.includes('pyemu')) {
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
          ts_rank_cd(search_vector, plainto_tsquery('english', $1)) as relevance,
          'workflows' as source_type
        FROM pyemu_workflows
        WHERE search_vector @@ plainto_tsquery('english', $1)
        ORDER BY relevance DESC
        LIMIT $2
      `;
      
      const pyemuResults = await sql.query(pyemuQuery, [query, limit]);
      allResults.push(...pyemuResults);
    }

    // Sort by relevance and limit
    const sortedResults = allResults
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

    // Format output
    if (sortedResults.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No tutorials found for query: "${query}"`
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
      
      // Display optional arrays based on user preferences
      if (include_tags && result.tags && result.tags.length > 0) {
        output += `   Tags: ${result.tags.slice(0, 5).join(', ')}\n`;
      }
      
      if (result.description) {
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
    output += `- Display options: `;
    const activeOptions = [];
    if (include_use_cases) activeOptions.push('use_cases');
    if (include_prerequisites) activeOptions.push('prerequisites');
    if (include_modifications) activeOptions.push('modifications');
    if (include_tips) activeOptions.push('tips');
    if (include_purpose) activeOptions.push('purpose');
    if (include_tags) activeOptions.push('tags');
    if (compact_arrays) activeOptions.push('compact');
    output += activeOptions.length > 0 ? activeOptions.join(', ') : 'none';
    output += '\n';

    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };

  } catch (error) {
    console.error('[SEARCH EXAMPLES PHASE 1] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}