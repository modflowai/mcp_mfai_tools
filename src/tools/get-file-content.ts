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

// Check file size and metadata without loading content (pagination-aware)
async function checkFileMetadata(sql: NeonQueryFunction<false, false>, repository: string, filepath: string, primaryTable: string, primaryColumn: string) {
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
  
  // Execute strategies in order until we find a result (metadata only)
  for (const strategy of strategies) {
    console.log(`[GET FILE] Checking metadata in ${strategy.table}.${strategy.column} with query: ${strategy.query}`);
    
    try {
      let result;
      
      if (strategy.table === 'repository_files') {
        if (strategy.query.startsWith('%')) {
          // Use LIKE for partial matches - metadata only
          result = await sql`
            SELECT 
              analysis,
              filepath,
              file_type,
              created_at,
              length(content) as file_size,
              ${strategy.table} as source_table,
              ${strategy.column} as source_column,
              ${strategy.query} as source_query
            FROM repository_files
            WHERE repo_name = ${repository}
              AND filepath LIKE ${strategy.query}
          `;
        } else {
          // Exact match - metadata only
          result = await sql`
            SELECT 
              analysis,
              filepath,
              file_type,
              created_at,
              length(content) as file_size,
              ${strategy.table} as source_table,
              ${strategy.column} as source_column,
              ${strategy.query} as source_query
            FROM repository_files
            WHERE repo_name = ${repository}
              AND filepath = ${strategy.query}
          `;
        }
      } else if (strategy.table === 'flopy_workflows') {
        result = await sql`
          SELECT 
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
            title,
            ${strategy.table} as source_table,
            ${strategy.column} as source_column,
            ${strategy.query} as source_query
          FROM flopy_workflows
          WHERE tutorial_file = ${strategy.query}
        `;
      } else if (strategy.table === 'pyemu_workflows') {
        result = await sql`
          SELECT 
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
            title,
            ${strategy.table} as source_table,
            ${strategy.column} as source_column,
            ${strategy.query} as source_query
          FROM pyemu_workflows
          WHERE notebook_file = ${strategy.query}
        `;
      } else if (strategy.table === 'flopy_modules' || strategy.table === 'pyemu_modules') {
        if (strategy.query.startsWith('%')) {
          // Use LIKE for partial matches - metadata only
          const packageColumn = strategy.table === 'flopy_modules' ? 'package_code' : 'NULL as package_code';
          const familyColumn = strategy.table === 'flopy_modules' ? 'model_family' : 'category as model_family';
          result = await sql.query(`
            SELECT 
              module_docstring as analysis,
              CASE 
                WHEN file_path LIKE '/home/danilopezmella/%'
                THEN regexp_replace(file_path, '^/home/danilopezmella/[^/]+/[^/]+/', '')
                ELSE file_path
              END as filepath,
              'module' as file_type,
              NULL as created_at,
              length(source_code) as file_size,
              ${packageColumn},
              ${familyColumn},
              semantic_purpose,
              $2 as source_table,
              $3 as source_column,
              $4 as source_query
            FROM ${strategy.table}
            WHERE file_path LIKE $1
          `, [strategy.query, strategy.table, strategy.column, strategy.query]);
        } else {
          // For exact match, also try with the full path prefix pattern - metadata only
          const fullPathPattern = `/home/danilopezmella/%/${strategy.query}`;
          const packageColumn = strategy.table === 'flopy_modules' ? 'package_code' : 'NULL as package_code';
          const familyColumn = strategy.table === 'flopy_modules' ? 'model_family' : 'category as model_family';
          result = await sql.query(`
            SELECT 
              module_docstring as analysis,
              CASE 
                WHEN file_path LIKE '/home/danilopezmella/%'
                THEN regexp_replace(file_path, '^/home/danilopezmella/[^/]+/[^/]+/', '')
                ELSE file_path
              END as filepath,
              'module' as file_type,
              NULL as created_at,
              length(source_code) as file_size,
              ${packageColumn},
              ${familyColumn},
              semantic_purpose,
              $3 as source_table,
              $4 as source_column,
              $5 as source_query
            FROM ${strategy.table}
            WHERE file_path = $1 OR file_path LIKE $2
          `, [strategy.query, fullPathPattern, strategy.table, strategy.column, strategy.query]);
        }
      }
      
      if (result && result.length > 0) {
        console.log(`[GET FILE] Found file metadata in ${strategy.table}.${strategy.column}, size: ${result[0].file_size} characters`);
        return result[0]; // Return first match with metadata
      }
    } catch (error) {
      console.log(`[GET FILE] Error querying ${strategy.table} metadata: ${error}`);
      continue;
    }
  }
  
  return null;
}

