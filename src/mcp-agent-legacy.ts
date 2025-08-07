/**
 * MCP Agent - Legacy Configuration (Simple and Reliable)
 * 
 * This is the reverted legacy configuration with simple, reliable Phase 1 tools:
 * - text_search_repository: Simple text search across all repositories
 * - semantic_search_repository: Simple semantic search with clear error handling  
 * - get_file_content: Direct file access by path
 * 
 * Phase 2 unified tools are disabled because they were too complex, unreliable, and hard to debug.
 * The backup of improvements is saved in search-code-backup.ts for future reference.
 */

import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { neon } from '@neondatabase/serverless';
// Phase 1: Legacy tools (simple, reliable, easier to debug)
import { textSearchSchema as importedTextSearchSchema, textSearchTool } from "./tools/text-search.js";
import { semanticSearchSchema, semanticSearchTool } from "./tools/semantic-search.js";
import { getFileContentSchema, getFileContentTool } from "./tools/get-file-content.js";

interface Env {
  MODFLOW_AI_MCP_01_CONNECTION_STRING: string;
  MCP_OBJECT: DurableObjectNamespace;
  OAUTH_KV: KVNamespace;
  DEBUG: string;
  DEVELOPMENT_MODE: string;
  ALLOWED_GITHUB_USERS: string;
  ALLOWED_GOOGLE_USERS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  OPENAI_API_KEY: string;
}

interface Props {
  login: string;
  name: string;
  email: string;
  provider: 'github' | 'google' | undefined;
  accessToken: string;
}

interface SessionState {
  user: Props;
}

export class MfaiToolsMCP {
  private sql: any;
  private env: Env;
  private server: any;
  private ALLOWED_GITHUB_USERS: Set<string>;
  private ALLOWED_GOOGLE_USERS: Set<string>;
  private isDevelopmentMode: boolean;

  constructor(server: any, env: Env) {
    this.server = server;
    this.env = env;
    this.isDevelopmentMode = env.DEVELOPMENT_MODE === 'true';
    
    // Parse allowed users from environment variables
    this.ALLOWED_GITHUB_USERS = new Set(
      env.ALLOWED_GITHUB_USERS ? env.ALLOWED_GITHUB_USERS.split(',').map(u => u.trim()) : []
    );
    this.ALLOWED_GOOGLE_USERS = new Set(
      env.ALLOWED_GOOGLE_USERS ? env.ALLOWED_GOOGLE_USERS.split(',').map(u => u.trim()) : []
    );
    
    // Initialize database connection
    this.sql = neon(env.MODFLOW_AI_MCP_01_CONNECTION_STRING);
  }

  async setupMCP(sessionState: SessionState) {
    console.log("[MCP] Setting up MCP with session state");
    
    // Mock user for development mode
    const user = this.isDevelopmentMode ? {
      login: 'dev-user',
      name: 'Development User', 
      email: 'dev@example.com',
      accessToken: 'dev-token',
      provider: 'development' as any,
    } : sessionState.user;

    // Check user access (skip in development mode)
    if (!this.isDevelopmentMode && !this.checkUserAccess(user)) {
      throw new Error('Access denied');
    }

    // Register list_tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      // Register available tools
      const toolsList = [
        // Phase 1: Legacy tools (simple and reliable)
        {
          name: importedTextSearchSchema.name,
          description: importedTextSearchSchema.description,
          inputSchema: importedTextSearchSchema.inputSchema,
        },
        {
          name: semanticSearchSchema.name,
          description: semanticSearchSchema.description,
          inputSchema: semanticSearchSchema.inputSchema,
        },
        {
          name: getFileContentSchema.name,
          description: getFileContentSchema.description,
          inputSchema: getFileContentSchema.inputSchema,
        },
      ];

      console.log('[MCP] Returning tools list with', toolsList.length, 'tools');
      return {
        tools: toolsList
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log('[MCP] Raw request:', JSON.stringify(request, null, 2));
      console.log('[MCP] Request params:', JSON.stringify(request.params, null, 2));
      
      const { name, arguments: args } = request.params;
      console.log(`[MCP] User ${user.login || user.email} called tool: ${name}`);
      console.log('[MCP] Extracted args:', JSON.stringify(args, null, 2));
      
      switch (name) {
        // Phase 1: Legacy tools (simple and reliable)
        case 'text_search_repository':
          return await this.handleTextSearchRepository(args);
        
        case 'semantic_search_repository':
          return await this.handleSemanticSearchRepository(args);
        
        case 'get_file_content':
          return await this.handleGetFileContent(args);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
    
    console.log("[MCP] Registered Phase 1 tools (legacy - simple and reliable):", importedTextSearchSchema.name, semanticSearchSchema.name, getFileContentSchema.name);
    
    if (this.isDevelopmentMode) {
      console.log("[MCP] ⚠️  DEVELOPMENT MODE ACTIVE - Authentication bypassed");
      console.log("[MCP] This mode should NEVER be used in production!");
    } else {
      console.log("[MCP] Production mode - OAuth authentication required");
      console.log("[MCP] Allowed GitHub users:", Array.from(this.ALLOWED_GITHUB_USERS));
      console.log("[MCP] Allowed Google users:", Array.from(this.ALLOWED_GOOGLE_USERS));
    }
  }
  
  private checkUserAccess(user: Props): boolean {
    // Check GitHub users (by username)
    if (user.provider === 'github' && user.login && this.ALLOWED_GITHUB_USERS.has(user.login)) {
      console.log(`[MCP] Authenticated GitHub user: ${user.login}`);
      return true;
    }
    
    // Check Google users (by email)
    if (user.provider === 'google' && user.email && this.ALLOWED_GOOGLE_USERS.has(user.email)) {
      console.log(`[MCP] Authenticated Google user: ${user.email}`);
      return true;
    }
    
    // For Google OAuth, the login field might contain the email
    if (user.provider === 'google' && user.login && this.ALLOWED_GOOGLE_USERS.has(user.login)) {
      console.log(`[MCP] Authenticated Google user: ${user.login}`);
      return true;
    }
    
    console.log(`[MCP] Authentication failed for user: ${user.login || user.email} (provider: ${user.provider})`);
    return false;
  }
  
  // Phase 1: Legacy tool handlers (simple and reliable)
  private async handleTextSearchRepository(args: any) {
    return await textSearchTool(args, this.sql);
  }
  
  private async handleSemanticSearchRepository(args: any) {
    return await semanticSearchTool(args, this.sql, this.env.OPENAI_API_KEY);
  }
  
  private async handleGetFileContent(args: any) {
    return await getFileContentTool(args, this.sql);
  }
}