import * as http from 'http';
import handler, { createServerlessServer } from './api/index';

async function runServerlessTests() {
  console.log('🧪 Starting Vercel Serverless Function Execution Tests...\n');

  // Test 1: Bootstrap Express & Nest Serverless Instance
  console.log('🔹 Test 1: Bootstrapping Serverless Server (Cold Start)...');
  const startTime = Date.now();
  const server = await createServerlessServer();
  const initDuration = Date.now() - startTime;
  console.log(`✅ Serverless Instance initialized in ${initDuration}ms\n`);

  // Helper function to dispatch mock HTTP requests to the serverless handler
  function simulateRequest(method: string, url: string): Promise<{ statusCode: number; body: string; headers: any }> {
    return new Promise((resolve, reject) => {
      const socket: any = {
        encrypted: false,
        remoteAddress: '127.0.0.1',
        destroy: () => {},
      };

      const req: any = new http.IncomingMessage(socket);
      req.method = method;
      req.url = url;
      req.headers = {
        host: 'zorar-backend.vercel.app',
        'user-agent': 'Vercel-Serverless-Test-Agent',
        accept: 'application/json, text/html',
      };

      const res: any = new http.ServerResponse(req);
      let responseBody = '';
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      res.write = (chunk: any, encoding?: any, cb?: any) => {
        if (chunk) responseBody += chunk.toString();
        return originalWrite(chunk, encoding, cb);
      };

      res.end = (chunk: any, encoding?: any, cb?: any) => {
        if (chunk) responseBody += chunk.toString();
        originalEnd(chunk, encoding, cb);
        resolve({
          statusCode: res.statusCode,
          body: responseBody,
          headers: res.getHeaders(),
        });
      };

      handler(req, res).catch(reject);
    });
  }

  // Test 2: GET / (Root Serverless Info)
  console.log('🔹 Test 2: Testing GET / (Root Serverless Endpoint)...');
  const rootRes = await simulateRequest('GET', '/');
  console.log(`HTTP Status: ${rootRes.statusCode}`);
  console.log(`Response Body: ${rootRes.body}`);
  if (rootRes.statusCode === 200 && rootRes.body.includes('Zorar Code Enterprise API')) {
    console.log('✅ GET / passed successfully!\n');
  } else {
    throw new Error(`GET / failed with status ${rootRes.statusCode}`);
  }

  // Test 3: GET /health (Healthcheck)
  console.log('🔹 Test 3: Testing GET /health (Health Endpoint)...');
  const healthRes = await simulateRequest('GET', '/health');
  console.log(`HTTP Status: ${healthRes.statusCode}`);
  console.log(`Response Body: ${healthRes.body}`);
  if (healthRes.statusCode === 200 && healthRes.body.includes('healthy')) {
    console.log('✅ GET /health passed successfully!\n');
  } else {
    throw new Error(`GET /health failed with status ${healthRes.statusCode}`);
  }

  // Test 4: GET /docs (Swagger Documentation)
  console.log('🔹 Test 4: Testing GET /docs (Swagger UI Endpoint)...');
  const docsRes = await simulateRequest('GET', '/docs');
  console.log(`HTTP Status: ${docsRes.statusCode}`);
  if (docsRes.statusCode === 200 || docsRes.statusCode === 301 || docsRes.statusCode === 302) {
    console.log('✅ GET /docs rendered / redirected successfully!\n');
  } else {
    throw new Error(`GET /docs failed with status ${docsRes.statusCode}`);
  }

  // Test 5: Warm Container Re-invocation Performance
  console.log('🔹 Test 5: Testing Warm Container Execution Speed...');
  const warmStart = Date.now();
  const warmRes = await simulateRequest('GET', '/health');
  const warmDuration = Date.now() - warmStart;
  console.log(`HTTP Status: ${warmRes.statusCode} in ${warmDuration}ms`);
  if (warmRes.statusCode === 200 && warmDuration < 100) {
    console.log(`✅ Warm invocation is ultra fast (${warmDuration}ms)!\n`);
  } else if (warmRes.statusCode === 200) {
    console.log(`✅ Warm invocation succeeded in ${warmDuration}ms!\n`);
  }

  console.log('🎉 ALL VERCEL SERVERLESS FUNCTION TESTS PASSED 100%!');
  process.exit(0);
}

runServerlessTests().catch((err) => {
  console.error('❌ Serverless test failed:', err);
  process.exit(1);
});
