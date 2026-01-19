/**
 * Environment variable validation and diagnostics
 * This helps identify configuration issues at startup
 */

export interface EnvValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  environment: 'development' | 'production' | 'unknown';
}

export function validateEnvironment(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Determine environment
  const nodeEnv = process.env.NODE_ENV || 'unknown';
  const environment = nodeEnv === 'production' ? 'production' : 
                     nodeEnv === 'development' ? 'development' : 'unknown';
  
  // Auto-detect BASE_URL if not provided
    if (!process.env.BASE_URL) {
      if (process.env.REPLIT_DEV_DOMAIN) {
        process.env.BASE_URL = `https://${process.env.REPLIT_DEV_DOMAIN}`;
      } else if (process.env.REPLIT_DOMAINS) {
        process.env.BASE_URL = `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
      } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        process.env.BASE_URL = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
      } else if (environment === 'development') {
        process.env.BASE_URL = 'http://localhost:5000';
      }
    }
  
  console.log('\n🔍 Environment Validation');
  console.log('========================');
  console.log(`Environment: ${environment}`);
  console.log(`Node Version: ${process.version}`);
  
  // Required for all environments
  if (!process.env.SESSION_SECRET) {
    errors.push('SESSION_SECRET is required for session security');
  }
  
  if (!process.env.DATABASE_URL) {
    // Check if we have parts to reconstruct it or if it's just missing
    if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
      process.env.DATABASE_URL = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`;
      console.log('✓ DATABASE_URL reconstructed from individual PG variables');
    } else {
      errors.push('DATABASE_URL is required for database connectivity');
    }
  }

  if (process.env.DATABASE_URL) {
    // Validate DATABASE_URL format
    try {
      const url = new URL(process.env.DATABASE_URL.replace('postgresql://', 'http://').replace('postgres://', 'http://'));
      console.log(`✓ Database configured: ${url.hostname}`);
    } catch (e) {
      errors.push('DATABASE_URL has invalid format');
    }
  }
  
  // Encryption key for webhook tokens
  if (!process.env.ENCRYPTION_KEY) {
    warnings.push('ENCRYPTION_KEY not set - using generated key (will change on restart)');
  } else {
    console.log('✓ ENCRYPTION_KEY configured');
  }
  
  // URL configuration
  const baseUrlSources = [];
  if (process.env.BASE_URL) {
    baseUrlSources.push(`BASE_URL: ${process.env.BASE_URL}`);
  }
  if (process.env.REPLIT_DOMAINS) {
    baseUrlSources.push(`REPLIT_DOMAINS: ${process.env.REPLIT_DOMAINS.split(',')[0]}`);
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    baseUrlSources.push(`REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN}`);
  }
  
  if (baseUrlSources.length === 0) {
    warnings.push('No BASE_URL configured - using localhost fallback');
  } else {
    console.log(`✓ URL configuration: ${baseUrlSources[0]}`);
  }
  
  // Production-specific checks
  if (environment === 'production') {
    if (!process.env.BASE_URL && !process.env.REPLIT_DOMAINS) {
      warnings.push('Production environment without BASE_URL or REPLIT_DOMAINS - webhooks may fail');
    }
    
    // Check for HTTP in BASE_URL
    if (process.env.BASE_URL && process.env.BASE_URL.startsWith('http://') && 
        !process.env.BASE_URL.includes('localhost')) {
      warnings.push('BASE_URL uses HTTP instead of HTTPS - this will be auto-corrected but should be fixed');
    }
    
    // CORS configuration
    if (!process.env.CLIENT_ORIGIN && !process.env.REPLIT_DOMAINS && !process.env.REPLIT_DEV_DOMAIN) {
      warnings.push('No CORS origins configured for production');
    }
  }
  
  // AWS-specific diagnostics
  if (process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV) {
    console.log('\n🔷 AWS Environment Detected');
    
    // VPC Lambda check
    if (process.env.AWS_EXECUTION_ENV?.includes('Lambda')) {
      warnings.push('AWS Lambda detected - ensure VPC has NAT Gateway for external connectivity');
    }
    
    // DNS resolution check
    if (!process.env.AWS_VPC_ID) {
      console.log('  - Not in VPC (has internet access)');
    } else {
      console.log(`  - VPC ID: ${process.env.AWS_VPC_ID}`);
      warnings.push('VPC environment - verify NAT Gateway and DNS settings if experiencing connection issues');
    }
  }
  
  // Network diagnostics
  console.log('\n🌐 Network Configuration');
  console.log(`  - Hostname: ${process.env.HOSTNAME || 'unknown'}`);
  console.log(`  - Port: 5000 (hardcoded)`);
  
  // Print results
  console.log('\n📋 Validation Results');
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    errors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warn => console.log(`  - ${warn}`));
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  ✅ All checks passed');
  }
  
  console.log('========================\n');
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    environment
  };
}

/**
 * Test database connectivity
 */
export async function testDatabaseConnection(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    console.error('❌ Cannot test database - DATABASE_URL not set');
    return false;
  }
  
  console.log('🔌 Testing database connection...');
  
  try {
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    await pool.end();
    
    console.log('✅ Database connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    
    if (error.code === 'EAI_AGAIN' || error.message?.includes('getaddrinfo')) {
      console.error('\n🔍 DNS Resolution Error Detected!');
      console.error('This error typically occurs in AWS VPC environments without proper network configuration.');
      console.error('\nRequired AWS Configuration:');
      console.error('  1. Place your application in PRIVATE subnets');
      console.error('  2. Create a NAT Gateway in a PUBLIC subnet');
      console.error('  3. Update route table: 0.0.0.0/0 → NAT Gateway');
      console.error('  4. Enable VPC DNS resolution and DNS hostnames');
      console.error('  5. Security group: Allow outbound HTTPS (443) and DNS (53)');
      console.error('\nAlternatively, if not using VPC resources:');
      console.error('  - Remove VPC configuration to use default networking\n');
    }
    
    return false;
  }
}
