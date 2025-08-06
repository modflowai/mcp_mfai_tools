import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { fetchUpstreamAuthToken, Props } from "../utils/utils";

interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  HOSTED_DOMAIN?: string;
  COOKIE_ENCRYPTION_KEY: string;
  OAUTH_PROVIDER: OAuthHelpers;
}

const app = new Hono<{ Bindings: Env }>();

// Google OAuth callback handler
app.get("/callback/google", async (c) => {
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

  const [accessToken, err] = await fetchUpstreamAuthToken({
    upstreamUrl: 'https://oauth2.googleapis.com/token',
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    code: code as string,
    redirectUri: redirect_uri,
    grantType: 'authorization_code',
  });

  if (err) {
    console.error("Failed to fetch Google access token:", err);
    return err;
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
});

export function getGoogleAuthUrl(
  request: Request,
  oauthReqInfo: AuthRequest,
  env: Env
): string {
  const params: Record<string, string> = {
    response_type: 'code',
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL(request.url).origin + "/callback",
    scope: 'email profile',
    state: btoa(
      JSON.stringify({
        redirect_uri: new URL(request.url).origin + "/callback",
        oauthReqInfo,
        provider: 'google',
      })
    ),
    access_type: 'offline',
    prompt: 'select_account',
  };

  // Add hosted domain if configured
  if (env.HOSTED_DOMAIN) {
    params.hd = env.HOSTED_DOMAIN;
  }

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries(params).forEach(([key, value]) => {
    googleAuthUrl.searchParams.set(key, value);
  });

  return googleAuthUrl.toString();
}

const GoogleHandler = app;
export default GoogleHandler;