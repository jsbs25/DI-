export async function qAll<T = any>(db: D1Database, sql: string, ...binds: any[]): Promise<T[]> {
  if (!db) throw new Error('DB binding missing');
  const stmt = db.prepare(sql);
  const r = binds.length ? await stmt.bind(...binds).all<T>() : await stmt.all<T>();
  return (r.results || []) as T[];
}
export async function qFirst<T = any>(db: D1Database, sql: string, ...binds: any[]): Promise<T | null> {
  if (!db) throw new Error('DB binding missing');
  const stmt = db.prepare(sql);
  const r = binds.length ? await stmt.bind(...binds).first<T>() : await stmt.first<T>();
  return (r as T) ?? null;
}
export async function exec(db: D1Database, sql: string, ...binds: any[]) {
  if (!db) throw new Error('DB binding missing');
  const stmt = db.prepare(sql);
  return binds.length ? stmt.bind(...binds).run() : stmt.run();
}
export async function batch(db: D1Database, statements: D1PreparedStatement[]) {
  return db.batch(statements);
}
