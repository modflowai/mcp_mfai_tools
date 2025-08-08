#!/usr/bin/env -S npx tsx
/**
 * MODFLOW AI Documentation Updater
 * 
 * Updates the repository_files table with MODFLOW AI documentation:
 * 1. README_public.md - Detailed MCP server documentation
 * 2. Website content from https://www.modflow.ai - Marketing and overview
 * 
 * Usage: pnpm run update-docs
 */

import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Website content from firecrawl (run once)
function getWebsiteContent(): string {
  return `# Add Hydrogeology Expertise To Your Favorite AI - MODFLOW-AI MCP Server

AI-Powered Groundwater Modeling

Add Hydrogeology Expertise To Your Favorite AI

MODFLOW-AI MCP Server transforms VSCode, Claude Desktop, Cursor, and other AI assistants into groundwater modeling experts with deep knowledge of MODFLOW, PEST, FloPy, and more.

## What MODFLOW-AI Brings to Your Workflow

MODFLOW-AI enhances your AI assistant with deep groundwater modeling knowledge, making complex modeling tasks more accessible and efficient.

### AI-Powered Expertise
Transform any MCP-compatible AI into a hydrogeology expert with deep knowledge of groundwater modeling tools and techniques.

### Instant Knowledge Access
Get immediate answers to complex groundwater modeling questions without sifting through documentation or forums.

### Comprehensive Coverage
Access knowledge from 8+ major groundwater modeling tools including MODFLOW 6, PEST, FloPy, and more in one place.

### Modern Modeling Approach
Combine traditional hydrogeology expertise with AI assistance for more efficient model development.

### Model Building Assistance
Get help writing code, debugging models, and implementing advanced modeling techniques with AI guidance.

### Secure & Private
Your modeling data and queries remain private and secure, with no data retention or training on your content.

## Available Repositories

Search across documentation from all major groundwater modeling tools:

- **MODFLOW 6**: Latest USGS groundwater flow simulation
- **MODFLOW-USG**: Unstructured grids for complex geometries  
- **PEST**: Model calibration and uncertainty analysis
- **PEST++**: Tools for scalable parameter estimation and uncertainty analysis
- **PEST_HP**: Parallel computing for large-scale problems
- **gwutils**: Python utilities for groundwater data
- **FloPy**: A Python package to create, run, and post-process MODFLOW-based models
- **pyEMU**: Python modules for model-independent uncertainty analyses

## Search Capabilities

Advanced search technology designed for groundwater modeling documentation:

### Full-text Search
Traditional keyword-based search across all documentation with advanced filtering and ranking.

### Semantic Search
AI-powered embedding search that understands concepts and context, not just keywords.

### Real-time Results
Instant search results from multiple repositories with intelligent result aggregation.

### Context-aware
Search results that understand the relationship between different modeling concepts.

## How It Works

Transform your AI assistant into a groundwater modeling expert in three simple steps:

1. **Connect via MCP**: Integrate MODFLOW-AI MCP Server with your preferred AI assistant
2. **Ask complex questions**: Query about MODFLOW, PEST, FloPy, or other groundwater modeling tools
3. **Get expert responses**: Receive detailed, accurate answers instantly

## Use Cases

Real-world scenarios where MODFLOW-AI excels:

- Find specific utility functions in gwutils
- Search PEST parameter estimation methods  
- Locate MODFLOW 6 package documentation
- Compare features across different tools

## Elevating Hydrogeology Through AI

MODFLOW-AI preserves critical expertise and makes it accessible to everyone:

- Preserve and democratize decades of hydrogeology expertise
- Transform junior staff into confident modelers faster
- Access expert-level knowledge without waiting for availability
- Standardize excellence across all projects and team members
- Ensure critical knowledge doesn't walk out the door when experts retire`;

  return websiteContent;
}

// Get current directory for reading files
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(currentDir, '..');

async function readReadmeFile(): Promise<string> {
  const readmePath = path.join(projectRoot, 'README_public.md');
  console.log(`📖 Reading ${readmePath}...`);
  
  if (!fs.existsSync(readmePath)) {
    throw new Error(`README_public.md not found at ${readmePath}`);
  }
  
  return fs.readFileSync(readmePath, 'utf-8');
}

