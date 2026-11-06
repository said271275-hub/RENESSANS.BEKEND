import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const databaseUrl = required('DATABASE_URL');
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
}

const directUrl = required('DIRECT_URL');
if (!/^postgres(?:ql)?:\/\//i.test(directUrl)) {
  throw new Error('DIRECT_URL must be a PostgreSQL connection URL.');
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  for (const [name, url] of [['DATABASE_URL', databaseUrl], ['DIRECT_URL', directUrl]]) {
    const sslMode = new URL(url).searchParams.get('sslmode');
    if (!sslMode || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      throw new Error(`Production ${name} must enable PostgreSQL SSL (sslmode=require).`);
    }
  }
}

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const frontendOrigins = new Set(
  [...configuredOrigins, 'http://localhost:3000', 'http://localhost:5173'].map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid FRONTEND_URL origin: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`FRONTEND_URL must use http or https: ${origin}`);
    }
    return parsed.origin;
  }),
);

const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port number.');
}

export const config = {
  databaseUrl,
  directUrl,
  frontendOrigins,
  jwtSecret,
  nodeEnv,
  port,
};
