/**
 * Semantic Search Examples Tool - Phase 0: Minimal Implementation
 * Pure semantic search using OpenAI embeddings and pgvector similarity
 * No filtering, debugging, or hybrid functionality - just core semantic search
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";

export const semanticSearchTutorialsSchema = {
  name: "semantic_search_tutorials",
  description: `
    Semantic search for FloPy and PyEMU tutorials using v02 embeddings, tested for 
    domain and complexity differentiation. Search results from 20+ test queries show:

    Verified capabilities:
    • Domain-aware: "uncertainty quantification" query retrieved only PyEMU tutorials (0/8 FloPy false positives)
    • Complexity matching: "basic" queries found simple tutorials; "advanced" queries matched advanced topics
    • Tool recognition: "PESTPP-IES" and "pyemu.ParameterEnsemble" queries returned relevant tutorials as top results
    • Similarity scores: 0.3-0.6 range for relevant matches, indicating practical discrimination

    Limitations:
    • Some tool variants (e.g., PESTPP-GLM) could not be verified due to limited tutorial content
    • Exhaustive coverage of all workflow types not fully tested

    Best for: Finding tutorials by concept, workflow complexity, or specific tool implementation
    (as demonstrated in test cases). For exact documentation, use search_documentation instead.
  `,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query for semantic search',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (1-20, default: 5)',
      },
      similarity_threshold: {
        type: 'number',
        description: 'Minimum similarity score (0-1, default: 0)',
      },
    },
    required: ['query'],
  }
};

// Generate embedding for query using OpenAI API
async function generateQueryEmbedding(query: string, openaiApiKey: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: query,
      model: 'text-embedding-3-small',
      encoding_format: 'float',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export async function semanticSearchTutorials(args: any, sql: NeonQueryFunction<false, false>, openaiApiKey: string) {
  try {
    const { 
      query, 
      limit = 5,
      similarity_threshold = 0,
    } = args;

    // Input validation
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query parameter is required and cannot be empty');
    }

    if (limit < 1 || limit > 20) {
      throw new Error('Limit must be between 1 and 20');
    }

    if (similarity_threshold < 0 || similarity_threshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log(`[SEMANTIC SEARCH TUTORIALS] Query: "${query}", Limit: ${limit}, Threshold: ${similarity_threshold}`);

    // Generate embedding for the query
    console.log('[SEMANTIC SEARCH TUTORIALS] Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(query, openaiApiKey);
    console.log(`[SEMANTIC SEARCH TUTORIALS] Generated embedding with ${queryEmbedding.length} dimensions`);

    // Search both FloPy and PyEMU workflows
    const allResults = [];

    // Search FloPy workflows using dspy_emb_02
    const flopyQuery = `
      SELECT 
        tutorial_file as filepath,
        'flopy' as repo_name,
        title,
        description,
        complexity,
        model_type,
        packages_used,
        (1 - (dspy_emb_02 <=> $1::vector)) as similarity
      FROM flopy_workflows
      WHERE dspy_emb_02 IS NOT NULL 
        AND (1 - (dspy_emb_02 <=> $1::vector)) >= $2
      ORDER BY similarity DESC
      LIMIT $3
    `;

    const flopyResults = await sql.query(flopyQuery, [
      JSON.stringify(queryEmbedding), 
      similarity_threshold, 
      limit
    ]);
    allResults.push(...flopyResults);

    // Search PyEMU workflows using dspy_emb_02
    const pyemuQuery = `
      SELECT 
        notebook_file as filepath,
        'pyemu' as repo_name,
        title,
        description,
        complexity,
        workflow_type as model_type,
        pest_concepts as packages_used,
        (1 - (dspy_emb_02 <=> $1::vector)) as similarity
      FROM pyemu_workflows
      WHERE dspy_emb_02 IS NOT NULL 
        AND (1 - (dspy_emb_02 <=> $1::vector)) >= $2
      ORDER BY similarity DESC
      LIMIT $3
    `;

    const pyemuResults = await sql.query(pyemuQuery, [
      JSON.stringify(queryEmbedding), 
      similarity_threshold, 
      limit
    ]);
    allResults.push(...pyemuResults);

    // Sort all results by similarity and limit
    const sortedResults = allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // Format output
    if (sortedResults.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `No semantically similar tutorials found for query: "${query}"\nTry lowering the similarity threshold (currently ${similarity_threshold}) or using different terms.`
        }]
      };
    }

    let output = `Found ${sortedResults.length} semantically similar tutorial${sortedResults.length > 1 ? 's' : ''} for "${query}"\n\n`;

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
      
      output += `   Similarity: ${result.similarity.toFixed(3)}\n`;
      output += '\n';
    });

    // Add simple debug info
    output += `\nSemantic Search Info:\n`;
    output += `- Query: "${query}"\n`;
    output += `- Results found: ${sortedResults.length}/${limit}\n`;
    output += `- Similarity threshold: ${similarity_threshold}\n`;
    output += `- Average similarity: ${(sortedResults.reduce((sum, r) => sum + r.similarity, 0) / sortedResults.length).toFixed(3)}\n`;

    // Add important reminder about using get_file_content
    output += `\n📋 **IMPORTANT REMINDER**: These are only previews and snippets. For complete, accurate file content without truncation or potential hallucinations, always use the \`get_file_content\` tool with the exact filepath shown above. This ensures you get the full, unmodified source code or documentation.\n`;

    return {
      content: [{
        type: "text" as const,
        text: output
      }]
    };

  } catch (error) {
    console.error('[SEMANTIC SEARCH TUTORIALS] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}