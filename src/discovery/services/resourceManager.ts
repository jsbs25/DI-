import { getDB } from '../database/index.js';
import { ResourceRecord } from '../types/index.js';

export function addOrUpdateResource(resource: ResourceRecord): boolean {
  const db = getDB();

  // Basic deduplication by normalized URL
  const normalizedUrl = normalizeURL(resource.url);

  const existing = db.prepare('SELECT id FROM resources WHERE url = ?').get(normalizedUrl) as { id: string } | undefined;

  if (existing) {
    // Update existing
    const stmt = db.prepare(`
      UPDATE resources SET
        name = ?, description = ?, updated_at = ?, last_checked_at = ?, status = ?
      WHERE url = ?
    `);
    stmt.run(
      resource.name,
      resource.description || null,
      Date.now(),
      Date.now(),
      resource.status,
      normalizedUrl
    );
    return false; // Indicating it was an update, not a new insertion
  } else {
    // Insert new
    const stmt = db.prepare(`
      INSERT INTO resources (
        id, name, url, domain, description, resource_type, planet, category,
        tags, language, country, icon, source, copyright_status, access_type,
        created_at, updated_at, last_checked_at, status, quality_score
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      resource.id,
      resource.name,
      normalizedUrl,
      resource.domain,
      resource.description || null,
      resource.resource_type,
      resource.planet,
      resource.category || null,
      resource.tags ? JSON.stringify(resource.tags) : null,
      resource.language || null,
      resource.country || null,
      resource.icon || null,
      resource.source || null,
      resource.copyright_status || null,
      resource.access_type || null,
      Date.now(),
      Date.now(),
      Date.now(),
      resource.status,
      resource.quality_score
    );
    return true; // Indicating a new insertion
  }
}

export function searchResources(query: string, planet?: string, limit = 20): ResourceRecord[] {
  const db = getDB();
  let sql = `
    SELECT r.* FROM resources r
    JOIN resources_fts f ON r.rowid = f.rowid
    WHERE resources_fts MATCH ?
  `;
  const params: any[] = [query];

  if (planet) {
    sql += ` AND r.planet = ?`;
    params.push(planet);
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : undefined
  }));
}

function normalizeURL(url: string): string {
  try {
    const u = new URL(url);
    u.hash = ''; // Remove hash
    // Remove common tracking params
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    return u.toString();
  } catch {
    return url;
  }
}
