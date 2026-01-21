import dotenv from 'dotenv';

dotenv.config();

const correctAudience = 'api.thecloso.com';
const audience = process.env.VITE_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE;

console.log('--- Auth0 Configuration Verification ---');

if (audience === correctAudience) {
  console.log('✅ Auth0 audience is configured correctly.');
  console.log(`   - Current Value: \"${audience}\"`);
} else {
  console.log('❌ Error: Auth0 audience is not configured correctly.');
  console.log(`   - Expected Value: \"${correctAudience}\"`);
  console.log(`   - Current Value:  \"${audience || 'Not Set'}\"`);
  console.log('\\nTo fix this, set either VITE_AUTH0_AUDIENCE or AUTH0_AUDIENCE to the correct value in your .env file or deployment environment.');
}

console.log('------------------------------------');
