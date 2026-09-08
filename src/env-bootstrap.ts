// =============================================================================
// Zorar Code Backend - Environment Bootstrap & Serverless Resilience
// Ensures critical database and security variables are NEVER empty or undefined
// =============================================================================

const DEFAULT_CONFIG: Record<string, string> = {
  DATABASE_URL:
    'postgresql://postgres.ywhgmfpkuymjfalduiqm:ItzVJXLE2n4zldVD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10',
  DIRECT_URL:
    'postgresql://postgres.ywhgmfpkuymjfalduiqm:ItzVJXLE2n4zldVD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
  SUPABASE_URL: 'https://ywhgmfpkuymjfalduiqm.supabase.co',
  JWT_SECRET: 'zorar-super-secure-jwt-secret-key-2026',
  JWT_EXPIRES_IN: '7d',
  YOUTUBE_AES_SECRET_KEY: 'zorar-secure-aes-video-key-32ch',
  PLATFORM_BASE_DOMAIN: 'eduzorar.com',
  R2_ACCOUNT_ID: '75f208b7d64533f666f12c10aea785a3',
  R2_ACCESS_KEY_ID: 'df5b4ea33d2694f25b5187047e5c4d0f',
  R2_SECRET_ACCESS_KEY: '41a99229928da4e76ebad1d4cc39f10b97de29c09bc63c9e0060d195577bf4f6',
  R2_BUCKET_NAME: 'tenant-storage',
  R2_ENDPOINT: 'https://75f208b7d64533f666f12c10aea785a3.r2.cloudflarestorage.com',
  R2_PUBLIC_DOMAIN: 'https://media.zorar-code.com',
};

// Try loading local .env if available
try {
  // eslint-disable-next-line @typescript-eslint/no-var-dynamic-require
  const dotenv = require('dotenv');
  dotenv.config();
} catch {}

// Enforce non-empty values for all critical configurations
for (const [key, fallbackValue] of Object.entries(DEFAULT_CONFIG)) {
  const currentVal = process.env[key];
  if (!currentVal || currentVal.trim() === '') {
    process.env[key] = fallbackValue;
  }
}

export const ENV_CONFIG = DEFAULT_CONFIG;
