import { parseTrustedProxies } from './proxy.js';
import { z } from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url().default('http://localhost:5173'),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  DEMO_DATE_ANCHOR: z.union([z.literal(''), z.iso.date()]).default(''),
  OWNER_USERNAME: z.string().min(1).max(80).default('owner'),
  OWNER_PASSWORD_HASH: z.string().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY_IPS: z.string().default(''),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const values = envSchema.parse(env);
  const origin = new URL(values.APP_ORIGIN);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.origin !== values.APP_ORIGIN ||
    origin.username ||
    origin.password
  ) {
    throw new Error('APP_ORIGIN must be an HTTP(S) origin without a path or credentials');
  }
  const demo = values.DEMO_MODE === 'true';
  if (!demo && values.DEMO_DATE_ANCHOR)
    throw new Error('DEMO_DATE_ANCHOR is only allowed in read-only demo mode');
  if (
    !demo &&
    origin.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  ) {
    throw new Error('Owner mode requires HTTPS outside localhost');
  }
  if (!demo && !/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(values.OWNER_PASSWORD_HASH)) {
    throw new Error(
      'Set OWNER_PASSWORD_HASH using npm run password, or explicitly enable DEMO_MODE',
    );
  }
  return {
    databaseUrl: values.DATABASE_URL,
    trustProxy: parseTrustedProxies(values.TRUST_PROXY_IPS),
    origin: values.APP_ORIGIN,
    demo,
    demoDateAnchor: values.DEMO_DATE_ANCHOR,
    username: values.OWNER_USERNAME,
    passwordHash: values.OWNER_PASSWORD_HASH,
    port: values.PORT,
    host: values.HOST,
    secureCookie: origin.protocol === 'https:',
  };
}
export type Config = ReturnType<typeof loadConfig>;
