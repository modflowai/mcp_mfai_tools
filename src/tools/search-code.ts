/**
 * Simple Code Search Tool - Based on working text-search.ts approach
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

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
      include_github = true
    } = args;

    console.log('[SEARCH CODE] Args received:', JSON.stringify({
      query,
      repository,
      limit,
      include_scenarios,
      include_concepts,
      include_errors,
      include_pest,
      include_source,
      include_github
    }));

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    const searchTerm = query.trim().replace(/[^\w\s]/g, '').split(/\s+/).join(' & ');
    console.log('[SEARCH CODE] Processed search term:', searchTerm);
    
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
          ${include_github ? 'github_url,' : 'NULL as github_url,'}
          ${include_scenarios ? 'user_scenarios,' : 'NULL as user_scenarios,'}
          ${include_concepts ? 'related_concepts,' : 'NULL as related_concepts,'}
          ${include_errors ? 'typical_errors,' : 'NULL as typical_errors,'}
          ${include_source ? 'LEFT(source_code, 500) as source_snippet,' : 'NULL as source_snippet,'}
          ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
          'modules' as search_source
        FROM flopy_modules
        WHERE search_vector @@ to_tsquery('english', $1)
        ORDER BY relevance_score DESC
        LIMIT ${Math.ceil(limit / 2)}
      `;
      console.log('[SEARCH CODE] FloPy query:', flopQuery);
      const flopResults = await sql.query(flopQuery, [searchTerm]);
      console.log('[SEARCH CODE] FloPy results count:', flopResults?.length || 0);
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
          ${include_github ? 'github_url,' : 'NULL as github_url,'}
          ${include_scenarios ? 'use_cases,' : 'NULL as use_cases,'}
          ${include_concepts ? 'statistical_concepts,' : 'NULL as statistical_concepts,'}
          ${include_errors ? 'common_pitfalls,' : 'NULL as common_pitfalls,'}
          ${include_pest ? 'pest_integration,' : 'NULL as pest_integration,'}
          ${include_source ? 'LEFT(source_code, 500) as source_snippet,' : 'NULL as source_snippet,'}
          ts_rank_cd(search_vector, to_tsquery('english', $1)) as relevance_score,
          'modules' as search_source
        FROM pyemu_modules
        WHERE search_vector @@ to_tsquery('english', $1)
        ORDER BY relevance_score DESC
        LIMIT ${Math.ceil(limit / 2)}
      `;
      console.log('[SEARCH CODE] PyEMU query:', pyemuQuery);
      const pyemuResults = await sql.query(pyemuQuery, [searchTerm]);
      console.log('[SEARCH CODE] PyEMU results count:', pyemuResults?.length || 0);
      results.push(...pyemuResults);
    }

    // Sort by relevance
    results.sort((a, b) => b.relevance_score - a.relevance_score);
    results = results.slice(0, limit);
    
    console.log('[SEARCH CODE] Final results count:', results.length);

    // Format output with rich metadata
    let output = `Found ${results.length} code modules for "${query}"\n\n`;
    
    results.forEach((result, index) => {
      output += `${index + 1}. **${result.filepath}** (${result.repo_name})\n`;
      
      // Basic metadata
      if (result.module_name) output += `   Module: ${result.module_name}\n`;
      if (result.package_code) output += `   Package: ${result.package_code}\n`;
      if (result.model_family) output += `   Model: ${result.model_family}\n`;
      if (result.category) output += `   Category: ${result.category}\n`;
      if (result.title) output += `   Purpose: ${result.title.substring(0, 200)}...\n`;
      
      // GitHub URL
      if (result.github_url) output += `   GitHub: ${result.github_url}\n`;
      
      // Rich arrays - FloPy fields
      if (result.user_scenarios && Array.isArray(result.user_scenarios) && result.user_scenarios.length > 0) {
        output += `   User Scenarios:\n`;
        result.user_scenarios.slice(0, 3).forEach((scenario, i) => {
          output += `     ${i + 1}. ${scenario.substring(0, 150)}${scenario.length > 150 ? '...' : ''}\n`;
        });
        if (result.user_scenarios.length > 3) {
          output += `     ... and ${result.user_scenarios.length - 3} more\n`;
        }
      }
      
      if (result.related_concepts && Array.isArray(result.related_concepts) && result.related_concepts.length > 0) {
        output += `   Related Concepts:\n`;
        result.related_concepts.slice(0, 3).forEach((concept, i) => {
          output += `     ${i + 1}. ${concept.substring(0, 150)}${concept.length > 150 ? '...' : ''}\n`;
        });
        if (result.related_concepts.length > 3) {
          output += `     ... and ${result.related_concepts.length - 3} more\n`;
        }
      }
      
      if (result.typical_errors && Array.isArray(result.typical_errors) && result.typical_errors.length > 0) {
        output += `   Typical Errors:\n`;
        result.typical_errors.slice(0, 3).forEach((error, i) => {
          output += `     ${i + 1}. ${error.substring(0, 150)}${error.length > 150 ? '...' : ''}\n`;
        });
        if (result.typical_errors.length > 3) {
          output += `     ... and ${result.typical_errors.length - 3} more\n`;
        }
      }
      
      // Rich arrays - PyEMU fields
      if (result.use_cases && Array.isArray(result.use_cases) && result.use_cases.length > 0) {
        output += `   Use Cases:\n`;
        result.use_cases.slice(0, 3).forEach((useCase, i) => {
          output += `     ${i + 1}. ${useCase.substring(0, 150)}${useCase.length > 150 ? '...' : ''}\n`;
        });
        if (result.use_cases.length > 3) {
          output += `     ... and ${result.use_cases.length - 3} more\n`;
        }
      }
      
      if (result.statistical_concepts && Array.isArray(result.statistical_concepts) && result.statistical_concepts.length > 0) {
        output += `   Statistical Concepts:\n`;
        result.statistical_concepts.slice(0, 3).forEach((concept, i) => {
          output += `     ${i + 1}. ${concept.substring(0, 150)}${concept.length > 150 ? '...' : ''}\n`;
        });
        if (result.statistical_concepts.length > 3) {
          output += `     ... and ${result.statistical_concepts.length - 3} more\n`;
        }
      }
      
      if (result.common_pitfalls && Array.isArray(result.common_pitfalls) && result.common_pitfalls.length > 0) {
        output += `   Common Pitfalls:\n`;
        result.common_pitfalls.slice(0, 3).forEach((pitfall, i) => {
          output += `     ${i + 1}. ${pitfall.substring(0, 150)}${pitfall.length > 150 ? '...' : ''}\n`;
        });
        if (result.common_pitfalls.length > 3) {
          output += `     ... and ${result.common_pitfalls.length - 3} more\n`;
        }
      }
      
      if (result.pest_integration && Array.isArray(result.pest_integration) && result.pest_integration.length > 0) {
        output += `   PEST Integration:\n`;
        result.pest_integration.slice(0, 3).forEach((integration, i) => {
          output += `     ${i + 1}. ${integration.substring(0, 150)}${integration.length > 150 ? '...' : ''}\n`;
        });
        if (result.pest_integration.length > 3) {
          output += `     ... and ${result.pest_integration.length - 3} more\n`;
        }
      }
      
      // Source code snippet
      if (result.source_snippet) {
        output += `   Source Code:\n\`\`\`python\n${result.source_snippet}${result.source_snippet.length >= 500 ? '\n...' : ''}\n\`\`\`\n`;
      }
      
      output += `   Relevance: ${result.relevance_score.toFixed(3)}\n\n`;
    });
    
    // Add debug information
    output += `\nDebug Info:\n`;
    output += `- Search term: "${searchTerm}"\n`;
    output += `- Repository: ${repository || 'all'}\n`;
    output += `- Rich arrays requested: ${[
      include_scenarios && 'scenarios',
      include_concepts && 'concepts', 
      include_errors && 'errors',
      include_pest && 'pest',
      include_source && 'source',
      include_github && 'github'
    ].filter(Boolean).join(', ') || 'none'}\n`;
    output += `- Results found: ${results.length}/${limit}\n`;

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