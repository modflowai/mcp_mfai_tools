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
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in - ${params.server.name}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #000000;
            color: #FFFFFF;
            min-height: 100vh;
            overflow-x: hidden;
            position: relative;
        }

        /* Animated Background */
        .background {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -2;
            background: #000000;
        }

        .background::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: 
                linear-gradient(rgba(0, 210, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 210, 255, 0.03) 1px, transparent 1px);
            background-size: 50px 50px;
            animation: gridMove 20s linear infinite;
        }

        @keyframes gridMove {
            0% { transform: translate(0, 0); }
            100% { transform: translate(50px, 50px); }
        }

        /* Floating Background Elements */
        .floating-orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(40px);
            animation: float 6s ease-in-out infinite;
        }

        .orb-1 {
            width: 300px;
            height: 300px;
            background: radial-gradient(circle, rgba(0, 210, 255, 0.4), rgba(59, 130, 246, 0.2));
            top: 10%;
            left: 10%;
            animation-delay: 0s;
        }

        .orb-2 {
            width: 200px;
            height: 200px;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.3), rgba(0, 210, 255, 0.1));
            top: 60%;
            right: 15%;
            animation-delay: 2s;
        }

        .orb-3 {
            width: 150px;
            height: 150px;
            background: radial-gradient(circle, rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.2));
            bottom: 20%;
            left: 20%;
            animation-delay: 4s;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-20px) scale(1.1); }
        }

        /* Main Container */
        .container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            position: relative;
            z-index: 1;
        }

        .auth-card {
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 48px;
            max-width: 480px;
            width: 100%;
            position: relative;
            box-shadow: 
                0 25px 50px rgba(0, 0, 0, 0.5),
                0 0 0 1px rgba(0, 210, 255, 0.1),
                inset 0 1px 0 rgba(255, 255, 255, 0.1);
            animation: slideUp 0.8s ease-out;
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Corner Tech Accents */
        .auth-card::before,
        .auth-card::after {
            content: '';
            position: absolute;
            width: 20px;
            height: 20px;
            border: 2px solid #00D2FF;
        }

        .auth-card::before {
            top: 16px;
            left: 16px;
            border-right: none;
            border-bottom: none;
        }

        .auth-card::after {
            bottom: 16px;
            right: 16px;
            border-left: none;
            border-top: none;
        }

        /* Logo Section */
        .logo-container {
            text-align: center;
            margin-bottom: 32px;
            animation: fadeIn 1s ease-out 0.2s both;
        }

        .logo {
            width: 64px;
            height: 64px;
            border-radius: 16px;
            background: linear-gradient(135deg, #00D2FF, #3B82F6);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            box-shadow: 0 8px 32px rgba(0, 210, 255, 0.3);
        }

        .logo img {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            object-fit: contain;
        }

        /* Typography */
        .title {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #00D2FF, #FFFFFF);
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
            animation: fadeIn 1s ease-out 0.4s both;
        }

        .subtitle {
            font-size: 20px;
            font-weight: 600;
            color: #FFFFFF;
            margin-bottom: 8px;
            animation: fadeIn 1s ease-out 0.5s both;
        }

        .description {
            color: #9CA3AF;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 32px;
            animation: fadeIn 1s ease-out 0.6s both;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Permissions Section */
        .permissions {
            margin-bottom: 32px;
            animation: fadeIn 1s ease-out 0.8s both;
        }

        .permissions-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #FFFFFF;
        }

        .permissions-list {
            list-style: none;
        }

        .permissions-list li {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            color: #9CA3AF;
            font-size: 14px;
        }

        .permissions-list li::before {
            content: '';
            width: 6px;
            height: 6px;
            background: linear-gradient(135deg, #00D2FF, #3B82F6);
            border-radius: 50%;
            margin-right: 12px;
            box-shadow: 0 0 8px rgba(0, 210, 255, 0.5);
        }

        /* Provider Buttons */
        .provider-buttons {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 24px;
            animation: fadeIn 1s ease-out 1s both;
        }

        .provider-btn {
            width: 100%;
            padding: 16px 24px;
            height: 56px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            text-decoration: none;
            color: #FFFFFF;
        }

        .provider-btn-github {
            background: linear-gradient(135deg, rgba(66, 133, 244, 0.8), rgba(52, 168, 83, 0.8));
        }

        .provider-btn-github:hover {
            background: linear-gradient(135deg, #4285F4, #34A853);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(66, 133, 244, 0.5);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .provider-btn-google {
            background: linear-gradient(135deg, rgba(66, 133, 244, 0.8), rgba(52, 168, 83, 0.8));
        }

        .provider-btn-google:hover {
            background: linear-gradient(135deg, #4285F4, #34A853);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(66, 133, 244, 0.5);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .provider-icon {
            width: 20px;
            height: 20px;
            display: inline-block;
        }

        /* Cancel button */
        .cancel-container {
            text-align: center;
            animation: fadeIn 1s ease-out 1.2s both;
        }

        .cancel-link {
            color: #6B7280;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.3s ease;
        }

        .cancel-link:hover {
            color: #9CA3AF;
        }

        /* Footer */
        .footer {
            text-align: center;
            margin-top: 32px;
            animation: fadeIn 1s ease-out 1.4s both;
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 24px;
        }

        .footer-link {
            color: #6B7280;
            text-decoration: none;
            font-size: 14px;
            transition: color 0.3s ease;
        }

        .footer-link:hover {
            color: #00D2FF;
        }

        /* Mobile Responsive */
        @media (max-width: 640px) {
            .auth-card {
                padding: 32px 24px;
                margin: 16px;
            }

            .title {
                font-size: 24px;
            }

            .subtitle {
                font-size: 18px;
            }

            .footer-links {
                flex-direction: column;
                gap: 12px;
            }

            .orb-1, .orb-2, .orb-3 {
                display: none;
            }
        }

        @media (max-width: 480px) {
            .auth-card {
                padding: 24px 20px;
            }

            .title {
                font-size: 22px;
            }

            .subtitle {
                font-size: 16px;
            }

            .description {
                font-size: 15px;
            }
        }
    </style>
</head>
<body>
    <div class="background">
        <div class="floating-orb orb-1"></div>
        <div class="floating-orb orb-2"></div>
        <div class="floating-orb orb-3"></div>
    </div>

    <div class="container">
        <div class="auth-card">
            <div class="logo-container">
                <div class="logo">
                    ${params.server.logo ? `<img src="${params.server.logo}" alt="${params.server.name}" />` : ''}
                </div>
                <h1 class="title">Sign in to ${params.server.name}</h1>
                <h2 class="subtitle">Choose your sign-in method</h2>
                <p class="description">
                    Use your preferred account to access MODFLOW-AI resources
                </p>
            </div>

            <div class="permissions">
                <h3 class="permissions-title">By signing in, you'll get access to:</h3>
                <ul class="permissions-list">
                    <li>MODFLOW-AI repository documentation</li>
                    <li>Advanced search across groundwater modeling resources</li>
                    <li>Model Context Protocol tools for AI assistance</li>
                </ul>
            </div>

            <div class="provider-buttons">
                <form method="POST" action="/authorize/github" style="width: 100%;">
                    <input type="hidden" name="state" value="${stateStr}" />
                    <input type="hidden" name="approval" value="approve" />
                    <button type="submit" class="provider-btn provider-btn-github">
                        <svg class="provider-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                        Sign in with GitHub
                    </button>
                </form>

                <form method="POST" action="/authorize/google" style="width: 100%;">
                    <input type="hidden" name="state" value="${stateStr}" />
                    <input type="hidden" name="approval" value="approve" />
                    <button type="submit" class="provider-btn provider-btn-google">
                        <svg class="provider-icon" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Sign in with Google
                    </button>
                </form>
            </div>

            <div class="cancel-container">
                <form method="POST" action="/authorize" style="display: inline;">
                    <input type="hidden" name="state" value="${stateStr}" />
                    <input type="hidden" name="approval" value="deny" />
                    <button type="submit" class="cancel-link" style="background: none; border: none; cursor: pointer;">
                        Cancel
                    </button>
                </form>
            </div>

            <div class="footer">
                <div class="footer-links">
                    <a href="#" class="footer-link">Terms of Service</a>
                    <a href="#" class="footer-link">Privacy Policy</a>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}