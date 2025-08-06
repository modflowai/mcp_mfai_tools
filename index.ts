/**
 * Minimal MCP Server with OAuth Authentication
 * HTTP Transport with GitHub and Google OAuth support
 * Supports development mode for local testing without OAuth
 */

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import MultiProviderHandler from "./multi-provider-handler";
import MinimalMCP from "./mcp-agent";

// Export the Durable Object class
export { MinimalMCP };

// Development mode handler - directly serves MCP without OAuth
async function developmentHandler(request: Request, env: any, ctx: any): Promise<Response> {
  console.log('[DEV MODE] Handling request:', request.url);
  
  const url = new URL(request.url);
  
  // Serve MCP directly at /mcp endpoint
  if (url.pathname === '/mcp') {
    // Get the Durable Object ID (use a fixed ID for development)
    const id = env.MCP_OBJECT.idFromName('development');
    // Get the Durable Object stub
    const stub = env.MCP_OBJECT.get(id);
    // Forward the request to the Durable Object
    return await stub.fetch(request);
  }
  
  // Serve status page for root
  if (url.pathname === '/') {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>MFAI Tools MCP Server - Development Mode</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .info { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0; }
          code { background: #f1f1f1; padding: 2px 5px; border-radius: 3px; }
        </style>
      </head>
      <body>
        <h1>🛠️ MFAI Tools MCP Server</h1>
        <h2>Development Mode Active</h2>
        
        <div class="warning">
          <strong>⚠️ Warning:</strong> This server is running in development mode with authentication disabled. 
          This should NEVER be used in production!
        </div>
        
        <div class="info">
          <h3>Available Endpoints:</h3>
          <ul>
            <li><code>/mcp</code> - MCP Protocol endpoint (no auth required)</li>
            <li><code>/</code> - This status page</li>
          </ul>
        </div>
        
        <div class="info">
          <h3>Available Tools:</h3>
          <ul>
            <li><strong>text_search_repository</strong> - Full-text search with acronym expansion</li>
            <li><strong>semantic_search_repository</strong> - Enhanced semantic search</li>
            <li><strong>get_file_content</strong> - Retrieve complete file content</li>
          </ul>
        </div>
        
        <div class="info">
          <h3>MCP Client Configuration:</h3>
          <pre>{
  "mcpServers": {
    "mfai-dev": {
      "url": "${url.origin}/mcp",
      "transport": {
        "type": "http"
      }
    }
  }
}</pre>
        </div>
        
        <p><small>Environment: DEVELOPMENT_MODE=${env.DEVELOPMENT_MODE}</small></p>
      </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  return new Response('Not Found', { status: 404 });
}

// Main handler - chooses between OAuth and development mode
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Check if in development mode
    if (env.DEVELOPMENT_MODE === 'true') {
      return await developmentHandler(request, env, ctx);
    }
    
    // Production mode - use OAuth provider
    const oauthProvider = new OAuthProvider({
      apiRoute: "/mcp",
      apiHandler: MinimalMCP.serve("/mcp", { binding: "MCP_OBJECT" }) as any,
      defaultHandler: MultiProviderHandler as any,
      authorizeEndpoint: "/authorize",
      tokenEndpoint: "/token",
      clientRegistrationEndpoint: "/register",
    });
    
    return await oauthProvider.fetch(request, env, ctx);
  }
};