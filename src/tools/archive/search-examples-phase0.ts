/**
 * Minimal Search Examples Tool - Phase 0
 * Clean, simple implementation for searching tutorials and workflows
 * Tables: flopy_workflows, pyemu_workflows
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const searchExamplesSchema = {
  name: "search_examples",
  description: `
    Search for tutorials, workflows, and working examples in FloPy and PyEMU.
    Returns tutorials with title, description, complexity, and packages used.
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
    },
    required: ['query'],
  }
};

export async function searchExamples(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { query, repository, limit = 10 } = args;

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

    console.log(`[SEARCH EXAMPLES MINIMAL] Query: "${query}", Repository: ${repository || 'all'}, Limit: ${limit}`);

    const allResults = [];

    // Search FloPy workflows
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

    // Search PyEMU workflows
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
      
      if (result.description) {
        const desc = result.description.substring(0, 200);
        output += `   Description: ${desc}${result.description.length > 200 ? '...' : ''}\n`;
      }
      
      output += `   Relevance: ${result.relevance.toFixed(3)}\n`;
      output += '\n';
    });

    // Add debug info
    output += `\nDebug Info:\n`;
    output += `- Search term: "${query}"\n`;
    output += `- Repositories searched: ${validRepos.join(', ')}\n`;
    output += `- Results found: ${sortedResults.length}/${limit}\n`;

    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };

  } catch (error) {
    console.error('[SEARCH EXAMPLES MINIMAL] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}