// Load content with pagination support
async function loadFileContent(sql: NeonQueryFunction<false, false>, metadata: any, page?: number, force_full?: boolean) {
  const { source_table, source_column, source_query, file_size } = metadata;
  const SAFE_CONTENT_LIMIT = 70000;
  
  let needsPagination = file_size > SAFE_CONTENT_LIMIT && !force_full;
  let currentPage = 1;
  let totalPages = 1;
  
  if (needsPagination) {
    totalPages = Math.ceil(file_size / SAFE_CONTENT_LIMIT);
    currentPage = page || 1;
    
    if (currentPage < 1 || currentPage > totalPages) {
      throw new Error(`Invalid page number. File has ${totalPages} pages. Please specify a page between 1 and ${totalPages}.`);
    }
  }
  
  console.log(`[GET FILE] Loading content from ${source_table}, pagination: ${needsPagination}, page: ${currentPage}/${totalPages}`);
  
  try {
    let result;
    
    if (source_table === 'repository_files') {
      if (needsPagination) {
        // Load specific page using SUBSTRING
        const start = (currentPage - 1) * SAFE_CONTENT_LIMIT + 1; // PostgreSQL SUBSTRING is 1-indexed
        const length = SAFE_CONTENT_LIMIT;
        
        if (source_query.startsWith('%')) {
          result = await sql`
            SELECT SUBSTRING(content::text FROM ${start} FOR ${length}) as content
            FROM repository_files
            WHERE repo_name = ${metadata.repository || 'unknown'}
              AND filepath LIKE ${source_query}
          `;
        } else {
          result = await sql`
            SELECT SUBSTRING(content::text FROM ${start} FOR ${length}) as content
            FROM repository_files
            WHERE repo_name = ${metadata.repository || 'unknown'}
              AND filepath = ${source_query}
          `;
        }
      } else {
        // Load full content
        if (source_query.startsWith('%')) {
          result = await sql`
            SELECT content::text as content
            FROM repository_files
            WHERE repo_name = ${metadata.repository || 'unknown'}
              AND filepath LIKE ${source_query}
          `;
        } else {
          result = await sql`
            SELECT content::text as content
            FROM repository_files
            WHERE repo_name = ${metadata.repository || 'unknown'}
              AND filepath = ${source_query}
          `;
        }
      }
    } else if (source_table === 'flopy_workflows') {
      if (needsPagination) {
        const start = (currentPage - 1) * SAFE_CONTENT_LIMIT + 1;
        const length = SAFE_CONTENT_LIMIT;
        // Use query method with proper escaping for JSON content
        result = await sql.query(`
          SELECT SUBSTRING(source_code::text FROM $1 FOR $2) as content
          FROM flopy_workflows
          WHERE tutorial_file = $3
        `, [start, length, source_query]);
      } else {
        result = await sql`
          SELECT source_code::text as content
          FROM flopy_workflows
          WHERE tutorial_file = ${source_query}
        `;
      }
    } else if (source_table === 'pyemu_workflows') {
      if (needsPagination) {
        const start = (currentPage - 1) * SAFE_CONTENT_LIMIT + 1;
        const length = SAFE_CONTENT_LIMIT;
        // Use query method with proper escaping for JSON content
        result = await sql.query(`
          SELECT SUBSTRING(source_code::text FROM $1 FOR $2) as content
          FROM pyemu_workflows
          WHERE notebook_file = $3
        `, [start, length, source_query]);
      } else {
        result = await sql`
          SELECT source_code::text as content
          FROM pyemu_workflows
          WHERE notebook_file = ${source_query}
        `;
      }
    } else if (source_table === 'flopy_modules' || source_table === 'pyemu_modules') {
      if (needsPagination) {
        const start = (currentPage - 1) * SAFE_CONTENT_LIMIT + 1;
        const length = SAFE_CONTENT_LIMIT;
        
        if (source_query.startsWith('%')) {
          const query = `
            SELECT SUBSTRING(source_code::text FROM ${start} FOR ${length}) as content
            FROM ${source_table}
            WHERE file_path LIKE $1
          `;
          result = await sql.query(query, [source_query]);
        } else {
          const fullPathPattern = `/home/danilopezmella/%/${source_query}`;
          const query = `
            SELECT SUBSTRING(source_code::text FROM ${start} FOR ${length}) as content
            FROM ${source_table}
            WHERE file_path = $1 OR file_path LIKE $2
            LIMIT 1
          `;
          result = await sql.query(query, [source_query, fullPathPattern]);
        }
      } else {
        if (source_query.startsWith('%')) {
          const query = `
            SELECT source_code::text as content
            FROM ${source_table}
            WHERE file_path LIKE $1
          `;
          result = await sql.query(query, [source_query]);
        } else {
          const fullPathPattern = `/home/danilopezmella/%/${source_query}`;
          const query = `
            SELECT source_code::text as content
            FROM ${source_table}
            WHERE file_path = $1 OR file_path LIKE $2
            LIMIT 1
          `;
          result = await sql.query(query, [source_query, fullPathPattern]);
        }
      }
    }
    
    if (!result || result.length === 0 || !result[0].content) {
      throw new Error('Content not found or empty');
    }
    
    return {
      content: result[0].content,
      needsPagination,
      currentPage,
      totalPages,
      actualContentSize: result[0].content.length
    };
    
  } catch (error) {
    console.log(`[GET FILE] Error loading content: ${error}`);
    throw error;
  }
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
      page: {
        type: 'number',
        description: 'Page number for large files (1-based). Files over 70KB are automatically paginated.',
      },
      force_full: {
        type: 'boolean',
        description: 'Force full content retrieval even for large files (use with caution, may exceed token limits)',
      },
    },
    required: ['repository', 'filepath'],
  }
};

