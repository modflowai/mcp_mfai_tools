/**
 * Get File Content Tool
 * Retrieves complete content of a specific file by its exact path from MODFLOW/PEST repositories
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

interface FileAnalysis {
  summary?: string;
  key_concepts?: string[];
  technical_level?: string;
  purpose?: string;
}

// Tool schema definition
export const getFileContentSchema = {
  name: "get_file_content",
  description: `
    Get complete content of a specific file by its exact path from MODFLOW/PEST repositories.
    
    This tool retrieves the full content of a specific file when you know the exact filepath.
    Best for accessing complete source code, documentation files, or configuration files.
    
    Available repositories:
    - flopy: Python package for MODFLOW (includes modules and workflows)
    - mfusg: MODFLOW-USG (Unstructured Grid) documentation
    - pest: Parameter Estimation package documentation
    - pestpp: PEST++ enhanced version documentation
    - pest_hp: PEST_HP parallel version documentation
    - pyemu: PyEMU uncertainty analysis (includes modules and workflows)
    - mf6: MODFLOW 6 documentation
    - plproc: Parameter list processor documentation
    - gwutils: Groundwater data utilities documentation
    
    Use this tool when you:
    - Have an exact file path from search results
    - Need to view complete file contents
    - Want to examine source code or configuration details
    - Need to analyze file structure and implementation
  `,
  inputSchema: {
    type: 'object',
    properties: {
      repository: {
        type: 'string',
        description: 'Repository name (flopy, mfusg, pest, pestpp, pest_hp, pyemu, mf6, plproc, gwutils)',
      },
      filepath: {
        type: 'string',
        description: 'Exact file path within the repository (e.g., "mf6io/well_wel_package.md")',
      },
    },
    required: ['repository', 'filepath'],
  }
};

// Tool implementation
export async function getFileContentTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { repository, filepath } = args;

    // Validate inputs
    if (!repository || typeof repository !== 'string' || repository.trim().length === 0) {
      throw new Error('Repository parameter is required and cannot be empty');
    }

    if (!filepath || typeof filepath !== 'string' || filepath.trim().length === 0) {
      throw new Error('Filepath parameter is required and cannot be empty');
    }

    // Validate repository
    const validRepos = ['flopy', 'mfusg', 'pest', 'pestpp', 'pest_hp', 'pyemu', 'mf6', 'plproc', 'gwutils'];
    if (!validRepos.includes(repository)) {
      throw new Error(`Invalid repository '${repository}'. Valid options: ${validRepos.join(', ')}`);
    }

    console.log('[GET FILE] Retrieving file:', filepath, 'from repository:', repository);

    // For FloPy and PyEMU, check specialized tables first (when implemented)
    let result;
    
    // Note: For now we'll focus on the main repository_files table
    // In the future, specialized flopy_modules, flopy_workflows, pyemu_modules, pyemu_workflows tables could be added
    
    // Try repository_files table
    result = await sql`
      SELECT 
        content,
        analysis,
        filepath,
        file_type,
        created_at,
        length(content) as file_size
      FROM repository_files
      WHERE repo_name = ${repository}
        AND filepath = ${filepath}
    `;

    if (!result || result.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `File not found: "${filepath}" in repository "${repository}"\n\nPlease verify the exact file path. You can use the search tools to find the correct path.`
        }]
      };
    }

    const file = result[0];
    
    // Parse analysis
    let analysis: FileAnalysis = {};
    if (file.analysis) {
      if (typeof file.analysis === 'object' && file.analysis !== null) {
        // Handle JSON analysis from repository_files
        analysis = {
          summary: file.analysis.summary,
          key_concepts: file.analysis.key_concepts,
          technical_level: file.analysis.technical_level,
          purpose: file.analysis.purpose
        };
      } else if (typeof file.analysis === 'string') {
        // Handle string analysis
        analysis = {
          summary: file.analysis
        };
      }
    }

    // Extract filename and extension
    const filename = filepath.split('/').pop() || '';
    const extension = filename.includes('.') ? filename.split('.').pop() || '' : '';

    // Format output for MCP
    let outputText = `# File Content: ${filepath}\n\n`;
    
    outputText += `**Repository:** ${repository}\n`;
    outputText += `**File:** ${filename}\n`;
    outputText += `**Type:** ${file.file_type || extension || 'unknown'}\n`;
    outputText += `**Size:** ${file.file_size || 0} characters\n`;
    if (file.created_at) {
      outputText += `**Created:** ${new Date(file.created_at).toISOString()}\n`;
    }

    // Add analysis if available
    if (analysis.summary) {
      outputText += `\n**Summary:** ${analysis.summary}\n`;
    }
    if (analysis.purpose) {
      outputText += `**Purpose:** ${analysis.purpose}\n`;
    }
    if (analysis.technical_level) {
      outputText += `**Technical Level:** ${analysis.technical_level}\n`;
    }
    if (analysis.key_concepts && analysis.key_concepts.length > 0) {
      outputText += `**Key Concepts:** ${analysis.key_concepts.join(', ')}\n`;
    }

    outputText += `\n---\n\n`;

    // Add file content
    if (file.content) {
      // For very large files, we might want to truncate or warn
      if (file.content.length > 50000) {
        outputText += `⚠️ **Large File Warning:** This file is ${file.content.length} characters long. Content shown below:\n\n`;
      }
      
      // Determine if we should format as code block
      const codeExtensions = ['py', 'ts', 'js', 'json', 'yaml', 'yml', 'toml', 'md', 'txt', 'f90', 'c', 'cpp', 'h'];
      const isCodeFile = codeExtensions.includes(extension.toLowerCase());
      
      if (isCodeFile && extension !== 'md') {
        // Format as code block with language
        const language = extension === 'py' ? 'python' 
                      : extension === 'ts' ? 'typescript'
                      : extension === 'js' ? 'javascript'
                      : extension === 'f90' ? 'fortran'
                      : extension;
        outputText += `\`\`\`${language}\n${file.content}\n\`\`\``;
      } else {
        // For markdown or other text files, include directly
        outputText += file.content;
      }
    } else {
      outputText += `*No content available for this file.*`;
    }

    return {
      content: [{
        type: "text" as const,
        text: outputText
      }]
    };

  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error retrieving file: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}