function generateAnalysis(title: string, description: string, content: string) {
  // Count key metrics
  const wordCount = content.split(/\s+/).length;
  const lineCount = content.split('\n').length;
  const headingCount = (content.match(/^#+\s/gm) || []).length;
  
  // Extract key concepts for MODFLOW AI docs
  const keyConcepts = [
    'MODFLOW AI MCP Server',
    'Groundwater Modeling',
    'Model Context Protocol',
    'AI Assistant Integration',
    'Hydrogeology Expertise',
    'Documentation Search',
    'Semantic Search',
    'MODFLOW 6',
    'PEST',
    'FloPy',
    'PyEMU'
  ];
  
  return {
    title,
    summary: description,
    key_concepts: keyConcepts,
    content_type: 'documentation',
    word_count: wordCount,
    line_count: lineCount,
    heading_count: headingCount,
    last_updated: new Date().toISOString(),
    source: 'modflowai_docs_updater'
  };
}

async function upsertDocumentation(
  sql: any,
  filepath: string,
  repoName: string,
  fileType: string,
  content: string,
  analysis: any
) {
  console.log(`💾 Upserting ${filepath} in ${repoName}...`);
  
  // Use UPSERT (INSERT ... ON CONFLICT ... DO UPDATE)
  const result = await sql`
    INSERT INTO repository_files (
      filepath,
      repo_name,
      file_type,
      content,
      analysis,
      created_at
    ) VALUES (
      ${filepath},
      ${repoName},
      ${fileType},
      ${content},
      ${JSON.stringify(analysis)},
      NOW()
    )
    ON CONFLICT (repo_name, filepath) 
    DO UPDATE SET
      content = EXCLUDED.content,
      analysis = EXCLUDED.analysis,
      created_at = NOW()
    RETURNING filepath, repo_name, length(content) as content_length
  `;
  
  if (result.length > 0) {
    const row = result[0];
    console.log(`✅ Success: ${row.filepath} (${row.content_length} characters)`);
  }
}

async function main() {
  console.log('=' .repeat(80));
  console.log('MODFLOW AI Documentation Updater');
  console.log('=' .repeat(80));
  console.log();
  
  // Get database connection string from environment
  const connectionString = process.env.MODFLOW_AI_MCP_01_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('MODFLOW_AI_MCP_01_CONNECTION_STRING environment variable not set');
  }
  
  const sql = neon(connectionString);
  
  try {
    // 1. Update README_public.md documentation
    console.log('📚 Processing README_public.md...');
    const readmeContent = await readReadmeFile();
    const readmeAnalysis = generateAnalysis(
      'MODFLOW AI MCP Server - Technical Documentation',
      'Comprehensive technical documentation for the MODFLOW AI Model Context Protocol server, including API reference, search capabilities, and usage examples.',
      readmeContent
    );
    
    await upsertDocumentation(
      sql,
      'README_public.md',
      'modflowai',
      'md',
      readmeContent,
      readmeAnalysis
    );
    
    // 2. Update website content (firecrawled once)
    console.log('🌐 Processing website content...');
    const websiteContent = getWebsiteContent();
    const websiteAnalysis = generateAnalysis(
      'MODFLOW AI - Official Website',
      'Official MODFLOW AI website content describing the MCP server, features, capabilities, and use cases for AI-powered groundwater modeling assistance.',
      websiteContent
    );
    
    await upsertDocumentation(
      sql,
      'website-homepage.md',
      'modflowai',
      'md',
      websiteContent,
      websiteAnalysis
    );
    
    // 3. Verify insertions
    console.log('\n📊 Verification...');
    const verification = await sql`
      SELECT 
        filepath,
        repo_name,
        length(content) as content_length,
        analysis->>'title' as title,
        created_at
      FROM repository_files 
      WHERE repo_name = 'modflowai'
      ORDER BY filepath
    `;
    
    console.log('\nUpdated files:');
    verification.forEach(row => {
      console.log(`  ✓ ${row.repo_name}/${row.filepath}`);
      console.log(`    Title: ${row.title}`);
      console.log(`    Size: ${row.content_length.toLocaleString()} characters`);
      console.log(`    Updated: ${row.created_at}`);
      console.log();
    });
    
    console.log('🎉 Successfully updated MODFLOW AI documentation!');
    console.log('\nUsers can now ask questions like:');
    console.log('  - "What is MODFLOW AI?"');
    console.log('  - "How does the MCP server work?"');
    console.log('  - "What search capabilities are available?"');
    console.log('  - "How do I integrate with my AI assistant?"');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Handle script execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as updateModflowAIDocs };