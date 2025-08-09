/**
 * Get MODFLOW AI Information Tool
 * Provides comprehensive information about MODFLOW AI and available resources
 */

import type { NeonQueryFunction } from "@neondatabase/serverless";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Tool schema definition
export const getModflowAiInfoSchema = {
  name: "get_modflow_ai_info",
  description: `
    Get comprehensive information about MODFLOW AI, including what it is, 
    available repositories, capabilities, and how to use the MCP server.
    
    This tool provides:
    - Overview of MODFLOW AI and its purpose
    - List of available documentation repositories
    - List of available code repositories  
    - Statistics about the database content
    - Available search tools and their usage
    
    No parameters required - returns all information.
  `,
  inputSchema: {
    type: 'object',
    properties: {
      include_stats: {
        type: 'boolean',
        description: 'Include database statistics (file counts, etc.)',
        default: true
      }
    },
    required: []
  }
};

// Tool implementation
export async function getModflowAiInfo(args: any, sql: NeonQueryFunction<false, false>) {
  try {
    const { include_stats = true } = args || {};
    
    // Get list of repositories dynamically
    const repoQuery = `
      SELECT DISTINCT repo_name, COUNT(*) as file_count
      FROM repository_files
      GROUP BY repo_name
      ORDER BY repo_name;
    `;
    
    const workflowQuery = `
      SELECT 
        'flopy' as repo_name, 
        COUNT(*) as workflow_count 
      FROM flopy_workflows
      UNION ALL
      SELECT 
        'pyemu' as repo_name, 
        COUNT(*) as workflow_count 
      FROM pyemu_workflows;
    `;
    
    const moduleQuery = `
      SELECT 
        'flopy' as repo_name,
        COUNT(*) as module_count,
        COUNT(DISTINCT model_family) as model_families,
        COUNT(DISTINCT package_code) as package_codes
      FROM flopy_modules
      UNION ALL
      SELECT 
        'pyemu' as repo_name,
        COUNT(*) as module_count,
        COUNT(DISTINCT category) as categories,
        0 as package_codes
      FROM pyemu_modules;
    `;

    let repositories = [];
    let workflows = [];
    let modules = [];
    let totalFiles = 0;
    
    if (include_stats) {
      try {
        repositories = await sql(repoQuery);
        workflows = await sql(workflowQuery);
        modules = await sql(moduleQuery);
        totalFiles = repositories.reduce((sum: number, r: any) => sum + parseInt(r.file_count), 0);
      } catch (error) {
        console.warn('[MODFLOW AI INFO] Could not fetch statistics:', error);
      }
    }

    // Build the comprehensive response
    let response = `# MODFLOW AI - Groundwater Modeling Intelligence

## What is MODFLOW AI?

MODFLOW AI is an advanced Model Context Protocol (MCP) server that provides AI assistants with deep knowledge of groundwater modeling tools and documentation. It transforms your AI assistant (VSCode, Claude Desktop, Cursor) into a groundwater modeling expert with instant access to:

- **MODFLOW** (Modular Groundwater Flow Model) - USGS's industry-standard groundwater modeling software
- **PEST** (Parameter Estimation) - Sophisticated parameter estimation and uncertainty analysis tools
- **FloPy** - Python package for creating, running, and post-processing MODFLOW models
- **PyEMU** - Python framework for environmental model uncertainty analysis

## Purpose

MODFLOW AI bridges the gap between AI assistants and the extensive groundwater modeling ecosystem, providing structured access to technical documentation, code examples, and best practices that would otherwise require years of expertise to master.

## Available Resources

### Documentation Repositories
${repositories.length > 0 ? repositories.map((r: any) => 
  `- **${r.repo_name}**: ${r.file_count} documents`
).join('\n') : `- **modflowai**: MODFLOW AI documentation
- **mf6**: MODFLOW 6 documentation  
- **mfusg**: MODFLOW-USG documentation
- **pest**: PEST documentation
- **pestpp**: PEST++ documentation
- **pest_hp**: PEST_HP documentation
- **plproc**: Parameter list processor documentation
- **gwutils**: Groundwater utilities documentation`}

### Code Repositories
${modules.length > 0 ? modules.map((m: any) => {
  if (m.repo_name === 'flopy') {
    return `- **flopy**: ${m.module_count} modules, ${m.model_families} model families, ${m.package_codes} package types`;
  } else {
    return `- **pyemu**: ${m.module_count} modules, ${m.categories} categories`;
  }
}).join('\n') : `- **flopy**: Python package for MODFLOW (modules and tutorials)
- **pyemu**: Python framework for uncertainty analysis (modules and tutorials)`}

### Workflow Collections
${workflows.length > 0 ? workflows.map((w: any) => 
  `- **${w.repo_name}_workflows**: ${w.workflow_count} tutorials and examples`
).join('\n') : `- **flopy_workflows**: FloPy tutorials and examples
- **pyemu_workflows**: PyEMU tutorials and examples`}

${include_stats && totalFiles > 0 ? `
## Database Statistics
- Total documents: ${totalFiles}
- Workflow tutorials: ${workflows.reduce((sum: number, w: any) => sum + parseInt(w.workflow_count || 0), 0)}
- Code modules: ${modules.reduce((sum: number, m: any) => sum + parseInt(m.module_count || 0), 0)}
` : ''}

## Available Search Tools

### 1. search_docs
- **Purpose**: Full-text search for documentation
- **Best for**: Finding specific terms, parameters, error messages
- **Features**: Automatic acronym expansion, relevance ranking

### 2. semantic_search_docs  
- **Purpose**: AI-powered conceptual search
- **Best for**: Finding related concepts, "how to" questions
- **Features**: OpenAI embeddings, similarity matching

### 3. search_code
- **Purpose**: Search FloPy/PyEMU modules and APIs
- **Best for**: Finding functions, classes, implementation details
- **Features**: Package filtering, GitHub links

### 4. search_tutorials
- **Purpose**: Find tutorials and workflows
- **Best for**: Learning examples, step-by-step guides
- **Features**: Complexity levels, package usage

### 5. get_file_content
- **Purpose**: Retrieve complete file content
- **Best for**: Reading full documentation or source code
- **Features**: Pagination for large files

### 6. get_modflow_ai_info
- **Purpose**: This tool - provides overview and guidance
- **Best for**: Understanding MODFLOW AI capabilities

## How to Use MODFLOW AI

1. **For Concepts**: Use semantic_search_docs for understanding theory and concepts
2. **For Code**: Use search_code to find API details and implementations  
3. **For Learning**: Use search_tutorials for examples and workflows
4. **For Reference**: Use search_docs for specific terms and parameters
5. **For Details**: Use get_file_content to read complete files

## Key Features

- **Comprehensive Coverage**: 10+ groundwater modeling tools in one place
- **Instant Access**: No need to browse multiple websites or PDFs
- **Smart Search**: Both text and semantic search capabilities
- **Code Integration**: Direct access to FloPy and PyEMU implementations
- **Tutorial Library**: Hundreds of working examples and workflows

## Common Use Cases

1. **Model Development**: Find examples of specific MODFLOW packages
2. **Parameter Estimation**: Learn PEST setup and optimization strategies
3. **Uncertainty Analysis**: Access PyEMU workflows for Monte Carlo analysis
4. **Troubleshooting**: Search error messages and solutions
5. **Best Practices**: Learn from expert-validated tutorials

## Getting Started

Try these example queries:
- "How to create a well package in MODFLOW 6"
- "PEST pilot points tutorial"
- "FloPy river boundary condition example"
- "PyEMU parameter ensemble"
- "MODFLOW solvers comparison"

For more information, visit: https://mcp.modflow.ai`;

    return {
      content: [{
        type: "text" as const,
        text: response
      }]
    };

  } catch (error) {
    console.error('[MODFLOW AI INFO] Error:', error);
    return {
      content: [{
        type: "text" as const,
        text: `Error getting MODFLOW AI information: ${error instanceof Error ? error.message : 'Unknown error'}`
      }]
    };
  }
}