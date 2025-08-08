/**
 * Telemetry Output Processing
 * Intelligent extraction of output summaries for different tool types
 */

interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

interface OutputSummary {
  summary: Record<string, any>;
  sizeBytes: number;
  resultCount?: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * Extract intelligent output summary based on tool type
 * Avoids storing large payloads while capturing key metrics
 */
export function extractOutputSummary(
  toolName: string,
  result: ToolResult | any,
  error?: Error
): OutputSummary {
  // Handle errors
  if (error) {
    return {
      summary: { error: true },
      sizeBytes: 0,
      resultCount: 0,
      success: false,
      errorMessage: error.message || 'Unknown error'
    };
  }

  // Calculate size of result
  const resultText = result?.content?.[0]?.text || '';
  const sizeBytes = new TextEncoder().encode(resultText).length;

  // Tool-specific extraction logic
  switch (toolName) {
    case 'search_docs':
    case 'search_code':
    case 'search_examples':
    case 'search_documentation': {
      const lines = resultText.split('\n');
      const foundMatch = resultText.match(/Found (\d+) .* for/);
      const noResultsMatch = resultText.match(/No .* found/);
      const resultCount = foundMatch ? parseInt(foundMatch[1]) : (noResultsMatch ? 0 : null);
      
      // Extract top result info
      const topResultMatch = resultText.match(/1\. \*\*(.*?)\*\*/);
      const topResult = topResultMatch ? topResultMatch[1] : null;
      
      // Extract relevance scores if present
      const relevanceMatches = [...resultText.matchAll(/Relevance: ([\d.]+)/g)];
      const relevanceScores = relevanceMatches.map(m => parseFloat(m[1]));
      
      // Extract repositories mentioned
      const repoMatches = [...resultText.matchAll(/\((\w+)\)/g)];
      const repositories = [...new Set(repoMatches.map(m => m[1]))];
      
      // Detect search method from debug info
      const searchMethodMatch = resultText.match(/Search strategy: (\w+)/);
      const searchMethod = searchMethodMatch ? searchMethodMatch[1] : 'unknown';

      return {
        summary: {
          results_found: resultCount,
          top_result: topResult,
          top_relevance: relevanceScores[0] || null,
          avg_relevance: relevanceScores.length > 0 
            ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length 
            : null,
          repositories: repositories.length > 0 ? repositories : null,
          search_method: searchMethod !== 'unknown' ? searchMethod : null
        },
        sizeBytes,
        resultCount,
        success: true
      };
    }

    case 'semantic_search_docs':
    case 'semantic_search_tutorials': {
      const foundMatch = resultText.match(/Found (\d+) .* for/);
      const noResultsMatch = resultText.match(/No .* found/);
      const resultCount = foundMatch ? parseInt(foundMatch[1]) : (noResultsMatch ? 0 : null);
      
      // Extract similarity scores
      const similarityMatches = [...resultText.matchAll(/Similarity: ([\d.]+)/g)];
      const similarityScores = similarityMatches.map(m => parseFloat(m[1]));
      
      // Check for filters
      const filterMatch = resultText.match(/Active filters:/);
      
      return {
        summary: {
          results_found: resultCount,
          top_similarity: similarityScores[0] || null,
          avg_similarity: similarityScores.length > 0
            ? similarityScores.reduce((a, b) => a + b, 0) / similarityScores.length
            : null,
          filter_applied: !!filterMatch
        },
        sizeBytes,
        resultCount,
        success: true
      };
    }

    case 'get_file_content': {
      // Extract file metadata without storing content
      const repoMatch = resultText.match(/\*\*Repository:\*\* (\w+)/);
      const fileMatch = resultText.match(/\*\*File:\*\* (.*)/);
      const typeMatch = resultText.match(/\*\*Type:\*\* (\w+)/);
      const sizeMatch = resultText.match(/\*\*Size:\*\* ([\d,]+) characters/);
      const pageMatch = resultText.match(/Showing part (\d+) of (\d+)/);
      const largeFileMatch = resultText.match(/This file is ([\d,]+) characters/);
      
      const totalSize = sizeMatch 
        ? parseInt(sizeMatch[1].replace(/,/g, ''))
        : (largeFileMatch ? parseInt(largeFileMatch[1].replace(/,/g, '')) : null);
      
      return {
        summary: {
          repository: repoMatch ? repoMatch[1] : null,
          filepath: fileMatch ? fileMatch[1] : null,
          file_type: typeMatch ? typeMatch[1] : null,
          total_size: totalSize,
          page_requested: pageMatch ? parseInt(pageMatch[1]) : 1,
          total_pages: pageMatch ? parseInt(pageMatch[2]) : 1,
          content_truncated: !!pageMatch
        },
        sizeBytes,
        success: true
      };
    }

    default: {
      // Generic summary for unknown tools
      return {
        summary: {
          response_length: resultText.length,
          has_content: resultText.length > 0
        },
        sizeBytes,
        success: true
      };
    }
  }
}

/**
 * Check if a tool should have its output tracked
 * Some tools like get_file_content might want limited tracking
 */
export function shouldTrackOutput(toolName: string): boolean {
  // Track all tools - we're being smart about what we extract
  return true;
}

/**
 * Get maximum output size to store for a tool
 * Prevents storing huge outputs in telemetry
 */
export function getMaxOutputSize(toolName: string): number {
  switch (toolName) {
    case 'get_file_content':
      return 0; // Don't store actual content, just metadata
    case 'search_docs':
    case 'search_code':
    case 'search_examples':
      return 5000; // Store up to 5KB of search results
    default:
      return 10000; // Default 10KB limit
  }
}