// Tool implementation
export async function getFileContentTool(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { repository, filepath, page, force_full = false } = args;

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
    
    // Step 1: Check file metadata first (no content loading)
    const metadata = await checkFileMetadata(sql, repository, filepath, tableName, fileColumn);

    if (!metadata) {
      return {
        content: [{
          type: "text" as const,
          text: `File not found: "${filepath}" in repository "${repository}"\n\nSearched in multiple tables but could not locate the file. Please verify the exact file path using the search tools.`
        }]
      };
    }

    // Step 2: Load content with pagination support
    let contentResult;
    try {
      // Add repository to metadata for content loading
      metadata.repository = repository;
      contentResult = await loadFileContent(sql, metadata, page, force_full);
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `Error loading file content: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }

    // Combine metadata and content
    const file = {
      ...metadata,
      content: contentResult.content,
      file_size: metadata.file_size
    };
    
    const { needsPagination, currentPage, totalPages, actualContentSize } = contentResult;
    
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
    let outputText = `# File Content: ${filepath}`;
    if (needsPagination) {
      outputText += ` (Part ${currentPage}/${totalPages})`;
    }
    outputText += `\n\n`;
    
    // Add pagination notice if applicable
    if (needsPagination) {
      outputText += `📄 **Large file notice:** This file is ${file.file_size.toLocaleString()} characters. Showing part ${currentPage} of ${totalPages} (${actualContentSize.toLocaleString()} characters loaded).\n`;
      if (currentPage < totalPages) {
        outputText += `• **Next part:** \`get_file_content(repository="${repository}", filepath="${filepath}", page=${currentPage + 1})\`\n`;
      }
      if (currentPage > 1) {
        outputText += `• **Previous part:** \`get_file_content(repository="${repository}", filepath="${filepath}", page=${currentPage - 1})\`\n`;
      }
      outputText += `• **Force full file:** \`get_file_content(repository="${repository}", filepath="${filepath}", force_full=true)\` ⚠️ May exceed token limits\n\n`;
    }
    
    outputText += `**Repository:** ${repository}\n`;
    outputText += `**File:** ${filename}\n`;
    outputText += `**Type:** ${file.file_type || extension || 'unknown'}\n`;
    outputText += `**Size:** ${file.file_size.toLocaleString()} characters\n`;
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
      // Add reminder for paginated content
      if (needsPagination && currentPage === 1 && totalPages > 1) {
        outputText += `⚠️ **Reminder:** This is only part 1 of ${totalPages}. To understand the full context, especially for documentation chapters, consider retrieving the remaining parts using the commands shown above.\n\n`;
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