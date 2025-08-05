/**
 * Minimal MCP Agent with OAuth
 * Single tool implementation with authentication
 */

import { McpAgent } from "agents/mcp";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializeRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { neon } from '@neondatabase/serverless';
import { textSearchSchema as importedTextSearchSchema, textSearchTool } from "./tools/text-search.js";
import { semanticSearchSchema, semanticSearchTool } from "./tools/semantic-search.js";
import { getFileContentSchema, getFileContentTool } from "./tools/get-file-content.js";

interface Env {
  MODFLOW_AI_MCP_01_CONNECTION_STRING: string;
  MCP_OBJECT: DurableObjectNamespace;
  // User access control lists (comma-separated)
  ALLOWED_GITHUB_USERS?: string;
  ADMIN_GITHUB_USERS?: string;
  ALLOWED_GOOGLE_USERS?: string;
  ADMIN_GOOGLE_USERS?: string;
  DEBUG?: string;
}

// Context from the auth process, encrypted & stored in the auth token
export interface Props extends Record<string, unknown> {
  login: string;
  name: string;
  email: string;
  accessToken: string;
  provider?: 'github' | 'google'; // Track which OAuth provider was used
}

// Default users for development/fallback
const DEFAULT_ALLOWED_USERS = [
  // GitHub usernames
  "danilopezmella",
  "modflowai",
  // Add your GitHub username here
];

const DEFAULT_ALLOWED_EMAILS = [
  // Google emails
  "daniel.lopez.me@gmail.com",
  "admin@modflow.ai",
  // Add your Google email here
];

// Helper function to parse comma-separated user lists
function parseUserList(envVar: string | undefined, defaultList: string[]): Set<string> {
  if (!envVar || envVar.trim() === '') {
    return new Set(defaultList);
  }
  
  const users = envVar.split(',')
    .map(user => user.trim())
    .filter(user => user.length > 0);
  
  return new Set(users);
}

// Use the imported text search schema
const textSearchSchema = importedTextSearchSchema;

export default class MfaiToolsMCP extends McpAgent<Env, {}, Props> {
  server: Server;
  sql: any;  // Database connection
  
  // User access control lists
  private ALLOWED_GITHUB_USERS: Set<string> = new Set();
  private ALLOWED_GOOGLE_USERS: Set<string> = new Set();
  
  constructor(ctx: any, env: Env) {
    super(ctx, env);
    
    // Initialize user access lists
    this.ALLOWED_GITHUB_USERS = parseUserList(env.ALLOWED_GITHUB_USERS, DEFAULT_ALLOWED_USERS);
    this.ALLOWED_GOOGLE_USERS = parseUserList(env.ALLOWED_GOOGLE_USERS, DEFAULT_ALLOWED_EMAILS);
    
    this.server = new Server(
      {
        name: "MFAI Tools",
        version: "1.0.0",
        description: "MODFLOW AI MCP Server - Access and search groundwater modeling documentation.",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }
  
  async init() {
    // User context available via this.props
    const user = this.props;
    console.log(`[MCP] Initializing for user: ${user.login || user.email}`);
    
    // Check if user is allowed
    const isAllowed = this.checkUserAccess(user);
    
    if (!isAllowed) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Access denied. User ${user.login || user.email} (${user.provider || 'unknown'}) is not authorized to use this MCP server.`
      );
    }
    
    // Validate connection string
    if (!this.env.MODFLOW_AI_MCP_01_CONNECTION_STRING) {
      throw new McpError(
        ErrorCode.InternalError,
        "Database connection string is not configured"
      );
    }
    
    // Initialize database connection
    this.sql = neon(this.env.MODFLOW_AI_MCP_01_CONNECTION_STRING);
    
    // Handle initialization
    this.server.setRequestHandler(InitializeRequestSchema, async (request: any) => {
      const clientProtocolVersion = request.params?.protocolVersion || '2024-11-05';
      const supportedVersions = ['2024-11-05', '2025-03-26'];
      
      const protocolVersion = supportedVersions.includes(clientProtocolVersion) 
        ? clientProtocolVersion 
        : '2024-11-05';
      
      return {
        protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'MFAI Minimal Tools',
          version: '1.0.0',
          user: user.login || user.email,
        },
      };
    });
    
    // Register available tools
    const toolsList = [
      {
        name: textSearchSchema.name,
        description: textSearchSchema.description,
        inputSchema: textSearchSchema.inputSchema,
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
      }
    ];
    
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolsList,
    }));
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.log(`[MCP] User ${user.login || user.email} called tool: ${name}`);
      
      switch (name) {
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
    
    console.log("[MCP] Registered tools:", textSearchSchema.name, semanticSearchSchema.name, getFileContentSchema.name);
    console.log("[MCP] Allowed GitHub users:", Array.from(this.ALLOWED_GITHUB_USERS));
    console.log("[MCP] Allowed Google users:", Array.from(this.ALLOWED_GOOGLE_USERS));
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
  
  private async handleTextSearchRepository(args: any) {
    return await textSearchTool(args, this.sql);
  }
  
  private async handleSemanticSearchRepository(args: any) {
    return await semanticSearchTool(args, this.sql);
  }
  
  private async handleGetFileContent(args: any) {
    return await getFileContentTool(args, this.sql);
  }
}