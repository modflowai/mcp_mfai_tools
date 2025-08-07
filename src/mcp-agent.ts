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
// Import the six working tools
import { searchDocsSchema, searchDocs } from "./tools/search-docs.js";
import { semanticSearchDocsSchema, semanticSearchDocs } from "./tools/semantic-search-docs.js";
import { getFileContentSchema, getFileContentTool } from "./tools/get-file-content.js";
import { searchCodeSchema, searchCode } from "./tools/search-code.js";
import { searchTutorialsSchema, searchTutorials } from "./tools/search-tutorials.js";
import { semanticSearchTutorialsSchema, semanticSearchTutorials } from "./tools/semantic-search-tutorials.js";


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


export default class MfaiToolsMCP extends McpAgent<Env, {}, Props> {
  server: Server;
  sql: any;  // Database connection
  private env: Env;  // Store env reference
  protected props!: Props;  // Store props reference (assigned in init)
  
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
        provider: undefined
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
      {
        name: searchDocsSchema.name,
        description: searchDocsSchema.description,
        inputSchema: searchDocsSchema.inputSchema,
      },
      {
        name: semanticSearchDocsSchema.name,
        description: semanticSearchDocsSchema.description,
        inputSchema: semanticSearchDocsSchema.inputSchema,
      },
      {
        name: getFileContentSchema.name,
        description: getFileContentSchema.description,
        inputSchema: getFileContentSchema.inputSchema,
      },
      {
        name: searchCodeSchema.name,
        description: searchCodeSchema.description,
        inputSchema: searchCodeSchema.inputSchema,
      },
      {
        name: searchTutorialsSchema.name,
        description: searchTutorialsSchema.description,
        inputSchema: searchTutorialsSchema.inputSchema,
      },
      {
        name: semanticSearchTutorialsSchema.name,
        description: semanticSearchTutorialsSchema.description,
        inputSchema: semanticSearchTutorialsSchema.inputSchema,
      }
    ];
    
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolsList,
    }));
    
    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.log('[MCP] Raw request:', JSON.stringify(request, null, 2));
      console.log('[MCP] Request params:', JSON.stringify(request.params, null, 2));
      
      const { name, arguments: args } = request.params;
      console.log(`[MCP] User ${user.login || user.email} called tool: ${name}`);
      console.log('[MCP] Extracted args:', JSON.stringify(args, null, 2));
      
      switch (name) {
        case 'search_docs':
          return await this.handleSearchDocs(args);
        
        case 'semantic_search_docs':
          return await this.handleSemanticSearchDocs(args);
        
        case 'get_file_content':
          return await this.handleGetFileContent(args);
        
        case 'search_code':
          return await this.handleSearchCode(args);
        
        case 'search_tutorials':
          return await this.handleSearchTutorials(args);
        
        case 'semantic_search_tutorials':
          return await this.handleSemanticSearchTutorials(args);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name}`
          );
      }
    });
    
    console.log("[MCP] Registered tools:", searchDocsSchema.name, semanticSearchDocsSchema.name, getFileContentSchema.name, searchCodeSchema.name, searchTutorialsSchema.name, semanticSearchTutorialsSchema.name);
    
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
  
  // Tool handler methods
  private async handleSearchDocs(args: any) {
    return await searchDocs(args, this.sql);
  }
  
  private async handleSemanticSearchDocs(args: any) {
    return await semanticSearchDocs(args, this.sql, this.env.OPENAI_API_KEY);
  }
  
  private async handleGetFileContent(args: any) {
    return await getFileContentTool(args, this.sql);
  }
  
  private async handleSearchCode(args: any) {
    return await searchCode(args, this.sql);
  }

  private async handleSearchTutorials(args: any) {
    return await searchTutorials(args, this.sql);
  }

  private async handleSemanticSearchTutorials(args: any) {
    return await semanticSearchTutorials(args, this.sql, this.env.OPENAI_API_KEY);
  }
}