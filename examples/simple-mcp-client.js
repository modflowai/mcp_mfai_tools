#!/usr/bin/env node

/**
 * Simple MCP Client for Testing
 * Tests the MCP server in development mode without OAuth
 */

import http from 'http';

const MCP_SERVER_URL = 'http://localhost:8787/mcp';

// Simple MCP protocol implementation
class SimpleMCPClient {
  constructor(url) {
    this.url = url;
    this.requestId = 0;
  }

  async sendRequest(method, params = {}) {
    const requestId = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params
    };

    const postData = JSON.stringify(request);

    return new Promise((resolve, reject) => {
      const url = new URL(this.url);
      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  async initialize() {
    console.log('🔌 Initializing MCP connection...');
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'Simple MCP Test Client',
        version: '1.0.0'
      }
    });
    console.log('✅ Initialized:', result.serverInfo);
    return result;
  }

  async listTools() {
    console.log('📋 Listing available tools...');
    const result = await this.sendRequest('tools/list');
    console.log(`✅ Found ${result.tools.length} tools:`);
    result.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description.split('\n')[0].trim()}`);
    });
    return result.tools;
  }

  async callTool(name, args) {
    console.log(`🛠️  Calling tool: ${name}`, args);
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
    console.log(`✅ Tool result:`, result);
    return result;
  }
}

// Main test function
async function testMCPServer() {
  console.log('🚀 Starting MCP Client Test');
  console.log(`📡 Connecting to: ${MCP_SERVER_URL}`);
  console.log();

  const client = new SimpleMCPClient(MCP_SERVER_URL);

  try {
    // Initialize connection
    await client.initialize();
    console.log();

    // List available tools
    const tools = await client.listTools();
    console.log();

    // Test text search tool
    if (tools.find(t => t.name === 'text_search_repository')) {
      console.log('🔍 Testing text search...');
      await client.callTool('text_search_repository', {
        query: 'WEL well package',
        repository: 'mf6',
        limit: 2
      });
      console.log();
    }

    // Test semantic search tool
    if (tools.find(t => t.name === 'semantic_search_repository')) {
      console.log('🧠 Testing semantic search...');
      await client.callTool('semantic_search_repository', {
        query: 'groundwater flow modeling',
        repository: 'mf6',
        limit: 2
      });
      console.log();
    }

    // Test get file content tool
    if (tools.find(t => t.name === 'get_file_content')) {
      console.log('📄 Testing get file content...');
      await client.callTool('get_file_content', {
        repository: 'mf6',
        filepath: 'mf6io/well_wel_package.md'
      });
      console.log();
    }

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Check if server is reachable first
async function checkServer() {
  return new Promise((resolve, reject) => {
    const url = new URL(MCP_SERVER_URL);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: '/',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      resolve(res.statusCode < 500);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => resolve(false));
    req.end();
  });
}

// Run the test
(async () => {
  // Check if server is running
  console.log('🏃 Checking if MCP server is running...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('❌ MCP server is not reachable!');
    console.log('');
    console.log('To start the development server:');
    console.log('   cd /path/to/mcp_mfai_tools');
    console.log('   pnpm run dev');
    console.log('');
    console.log('The server should be available at: http://localhost:8787');
    process.exit(1);
  }

  console.log('✅ Server is reachable');
  console.log();

  await testMCPServer();
})();