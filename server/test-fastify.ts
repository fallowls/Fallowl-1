/**
 * Simple test script to verify Fastify server starts correctly
 */
import { createFastifyServer } from './fastify';

async function test() {
  console.log('🧪 Testing Fastify server setup...\n');
  
  try {
    // Create the server
    console.log('1. Creating Fastify instance...');
    const fastify = await createFastifyServer();
    console.log('✅ Fastify instance created successfully\n');
    
    // Start the server on port 5001
    console.log('2. Starting server on port 5001...');
    await fastify.listen({ port: 5001, host: '0.0.0.0' });
    console.log('✅ Server started successfully\n');
    
    // Test the health endpoint
    console.log('3. Testing health endpoint...');
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health'
    });
    console.log(`✅ Health endpoint responded with status ${response.statusCode}`);
    console.log(`   Response: ${response.body}\n`);
    
    // Parse and validate response
    const data = JSON.parse(response.body);
    if (data.status === 'ok' && data.server === 'fastify') {
      console.log('✅ All tests passed!');
      console.log('   Fastify server is working correctly on port 5001');
      console.log('   Express server can continue running on port 5000\n');
    } else {
      console.log('❌ Health check response is invalid');
      process.exit(1);
    }
    
    // Close the server
    await fastify.close();
    console.log('✅ Server closed cleanly\n');
    
    console.log('========================================');
    console.log('Phase 1 Complete! ✅');
    console.log('========================================');
    console.log('Fastify foundation is ready for Phase 2');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

test();
