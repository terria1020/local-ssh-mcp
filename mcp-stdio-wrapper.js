#!/usr/bin/env node

/**
 * MCP Stdio Wrapper for Local SSH MCP Server
 *
 * This wrapper bridges Claude Code's stdio-based MCP protocol
 * with our HTTP-based MCP server that requires JWT authentication.
 *
 * Flow:
 * Claude Code <-> stdio <-> This Wrapper <-> HTTP+JWT <-> HTTP MCP Server
 */

const http = require('http');
const readline = require('readline');

// Configuration from environment variables
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://127.0.0.1:4000';
const TOKEN_PASSPHRASE = process.env.TOKEN_PASSPHRASE;

if (!TOKEN_PASSPHRASE) {
  console.error('Error: TOKEN_PASSPHRASE environment variable is required');
  process.exit(1);
}

// JWT token management
let jwtToken = null;
let tokenExpiry = null;

/**
 * Obtain JWT token from the MCP server
 */
async function obtainJWTToken() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      token_passphrase: TOKEN_PASSPHRASE
    });

    const url = new URL('/auth', MCP_SERVER_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.jwt) {
            jwtToken = response.jwt;
            // Token expires in 30 minutes, refresh 5 minutes before
            tokenExpiry = Date.now() + (25 * 60 * 1000);
            console.error(`[Wrapper] JWT token obtained, expires in 30 minutes`);
            resolve(jwtToken);
          } else {
            reject(new Error('Failed to obtain JWT token'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Check if token needs refresh
 */
async function ensureValidToken() {
  if (!jwtToken || Date.now() >= tokenExpiry) {
    console.error('[Wrapper] Refreshing JWT token...');
    await obtainJWTToken();
  }
}

/**
 * Make HTTP request to the MCP server
 */
async function makeHttpRequest(jsonrpcRequest) {
  await ensureValidToken();

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(jsonrpcRequest);

    const url = new URL('/mcp/jsonrpc', MCP_SERVER_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Handle MCP JSON-RPC request
 */
async function handleMCPRequest(request) {
  try {
    console.error(`[Wrapper] Handling request: ${request.method}`);

    // Forward the request to HTTP server
    const response = await makeHttpRequest(request);

    return response;
  } catch (error) {
    console.error(`[Wrapper] Error: ${error.message}`);
    return {
      jsonrpc: '2.0',
      id: request.id || null,
      error: {
        code: -32603,
        message: error.message
      }
    };
  }
}

/**
 * Main stdio loop
 */
async function main() {
  console.error('[Wrapper] MCP Stdio Wrapper starting...');
  console.error(`[Wrapper] Server URL: ${MCP_SERVER_URL}`);

  // Obtain initial token
  try {
    await obtainJWTToken();
  } catch (error) {
    console.error(`[Wrapper] Failed to obtain initial JWT token: ${error.message}`);
    process.exit(1);
  }

  // Set up readline interface for stdin/stdout
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  console.error('[Wrapper] Ready to accept MCP requests via stdin/stdout');

  // Process each line from stdin as a JSON-RPC request
  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      const response = await handleMCPRequest(request);

      // Write response to stdout (for Claude Code)
      console.log(JSON.stringify(response));
    } catch (error) {
      console.error(`[Wrapper] Failed to parse request: ${error.message}`);

      // Send error response
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error'
        }
      };
      console.log(JSON.stringify(errorResponse));
    }
  });

  rl.on('close', () => {
    console.error('[Wrapper] Stdin closed, exiting...');
    process.exit(0);
  });
}

// Handle signals
process.on('SIGTERM', () => {
  console.error('[Wrapper] SIGTERM received, exiting...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[Wrapper] SIGINT received, exiting...');
  process.exit(0);
});

// Start the wrapper
main().catch((error) => {
  console.error(`[Wrapper] Fatal error: ${error.message}`);
  process.exit(1);
});
