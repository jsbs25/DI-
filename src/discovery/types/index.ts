export interface ResourceRecord {
  id: string;
  name: string;
  url: string;
  domain: string;
  description?: string;
  resource_type: string;
  planet: string;
  category?: string;
  tags?: string[]; // Will be JSON serialized in DB
  language?: string;
  country?: string;
  icon?: string;
  source?: string;
  copyright_status?: string;
  access_type?: string;
  created_at: number;
  updated_at: number;
  last_checked_at: number;
  status: 'active' | 'invalid' | 'pending';
  quality_score: number;
}
