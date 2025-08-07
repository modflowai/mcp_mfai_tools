/**
 * Simple Code Search Tool - Based on working text-search.ts approach
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export const searchCodeSchema = {
  name: "search_code",
  description: `
    Simple code search for MODFLOW/PEST APIs and modules.
    Searches flopy_modules and pyemu_modules tables for code.
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (package codes, functions, concepts)',
      },
      repository: {
        type: 'string',
        description: 'Repository to search: flopy, pyemu, or omit for all',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-20, default: 10)',
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
    const { query, repository, limit = 10 } = args;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    const searchTerm = query.trim().replace(/[^\w\s]/g, '').split(/\s+/).join(' & ');
    
    let results: any[] = [];
    
    // Search flopy_modules
    if (!repository || repository === 'flopy') {
      const flopQuery = `
        SELECT 
          relative_path as filepath,
          'flopy' as repo_name,
          module_name,
          package_code,
          model_family,
          semantic_purpose as title,
          ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
          'modules' as search_source
        FROM flopy_modules
        WHERE search_vector @@ to_tsquery('english', $1)
        ORDER BY relevance_score DESC
        LIMIT ${Math.ceil(limit / 2)}
      `;
      const flopResults = await sql.query(flopQuery, [searchTerm]);
      results.push(...flopResults);
    }
    
    // Search pyemu_modules  
    if (!repository || repository === 'pyemu') {
      const pyemuQuery = `
        SELECT 
          relative_path as filepath,
          'pyemu' as repo_name,
          module_name,
          NULL as package_code,
          NULL as model_family,
          category,
          semantic_purpose as title,
          ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
          'modules' as search_source
        FROM pyemu_modules
        WHERE search_vector @@ to_tsquery('english', $1)
        ORDER BY relevance_score DESC
        LIMIT ${Math.ceil(limit / 2)}
      `;
      const pyemuResults = await sql.query(pyemuQuery, [searchTerm]);
      results.push(...pyemuResults);
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance_score - a.relevance_score);
    results = results.slice(0, limit);

    // Format output
    let output = `Found ${results.length} code modules for "${query}"\n\n`;
    
    results.forEach((result, index) => {
      output += `${index + 1}. **${result.filepath}** (${result.repo_name})\n`;
      if (result.module_name) output += `   Module: ${result.module_name}\n`;
      if (result.package_code) output += `   Package: ${result.package_code}\n`;
      if (result.model_family) output += `   Model: ${result.model_family}\n`;
      if (result.category) output += `   Category: ${result.category}\n`;
      if (result.title) output += `   Purpose: ${result.title.substring(0, 200)}...\n`;
      output += `   Relevance: ${result.relevance_score.toFixed(3)}\n\n`;
    });

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