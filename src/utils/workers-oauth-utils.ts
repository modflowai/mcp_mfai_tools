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
    <title>Sign in to ${params.server.name}</title>
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

        .title {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(135deg, #FFFFFF 0%, #D1D5DB 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }

        .description {
            color: #9CA3AF;
            font-size: 16px;
            line-height: 1.5;
        }

        /* Provider Buttons */
        .providers {
            margin: 32px 0;
        }

        .provider-title {
            text-align: center;
            color: #D1D5DB;
            font-size: 14px;
            margin-bottom: 24px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .provider-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            padding: 16px 24px;
            margin-bottom: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.03);
            color: #FFFFFF;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
        }

        .provider-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }

        .provider-icon {
            width: 24px;
            height: 24px;
            margin-right: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .provider-btn.github {
            background: linear-gradient(135deg, rgba(36, 41, 46, 0.8), rgba(36, 41, 46, 0.6));
            border-color: rgba(255, 255, 255, 0.1);
        }

        .provider-btn.github:hover {
            background: linear-gradient(135deg, rgba(36, 41, 46, 1), rgba(36, 41, 46, 0.8));
            border-color: rgba(255, 255, 255, 0.3);
        }

        .provider-btn.google {
            background: linear-gradient(135deg, rgba(66, 133, 244, 0.2), rgba(234, 67, 53, 0.1));
            border-color: rgba(66, 133, 244, 0.3);
        }

        .provider-btn.google:hover {
            background: linear-gradient(135deg, rgba(66, 133, 244, 0.3), rgba(234, 67, 53, 0.2));
            border-color: rgba(66, 133, 244, 0.5);
        }

        /* Footer */
        .footer {
            margin-top: 32px;
            text-align: center;
            animation: fadeIn 1s ease-out 1s both;
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 24px;
        }

        .footer-link {
            color: #6B7280;
            font-size: 14px;
            text-decoration: none;
            transition: color 0.3s ease;
        }

        .footer-link:hover {
            color: #D1D5DB;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
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
                <p class="description">
                    ${params.server.description || 'Choose your preferred sign-in method'}
                </p>
            </div>

            <div class="providers">
                <p class="provider-title">Continue with</p>
                
                <form method="POST" action="/authorize/github" style="margin: 0;">
                    <input type="hidden" name="state" value="${stateStr}" />
                    <button type="submit" class="provider-btn github">
                        <svg class="provider-icon" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 4.419 2.865 8.17 6.839 9.49.5.09.682-.218.682-.484 0-.236-.009-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.455-1.157-1.11-1.465-1.11-1.465-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                        </svg>
                        Sign in with GitHub
                    </button>
                </form>
                
                <form method="POST" action="/authorize/google" style="margin: 0;">
                    <input type="hidden" name="state" value="${stateStr}" />
                    <button type="submit" class="provider-btn google">
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
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}