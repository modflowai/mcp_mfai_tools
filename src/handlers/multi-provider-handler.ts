import { Hono } from "hono";
import { Octokit } from "octokit";
import { renderProviderSelectionDialog, parseRedirectApproval, clientIdAlreadyApproved } from "../utils/workers-oauth-utils";
import { getUpstreamAuthorizeUrl, fetchUpstreamAuthToken, Props } from "../utils/utils";
import { getGoogleAuthUrl } from "./google-handler";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  HOSTED_DOMAIN?: string;
  COOKIE_ENCRYPTION_KEY: string;
  OAUTH_PROVIDER: OAuthHelpers;
  // User access control lists (comma-separated)
  ALLOWED_GITHUB_USERS?: string;
  ADMIN_GITHUB_USERS?: string;
  ALLOWED_GOOGLE_USERS?: string;
  ADMIN_GOOGLE_USERS?: string;
  // Python executor configuration
  PYTHON_EXECUTOR_URL?: string;
  PYTHON_EXECUTOR_API_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Main authorize endpoint - shows provider selection
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
    // For now, show the provider selection again
    // In production, you might want to store the last used provider
  }

  // Try to lookup client, or create a default one for MCP Playground
  let client;
  try {
    client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
  } catch (error) {
    // If client not found, create a default client object for MCP Playground
    if (clientId === 'blWJmAqpdqCZNZSJ') {
      client = {
        clientId: 'blWJmAqpdqCZNZSJ',
        clientName: 'MCP Playground',
        clientUri: 'https://playground.ai.cloudflare.com',
        redirectUris: ['https://playground.ai.cloudflare.com/oauth/callback']
      };
    } else {
      throw error;
    }
  }

  return renderProviderSelectionDialog(c.req.raw, {
    client: client,
    server: {
      name: "MFAI MCP Server",
      logo: "https://raw.githubusercontent.com/modflowai/public/refs/heads/main/public/modflow-ai-logo.svg",
      description: "MODFLOW AI Model Context Protocol Server - Access and search groundwater modeling documentation.",
    },
    state: { 
      oauthReqInfo,
      originalUrl: c.req.url
    },
  });
});

// Handle provider-specific authorize routes
app.post("/authorize/github", async (c) => {
  const formData = await c.req.formData();
  const stateStr = formData.get("state") as string;
  const state = JSON.parse(atob(stateStr));
  
  // Set approval cookie
  const headers = {
    'Set-Cookie': `oauth_approval_${state.oauthReqInfo.clientId}=approved; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
  
  // Redirect to GitHub OAuth
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getUpstreamAuthorizeUrl({
        upstream_url: "https://github.com/login/oauth/authorize",
        scope: "read:user user:email",
        client_id: c.env.GITHUB_CLIENT_ID,
        redirect_uri: new URL(c.req.url).origin + "/callback",
        state: btoa(
          JSON.stringify({
            redirect_uri: new URL(c.req.url).origin + "/callback",
            oauthReqInfo: state.oauthReqInfo,
            provider: 'github',
          })
        ),
      }),
    },
  });
});

app.post("/authorize/google", async (c) => {
  const formData = await c.req.formData();
  const stateStr = formData.get("state") as string;
  const state = JSON.parse(atob(stateStr));
  
  // Set approval cookie
  const headers = {
    'Set-Cookie': `oauth_approval_${state.oauthReqInfo.clientId}=approved; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`
  };
  
  // Redirect to Google OAuth
  return new Response(null, {
    status: 302,
    headers: {
      ...headers,
      location: getGoogleAuthUrl(c.req.raw, state.oauthReqInfo, c.env),
    },
  });
});

// Unified callback endpoint
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
  
  const { oauthReqInfo, provider } = stateData;

  // Handle Google callback
  if (provider === 'google') {
    const [accessToken, googleErrResponse] = await fetchUpstreamAuthToken({
      upstreamUrl: 'https://oauth2.googleapis.com/token',
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      code: code as string,
      redirectUri: new URL('/callback', c.req.url).href,
      grantType: 'authorization_code',
    });

    if (googleErrResponse) {
      console.error("Failed to fetch Google access token:", googleErrResponse);
      return googleErrResponse;
    }

    // Fetch the user info from Google
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      return c.text(`Failed to fetch user info: ${await userResponse.text()}`, 500);
    }

    const { id, name, email } = (await userResponse.json()) as {
      id: string;
      name: string;
      email: string;
    };

    const ctx: Props = {
      login: email, // Use email as login for Google
      name: name || email,
      email: email,
      accessToken: accessToken,
      provider: 'google', // Track the provider
    };

    // Complete the OAuth authorization
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: email, // Use email as userId for Google
      metadata: {
        label: name || email,
      },
      scope: oauthReqInfo.scope,
      props: ctx,
    });

    return Response.redirect(redirectTo);
  }
  
  // Handle GitHub callback
  if (provider === 'github' || !provider) {
    const [access_token, err] = await fetchUpstreamAuthToken({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code: code as string,
      redirect_uri: new URL('/callback', c.req.url).href,
      upstream_url: "https://github.com/login/oauth/access_token",
    });

    if (err) {
      console.error("Failed to fetch GitHub access token:", err);
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
      provider: 'github',
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
  }
  
  return c.text("Invalid provider", 400);
});

// Handle denial from the provider selection page
app.post("/authorize", async (c) => {
  const { state, headers, approved } = await parseRedirectApproval(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
  
  if (!state.oauthReqInfo) {
    return c.text("Invalid request", 400);
  }

  // If user denied, return an error page
  if (!approved) {
    const retryUrl = new URL(state.originalUrl || c.req.url);
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

  // This shouldn't happen since the provider selection submits to specific routes
  return c.text("Invalid request", 400);
});

// Workspace image proxy endpoint
app.get("/workspace-image/:userId/:filePath", async (c) => {
  // For now, we'll allow access to images if the user has a valid cookie
  // In production, you'd want stronger validation
  const sessionCookie = c.req.header("Cookie");
  console.log("Workspace image request - Cookie header:", sessionCookie ? "present" : "missing");
  
  const userId = c.req.param("userId");
  const filePath = c.req.param("filePath");
  
  if (!userId || !filePath) {
    return c.text("Invalid request", 400);
  }
  
  // TODO: Validate session and check if user has access to this workspace
  // For now, we'll proxy the request to the Python executor
  
  try {
    // Get Python executor credentials from environment
    const PYTHON_EXECUTOR_URL = c.env.PYTHON_EXECUTOR_URL || "http://python-executor.modflow.ai:8080";
    const PYTHON_EXECUTOR_API_KEY = c.env.PYTHON_EXECUTOR_API_KEY;
    
    if (!PYTHON_EXECUTOR_API_KEY) {
      console.error("PYTHON_EXECUTOR_API_KEY not configured");
      return c.text("Server configuration error", 500);
    }
    
    // Proxy the request to Python executor
    const imageUrl = `${PYTHON_EXECUTOR_URL}/public/workspace-image/${userId}/${filePath}`;
    console.log("Proxying to:", imageUrl);
    
    const response = await fetch(imageUrl, {
      headers: {
        'Authorization': `Bearer ${PYTHON_EXECUTOR_API_KEY}`
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python executor error: ${response.status} - ${errorText}`);
      return c.text(`Image not found: ${response.status}`, response.status);
    }
    
    // Get the image data and content type
    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Return the image with proper headers
    return new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Error proxying workspace image:', error);
    return c.text("Error loading image", 500);
  }
});

const MultiProviderHandler = app;
export default MultiProviderHandler;