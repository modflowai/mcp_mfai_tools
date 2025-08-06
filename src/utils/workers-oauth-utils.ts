/**
 * OAuth utilities for Cloudflare Workers
 */

import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

export async function clientIdAlreadyApproved(
  request: Request,
  clientId: string,
  encryptionKey: string
): Promise<boolean> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return false;
  
  const approvalCookie = `oauth_approval_${clientId}`;
  return cookie.includes(`${approvalCookie}=approved`);
}

export async function parseRedirectApproval(
  request: Request,
  encryptionKey: string
): Promise<{
  state: any;
  headers: Record<string, string>;
  approved: boolean;
}> {
  const formData = await request.formData();
  const approved = formData.get('approve') === 'true';
  const stateStr = formData.get('state') as string;
  const state = JSON.parse(atob(stateStr));
  
  const headers: Record<string, string> = {};
  if (approved && state.oauthReqInfo?.clientId) {
    headers['Set-Cookie'] = `oauth_approval_${state.oauthReqInfo.clientId}=approved; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`;
  }
  
  return { state, headers, approved };
}

export function renderApprovalDialog(
  request: Request,
  params: {
    client: any;
    server: {
      name: string;
      logo: string;
      description: string;
    };
    state: any;
  }
): Response {
  const stateStr = btoa(JSON.stringify(params.state));
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authorize ${params.client.name || 'Application'} - ${params.server.name}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
        }
        .auth-container {
          background: white;
          border-radius: 16px;
          padding: 48px;
          max-width: 480px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 24px;
          display: block;
        }
        h1 {
          font-size: 28px;
          margin: 0 0 16px;
          text-align: center;
          color: #1a202c;
        }
        .description {
          color: #4a5568;
          margin: 0 0 32px;
          text-align: center;
          line-height: 1.5;
        }
        .permissions {
          background: #f7fafc;
          border-radius: 8px;
          padding: 16px;
          margin: 0 0 32px;
        }
        .permissions h3 {
          font-size: 14px;
          text-transform: uppercase;
          color: #718096;
          margin: 0 0 12px;
          letter-spacing: 0.5px;
        }
        .permissions ul {
          margin: 0;
          padding: 0 0 0 20px;
          color: #2d3748;
        }
        .permissions li {
          margin: 8px 0;
        }
        .button-group {
          display: flex;
          gap: 16px;
        }
        button {
          flex: 1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }
        .approve-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .approve-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .deny-btn {
          background: #e2e8f0;
          color: #4a5568;
        }
        .deny-btn:hover {
          background: #cbd5e0;
        }
      </style>
    </head>
    <body>
      <div class="auth-container">
        <img src="${params.server.logo}" alt="${params.server.name}" class="logo">
        <h1>Authorize Access</h1>
        <p class="description">
          <strong>${params.client.name || 'This application'}</strong> wants to access your ${params.server.name} account.
        </p>
        <div class="permissions">
          <h3>This app will be able to:</h3>
          <ul>
            <li>Access MODFLOW documentation search</li>
            <li>Query modeling resources</li>
            <li>Read your basic profile information</li>
          </ul>
        </div>
        <form method="POST" class="button-group">
          <input type="hidden" name="state" value="${stateStr}">
          <button type="submit" name="approve" value="true" class="approve-btn">Authorize</button>
          <button type="submit" name="approve" value="false" class="deny-btn">Deny</button>
        </form>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export function renderProviderSelectionDialog(
  request: Request,
  params: {
    client: any;
    server: {
      name: string;
      logo: string;
      description: string;
    };
    state: any;
  }
): Response {
  const stateStr = btoa(JSON.stringify(params.state));
  
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign in - ${params.server.name}</title>
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
        .auth-container {
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 48px;
          max-width: 480px;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 32px;
          display: block;
          filter: brightness(0) invert(1);
        }
        h1 {
          font-size: 32px;
          margin: 0 0 16px;
          text-align: center;
          background: linear-gradient(135deg, #00D2FF, #3B82F6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .description {
          color: #9CA3AF;
          margin: 0 0 40px;
          text-align: center;
          line-height: 1.6;
          font-size: 16px;
        }
        .provider-buttons {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .provider-form {
          width: 100%;
        }
        .provider-btn {
          width: 100%;
          padding: 16px 24px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.05);
        }
        .github-btn:hover {
          background: linear-gradient(135deg, rgba(36, 41, 46, 0.8), rgba(36, 41, 46, 0.6));
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(36, 41, 46, 0.5);
        }
        .google-btn:hover {
          background: linear-gradient(135deg, rgba(66, 133, 244, 0.8), rgba(66, 133, 244, 0.6));
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(66, 133, 244, 0.5);
        }
        .provider-icon {
          width: 20px;
          height: 20px;
        }
        .divider {
          text-align: center;
          color: #6B7280;
          margin: 24px 0;
          position: relative;
        }
        .divider::before,
        .divider::after {
          content: '';
          position: absolute;
          top: 50%;
          width: 45%;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
        }
        .divider::before {
          left: 0;
        }
        .divider::after {
          right: 0;
        }
        .cancel-btn {
          width: 100%;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: transparent;
          color: #9CA3AF;
          margin-top: 16px;
        }
        .cancel-btn:hover {
          background: rgba(255, 255, 255, 0.05);
        }
      </style>
    </head>
    <body>
      <div class="auth-container">
        <img src="${params.server.logo}" alt="${params.server.name}" class="logo">
        <h1>Sign in</h1>
        <p class="description">
          Choose your preferred sign-in method to access ${params.server.name}
        </p>
        <div class="provider-buttons">
          <form method="POST" action="/authorize/github" class="provider-form">
            <input type="hidden" name="state" value="${stateStr}">
            <button type="submit" class="provider-btn github-btn">
              <svg class="provider-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              Continue with GitHub
            </button>
          </form>
          <form method="POST" action="/authorize/google" class="provider-form">
            <input type="hidden" name="state" value="${stateStr}">
            <button type="submit" class="provider-btn google-btn">
              <svg class="provider-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>
        <div class="divider">or</div>
        <form method="POST" action="/authorize">
          <input type="hidden" name="state" value="${stateStr}">
          <button type="submit" name="approve" value="false" class="cancel-btn">Cancel</button>
        </form>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}