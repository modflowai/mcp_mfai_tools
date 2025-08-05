/**
 * Minimal MCP Server with OAuth Authentication
 * HTTP Transport with GitHub and Google OAuth support
 */

import OAuthProvider from "@cloudflare/workers-oauth-provider";
import MultiProviderHandler from "./multi-provider-handler";
import MinimalMCP from "./mcp-agent";

// Export the Durable Object class
export { MinimalMCP };

// Create the OAuth provider
const oauthProvider = new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MinimalMCP.serve("/mcp", { binding: "MCP_OBJECT" }) as any,
  defaultHandler: MultiProviderHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});

// Export the OAuth provider as the main handler
export default oauthProvider;