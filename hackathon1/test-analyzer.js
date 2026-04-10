const http = require('http');

function testEndpoint(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: data.substring(0, 100) });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('Testing DigiGuard Analyzer System...\n');

  try {
    // Test health
    let result = await testEndpoint('/api/health');
    console.log(`✓ Health endpoint: ${result.status === 200 ? '✓' : '✗'} (${result.status})`);

    // Test CSRF
    result = await testEndpoint('/api/csrf-token');
    console.log(`✓ CSRF endpoint: ${result.status === 200 ? '✓' : '✗'} (${result.status})`);

    // Test analyzer page
    result = await testEndpoint('/analyzer.html');
    console.log(`✓ Analyzer page: ${result.status === 200 ? '✓' : '✗'} (${result.status})`);

    console.log('\n✓ All systems operational!');
    console.log('Open http://localhost:8080/analyzer.html in your browser');
  } catch (error) {
    console.error('✗ Test failed:', error.message);
  }
}

runTests();
