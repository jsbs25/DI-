export interface Env {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  MESSENGER_ROOM?: DurableObjectNamespace;
  USER_PRESENCE?: DurableObjectNamespace;
  ENVIRONMENT?: string;
  CORS_ORIGINS?: string;
  DEV_LOGIN_ENABLED?: string;
  APP_URL?: string;
  VITE_API_BASE?: string;
}

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
