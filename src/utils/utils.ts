/**
 * Utility functions for OAuth flow
 */

export interface Props extends Record<string, unknown> {
  login: string;
  name: string;
  email: string;
  accessToken: string;
  provider?: string;
}

export function getUpstreamAuthorizeUrl(params: {
  upstream_url: string;
  scope: string;
  client_id: string;
  redirect_uri: string;
  state: string;
}): string {
  const url = new URL(params.upstream_url);
  url.searchParams.set('client_id', params.client_id);
  url.searchParams.set('redirect_uri', params.redirect_uri);
  url.searchParams.set('scope', params.scope);
  url.searchParams.set('state', params.state);
  url.searchParams.set('response_type', 'code');
  return url.toString();
}

export async function fetchUpstreamAuthToken(params: {
  client_id?: string;
  client_secret?: string;
  clientId?: string;
  clientSecret?: string;
  code: string;
  redirect_uri?: string;
  redirectUri?: string;
  upstream_url?: string;
  upstreamUrl?: string;
  grantType?: string;
}): Promise<[string, Response | null]> {
  const tokenUrl = params.upstream_url || params.upstreamUrl;
  const clientId = params.client_id || params.clientId;
  const clientSecret = params.client_secret || params.clientSecret;
  const redirectUri = params.redirect_uri || params.redirectUri;
  
  if (!tokenUrl || !clientId || !clientSecret) {
    return ['', new Response('Missing required parameters', { status: 400 })];
  }

  const body = new URLSearchParams({
    grant_type: params.grantType || 'authorization_code',
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    ...(redirectUri && { redirect_uri: redirectUri }),
  });

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return ['', response];
    }

    const data = await response.json() as { access_token: string };
    return [data.access_token, null];
  } catch (error) {
    return ['', new Response(`Error fetching token: ${error}`, { status: 500 })];
  }
}