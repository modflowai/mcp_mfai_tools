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

// Try multiple search strategies to find the file
async function tryMultipleSearchStrategies(sql: NeonQueryFunction<false, false>, repository: string, filepath: string, primaryTable: string, primaryColumn: string) {
  const strategies = [];
  
  if (repository === 'flopy' || repository === 'pyemu') {
    // Strategy 1: Primary table (determined by heuristics)
    strategies.push({ table: primaryTable, column: primaryColumn, query: filepath });
    
    // Strategy 2: Try exact match in modules table (for full paths)
    if (primaryTable !== `${repository}_modules`) {
      strategies.push({ 
        table: `${repository}_modules`, 
        column: 'file_path', 
        query: filepath 
      });
    }
    
    // Strategy 3: Try partial match in modules table (for relative paths)
    if (primaryTable !== `${repository}_modules`) {
      strategies.push({ 
        table: `${repository}_modules`, 
        column: 'file_path', 
        query: `%${filepath}` // LIKE pattern
      });
    }
    
    // Strategy 4: Try workflows table
    const workflowTable = `${repository}_workflows`;
    const workflowColumn = repository === 'flopy' ? 'tutorial_file' : 'notebook_file';
    if (primaryTable !== workflowTable) {
      strategies.push({ table: workflowTable, column: workflowColumn, query: filepath });
    }
    
    // Strategy 5: Try repository_files
    if (primaryTable !== 'repository_files') {
      strategies.push({ table: 'repository_files', column: 'filepath', query: filepath });
    }
  } else {
    // For documentation repositories, only try repository_files
    strategies.push({ table: 'repository_files', column: 'filepath', query: filepath });
  }
  
  // Execute strategies in order until we find a result
  for (const strategy of strategies) {
    console.log(`[GET FILE] Trying ${strategy.table}.${strategy.column} with query: ${strategy.query}`);
    
    try {
      let result;
      
      if (strategy.table === 'repository_files') {
        if (strategy.query.startsWith('%')) {
          // Use LIKE for partial matches
          result = await sql`
            SELECT 
              content::text as content,
              analysis,
              filepath,
              file_type,
              created_at,
              length(content) as file_size
            FROM repository_files
            WHERE repo_name = ${repository}
              AND filepath LIKE ${strategy.query}
          `;
        } else {
          // Exact match
          result = await sql`
            SELECT 
              content::text as content,
              analysis,
              filepath,
              file_type,
              created_at,
              length(content) as file_size
            FROM repository_files
            WHERE repo_name = ${repository}
              AND filepath = ${strategy.query}
          `;
        }
      } else if (strategy.table === 'flopy_workflows') {
        result = await sql`
          SELECT 
            source_code::text as content,
            description as analysis,
            tutorial_file as filepath,
            'workflow' as file_type,
            NULL as created_at,
            length(source_code) as file_size,
            complexity,
            model_type as workflow_type,
            packages_used,
            workflow_purpose,
            best_use_cases,
            title
          FROM flopy_workflows
          WHERE tutorial_file = ${strategy.query}
        `;
      } else if (strategy.table === 'pyemu_workflows') {
        result = await sql`
          SELECT 
            source_code::text as content,
            description as analysis,
            notebook_file as filepath,
            'workflow' as file_type,
            NULL as created_at,
            length(source_code) as file_size,
            complexity,
            workflow_type,
            pyemu_modules as packages_used,
            workflow_purpose,
            common_applications as best_use_cases,
            title
          FROM pyemu_workflows
          WHERE notebook_file = ${strategy.query}
        `;
      } else if (strategy.table === 'flopy_modules' || strategy.table === 'pyemu_modules') {
        if (strategy.query.startsWith('%')) {
          // Use LIKE for partial matches
          result = await sql.query(`
            SELECT 
              source_code::text as content,
              module_docstring as analysis,
              CASE 
                WHEN file_path LIKE '/home/danilopezmella/%'
                THEN regexp_replace(file_path, '^/home/danilopezmella/[^/]+/[^/]+/', '')
                ELSE file_path
              END as filepath,
              'module' as file_type,
              NULL as created_at,
              length(source_code) as file_size,
              ${strategy.table === 'flopy_modules' ? 'package_code' : 'NULL as package_code'},
              ${strategy.table === 'flopy_modules' ? 'model_family' : 'category as model_family'},
              semantic_purpose
            FROM ${strategy.table}
            WHERE file_path LIKE $1
          `, [strategy.query]);
        } else {
          // For exact match, also try with the full path prefix pattern
          const fullPathPattern = `/home/danilopezmella/%/${strategy.query}`;
          result = await sql.query(`
            SELECT 
              source_code::text as content,
              module_docstring as analysis,
              CASE 
                WHEN file_path LIKE '/home/danilopezmella/%'
                THEN regexp_replace(file_path, '^/home/danilopezmella/[^/]+/[^/]+/', '')
                ELSE file_path
              END as filepath,
              'module' as file_type,
              NULL as created_at,
              length(source_code) as file_size,
              ${strategy.table === 'flopy_modules' ? 'package_code' : 'NULL as package_code'},
              ${strategy.table === 'flopy_modules' ? 'model_family' : 'category as model_family'},
              semantic_purpose
            FROM ${strategy.table}
            WHERE file_path = $1 OR file_path LIKE $2
          `, [strategy.query, fullPathPattern]);
        }
      }
      
      if (result && result.length > 0) {
        console.log(`[GET FILE] Found file in ${strategy.table}.${strategy.column}`);
        return result;
      }
    } catch (error) {
      console.log(`[GET FILE] Error querying ${strategy.table}: ${error}`);
      continue;
    }
  }
  
  return null;
}

