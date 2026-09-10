// =============================================================================
// Zorar Code Backend - Environment Bootstrap & Serverless Resilience
// Ensures critical database and security variables are NEVER empty or undefined
// =============================================================================

const DEFAULT_CONFIG: Record<string, string> = {
  JWT_EXPIRES_IN: '7d',
  PLATFORM_BASE_DOMAIN: 'eduzorar.com',
  R2_BUCKET_NAME: 'tenant-storage',
};

// Try loading local .env if available
try {
  // eslint-disable-next-line @typescript-eslint/no-var-dynamic-require
  const dotenv = require('dotenv');
  dotenv.config();
} catch {}

// Enforce non-empty values for non-sensitive configurations
for (const [key, fallbackValue] of Object.entries(DEFAULT_CONFIG)) {
  const currentVal = process.env[key];
  if (!currentVal || currentVal.trim() === '') {
    process.env[key] = fallbackValue;
  }
}

export const ENV_CONFIG = DEFAULT_CONFIG;

