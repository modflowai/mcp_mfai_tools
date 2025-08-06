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
import { searchExamplesSchema, searchExamples } from "./tools/search-examples.js";
import { searchCodeSchema, searchCode } from "./tools/search-code.js";
import { searchDocumentationSchema, searchDocumentation } from "./tools/search-documentation.js";

interface Env {
  MODFLOW_AI_MCP_01_CONNECTION_STRING: string;
  MCP_OBJECT: DurableObjectNamespace;
  // User access control lists (comma-separated)
  ALLOWED_GITHUB_USERS?: string;
  ADMIN_GITHUB_USERS?: string;
  ALLOWED_GOOGLE_USERS?: string;
  ADMIN_GOOGLE_USERS?: string;
  // OpenAI API key for semantic search
  OPENAI_API_KEY: string;
  DEBUG?: string;
  // Development mode - bypasses OAuth when set to "true"
  DEVELOPMENT_MODE?: string;
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
  private env: Env;  // Store env reference
  private props!: Props;  // Store props reference (assigned in init)
  
  // User access control lists
  private ALLOWED_GITHUB_USERS: Set<string> = new Set();
  private ALLOWED_GOOGLE_USERS: Set<string> = new Set();
  private isDevelopmentMode: boolean = false;
  
  constructor(ctx: any, env: Env) {
    super(ctx, env);
    this.env = env;  // Store for later access
    
    
    // Check if in development mode
    this.isDevelopmentMode = env.DEVELOPMENT_MODE === 'true';
    
    // Initialize user access lists
    this.ALLOWED_GITHUB_USERS = parseUserList(env.ALLOWED_GITHUB_USERS, DEFAULT_ALLOWED_USERS);
    this.ALLOWED_GOOGLE_USERS = parseUserList(env.ALLOWED_GOOGLE_USERS, DEFAULT_ALLOWED_EMAILS);
    
    this.server = new Server(
      {
        name: "MFAI Tools",
        version: "1.0.0",
        description: `MODFLOW AI MCP Server - Access and search groundwater modeling documentation.${this.isDevelopmentMode ? ' [DEVELOPMENT MODE]' : ''}`,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  }
  
  async init() {
    // User context available via base class props
    this.props = (this as any).props;  // Access from base class
    let user = this.props;
    
    if (this.isDevelopmentMode) {
      console.log('[MCP] Running in DEVELOPMENT MODE - OAuth bypassed');
      user = {
        login: 'dev-user',
        name: 'Development User',
        email: 'dev@localhost',
        accessToken: 'dev-token',
        provider: 'development'
      } as Props;
    } else {
      // User context available via base class props
      console.log(`[MCP] Initializing for user: ${user.login || user.email}`);
      
      // Check if user is allowed (only in production mode)
      const isAllowed = this.checkUserAccess(user);
      
      if (!isAllowed) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Access denied. User ${user.login || user.email} (${user.provider || 'unknown'}) is not authorized to use this MCP server.`
        );
      }
    }
    
    // Validate connection string
    if (!this.env.MODFLOW_AI_MCP_01_CONNECTION_STRING) {
      if (this.isDevelopmentMode) {
        console.warn('[MCP] ⚠️  WARNING: Database connection string not configured in development mode');
        console.warn('[MCP] Tools will return mock data or errors when database is needed');
        // Set a dummy connection string to avoid errors
        this.sql = () => Promise.resolve([]);
      } else {
        throw new McpError(
          ErrorCode.InternalError,
          "Database connection string is not configured"
        );
      }
    } else {
      // Initialize database connection
      this.sql = neon(this.env.MODFLOW_AI_MCP_01_CONNECTION_STRING);
    }

    
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
          name: `MFAI Minimal Tools${this.isDevelopmentMode ? ' [DEV]' : ''}`,
          version: '1.0.0',
          user: user.login || user.email,
          developmentMode: this.isDevelopmentMode,
        },
      };
    });
    
    // Register available tools
    const toolsList = [
      // Phase 2: Content-focused tools (primary)
      {
        name: searchExamplesSchema.name,
        description: searchExamplesSchema.description,
        inputSchema: searchExamplesSchema.inputSchema,
      },
      {
        name: searchCodeSchema.name,
        description: searchCodeSchema.description,
        inputSchema: searchCodeSchema.inputSchema,
      },
      {
        name: searchDocumentationSchema.name,
        description: searchDocumentationSchema.description,
        inputSchema: searchDocumentationSchema.inputSchema,
      },
      // Phase 1: Legacy tools (maintained for compatibility)
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
      // Utility tools
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
        // Phase 2: Content-focused tools
        case 'search_examples':
          return await this.handleSearchExamples(args);
        
        case 'search_code':
          return await this.handleSearchCode(args);
        
        case 'search_documentation':
          return await this.handleSearchDocumentation(args);
        
        // Phase 1: Legacy tools (maintained for compatibility)
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
    
    console.log("[MCP] Registered Phase 2 tools:", searchExamplesSchema.name, searchCodeSchema.name, searchDocumentationSchema.name);
    console.log("[MCP] Registered Phase 1 tools (legacy):", textSearchSchema.name, semanticSearchSchema.name, getFileContentSchema.name);
    
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
  
  // Phase 2: Content-focused tool handlers
  private async handleSearchExamples(args: any) {
    return await searchExamples(args, this.sql);
  }
  
  private async handleSearchCode(args: any) {
    return await searchCode(args, this.sql);
  }
  
  private async handleSearchDocumentation(args: any) {
    return await searchDocumentation(args, this.sql);
  }
  
  // Phase 1: Legacy tool handlers (maintained for compatibility)
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