// Tool schema definition
export const getFileContentSchema = {
  name: "get_file_content",
  description: 'Retrieves complete file content by exact filepath from MODFLOW/PEST repositories. Returns full source code or documentation with rich metadata including title, summary, key concepts, and file statistics. Supports all repositories: FloPy/PyEMU Python modules, MODFLOW 6 documentation, PEST guides, MODFLOW-USG workflows. Use after search tools to examine specific files in detail. Requires exact filepath from search results. Formats code with syntax highlighting and handles large files appropriately.',
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

    let result;
    let tableName: string;
    let fileColumn: string;
    
    // Determine which table to query based on repository and file type
    if (repository === 'flopy' || repository === 'pyemu') {
      // Strategy: Try multiple tables in order of likelihood
      // 1. First try as a module file (most common search result type)
      // 2. Then try as workflow/tutorial file  
      // 3. Finally try repository_files
      
      // Check if it looks like a full path (contains the repo name in path)
      const isFullPath = filepath.includes(`/${repository}/`);
      
      if (isFullPath || (filepath.endsWith('.py') && !filepath.includes('Notebooks/') && !filepath.includes('.ipynb'))) {
        // Try modules first for .py files that aren't notebooks
        tableName = repository === 'flopy' ? 'flopy_modules' : 'pyemu_modules';
        fileColumn = 'file_path';
      } else if (filepath.includes('Notebooks/') || filepath.endsWith('.ipynb') || filepath.includes('example')) {
        // Try workflows for notebooks and examples
        tableName = repository === 'flopy' ? 'flopy_workflows' : 'pyemu_workflows';
        fileColumn = repository === 'flopy' ? 'tutorial_file' : 'notebook_file';
      } else {
        // Default to repository_files for other files
        tableName = 'repository_files';
        fileColumn = 'filepath';
      }
    } else {
      // Documentation repositories use repository_files
      tableName = 'repository_files';
      fileColumn = 'filepath';
    }
    
    console.log(`[GET FILE] Attempting to query table: ${tableName}, column: ${fileColumn}`);
    
    // Try multiple search strategies with fallback
    result = await tryMultipleSearchStrategies(sql, repository, filepath, tableName, fileColumn);

    if (!result || result.length === 0) {
      return {
        content: [{
          type: "text" as const,
          text: `File not found: "${filepath}" in repository "${repository}"\n\nSearched in multiple tables but could not locate the file. Please verify the exact file path using the search tools.`
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
    if (file.title) {
      outputText += `**Title:** ${file.title}\n`;
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
    
    // Add workflow-specific metadata
    if (file.complexity) {
      outputText += `**Complexity:** ${file.complexity}\n`;
    }
    if (file.workflow_type) {
      outputText += `**Workflow Type:** ${file.workflow_type}\n`;
    }
    if (file.packages_used && Array.isArray(file.packages_used)) {
      outputText += `**Packages Used:** ${file.packages_used.join(', ')}\n`;
    }
    if (file.workflow_purpose) {
      outputText += `**Workflow Purpose:** ${file.workflow_purpose}\n`;
    }
    
    // Add module-specific metadata
    if (file.package_code) {
      outputText += `**Package Code:** ${file.package_code}\n`;
    }
    if (file.model_family) {
      outputText += `**Model Family:** ${file.model_family}\n`;
    }
    if (file.semantic_purpose) {
      outputText += `**Semantic Purpose:** ${file.semantic_purpose}\n`;
    }
    if (file.best_use_cases && Array.isArray(file.best_use_cases)) {
      outputText += `**Best Use Cases:**\n`;
      file.best_use_cases.forEach((useCase: string) => {
        outputText += `  - ${useCase}\n`;
      });
    }

    outputText += `\n---\n\n`;

    // Add file content
    if (file.content) {
      // For very large files, we might want to warn
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