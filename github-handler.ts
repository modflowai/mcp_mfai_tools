import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { Octokit } from "octokit";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl, Props } from "./utils";
import { clientIdAlreadyApproved, parseRedirectApproval, renderApprovalDialog } from "./workers-oauth-utils";

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const { clientId } = oauthReqInfo;
  if (!clientId) {
    return c.text("Invalid request: missing clientId", 400);
  }

  // Check if user wants to force re-authorization
  const url = new URL(c.req.url);
  const forceReauth = url.searchParams.get("prompt") === "consent";

  if (!forceReauth && await clientIdAlreadyApproved(c.req.raw, oauthReqInfo.clientId, c.env.COOKIE_ENCRYPTION_KEY)) {
    return redirectToGithub(c.req.raw, oauthReqInfo, c.env);
  }

  return renderApprovalDialog(c.req.raw, {
    client: await c.env.OAUTH_PROVIDER.lookupClient(clientId),
    server: {
      name: "MFAI MCP Server V1",
      logo: "https://raw.githubusercontent.com/modflowai/public/refs/heads/main/public/modflow-ai-logo.svg",
      description: "MODFLOW AI Model Context Protocol Server - Access and search groundwater modeling documentation.",
    },
    state: { 
      oauthReqInfo,
      originalUrl: c.req.url // Store the original URL with all parameters
    },
  });
});

app.post("/authorize", async (c) => {
  // Validates form submission, extracts state, and generates Set-Cookie headers to skip approval dialog next time
  const { state, headers, approved } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
  
  // Debug logging
  console.log("Form submission - approved:", approved);
  
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  // If user denied, return an error page
  if (!approved) {
    // Use the original URL that was stored in the state
    const retryUrl = new URL(state.originalUrl || c.req.url);
    // Add prompt=consent to force re-showing the dialog
    retryUrl.searchParams.set('prompt', 'consent');
    
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <title>Access Denied - MFAI MCP Server</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #000000;
            color: #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .error-container {
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 48px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
          }
          h1 {
            font-size: 24px;
            margin: 0 0 16px;
            color: #EF4444;
          }
          p {
            color: #9CA3AF;
            margin: 0 0 32px;
            line-height: 1.5;
          }
          .close-btn {
            background: linear-gradient(135deg, rgba(107, 114, 128, 0.8), rgba(75, 85, 99, 0.8));
            color: #FFFFFF;
            border: 1px solid rgba(255, 255, 255, 0.1);
            padding: 12px 32px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            transition: all 0.3s ease;
          }
          .close-btn:hover {
            background: linear-gradient(135deg, rgba(107, 114, 128, 1), rgba(75, 85, 99, 1));
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(107, 114, 128, 0.3);
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>Access Denied</h1>
          <p>You have cancelled the authorization request. No access was granted to the MFAI MCP Server.</p>
          <div style="display: flex; gap: 16px; justify-content: center;">
            <button class="close-btn" onclick="window.close()">Close Window</button>
            <a href="${retryUrl.toString()}" class="close-btn" style="background: linear-gradient(135deg, #00D2FF, #3B82F6); border-color: rgba(0, 210, 255, 0.3);">Try Again</a>
          </div>
        </div>
      </body>
      </html>
    `, {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      }
    });
  }

  return redirectToGithub(c.req.raw, state.oauthReqInfo, c.env, headers);
});

app.get("/callback", async (c) => {
  const { code, state } = c.req.query();
  
  if (!code || !state) {
    return c.text("Missing code or state parameter", 400);
  }
  
  // Parse the state parameter
  let stateData;
  try {
    stateData = JSON.parse(atob(state as string));
  } catch (e) {
    console.error("Failed to parse state:", e);
    return c.text("Invalid state parameter", 400);
  }
  
  const { redirect_uri, oauthReqInfo } = stateData;

  const [access_token, err] = await fetchUpstreamAuthToken({
    client_id: c.env.GITHUB_CLIENT_ID,
    client_secret: c.env.GITHUB_CLIENT_SECRET,
    code: code as string,
    redirect_uri,
    upstream_url: "https://github.com/login/oauth/access_token",
  });

  if (err) {
    console.error("Failed to fetch access token:", err);
    return err;
  }

  // Get user info from GitHub
  const octokit = new Octokit({ auth: access_token });
  const userResp = await octokit.rest.users.getAuthenticated();
  const user = userResp.data;

  const ctx: Props = {
    login: user.login,
    name: user.name || user.login,
    email: user.email || "",
    accessToken: access_token,
    provider: 'github', // Track the provider
  };

  // Complete the OAuth authorization
  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: user.login,
    metadata: {
      label: user.name || user.login,
    },
    scope: oauthReqInfo.scope,
    props: ctx,
  });

  return Response.redirect(redirectTo);
});


async function redirectToGithub(
  request: Request,
  oauthReqInfo: AuthRequest,
  env: Env,
  headers: Record<string, string> = {}
) {
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        upstream_url: "https://github.com/login/oauth/authorize",
        scope: "read:user user:email",
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: new URL(request.url).origin + "/callback",
        state: btoa(
          JSON.stringify({
            redirect_uri: new URL(request.url).origin + "/callback",
            oauthReqInfo,
          })
        ),
      }),
    },
  });
}

const GitHubHandler = app;
export default GitHubHandler;