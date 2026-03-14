import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../data/crm.db');

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function insertLead(lead) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO leads (
      source, source_id, title, company, description, url, 
      contact_email, contact_name, category,
      tech_score, location_score, type_score, domain_score, total_score,
      detected_tech, detected_location, detected_type, rejection_reason
    ) VALUES (
      @source, @source_id, @title, @company, @description, @url,
      @contact_email, @contact_name, @category,
      @tech_score, @location_score, @type_score, @domain_score, @total_score,
      @detected_tech, @detected_location, @detected_type, @rejection_reason
    )
  `);
  
  const result = stmt.run({
    source: lead.source,
    source_id: lead.source_id || null,
    title: lead.title || null,
    company: lead.company || null,
    description: lead.description || null,
    url: lead.url || null,
    contact_email: lead.contact_email || null,
    contact_name: lead.contact_name || null,
    category: lead.category || 'uncategorized',
    tech_score: lead.tech_score || 0,
    location_score: lead.location_score || 0,
    type_score: lead.type_score || 0,
    domain_score: lead.domain_score || 0,
    total_score: lead.total_score || 0,
    detected_tech: lead.detected_tech || null,
    detected_location: lead.detected_location || null,
    detected_type: lead.detected_type || null,
    rejection_reason: lead.rejection_reason || null
  });
  
  return result.changes > 0;
}

export function getLeads({ category, status, source, minScore, search, hasEmail, limit = 100 } = {}) {
  const db = getDb();

  // Always exclude discarded leads from UI
  let query = "SELECT * FROM leads WHERE category != 'discarded'";
  const params = {};

  if (category && category !== 'all') {
    query += ' AND category = @category';
    params.category = category;
  }

  if (status && status !== 'all') {
    query += ' AND status = @status';
    params.status = status;
  }

  if (source && source !== 'all') {
    query += ' AND source = @source';
    params.source = source;
  }

  if (minScore) {
    query += ' AND total_score >= @minScore';
    params.minScore = minScore;
  }

  if (search) {
    query += ' AND (title LIKE @search OR company LIKE @search OR description LIKE @search)';
    params.search = `%${search}%`;
  }

  if (hasEmail) {
    query += ' AND contact_email IS NOT NULL AND contact_email != ""';
  }

  query += ' ORDER BY total_score DESC LIMIT @limit';
  params.limit = limit;

  return db.prepare(query).all(params);
}

export function getLead(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

export function updateLead(id, updates) {
  const db = getDb();
  const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE leads SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
  return stmt.run({ id, ...updates });
}

export function updateLeadCategory(id, category) {
  return updateLead(id, { category });
}

export function updateLeadStatus(id, status) {
  return updateLead(id, { status });
}

export function deleteLead(id) {
  const db = getDb();
  return db.prepare('DELETE FROM leads WHERE id = ?').run(id);
}

export function getUncategorizedLeads() {
  const db = getDb();
  return db.prepare("SELECT * FROM leads WHERE category = 'uncategorized'").all();
}

export function updateLeadClassification(id, classification) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE leads SET 
      category = @category,
      tech_score = @tech_score,
      location_score = @location_score,
      type_score = @type_score,
      domain_score = @domain_score,
      total_score = @total_score,
      detected_tech = @detected_tech,
      detected_location = @detected_location,
      detected_type = @detected_type,
      rejection_reason = @rejection_reason,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  return stmt.run({ id, ...classification });
}

// Messages
export function insertMessage(leadId, content, context = null) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO messages (lead_id, content, context) VALUES (?, ?, ?)');
  return stmt.run(leadId, content, context);
}

export function getMessages(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
}

export function markMessageSent(id) {
  const db = getDb();
  return db.prepare('UPDATE messages SET sent = 1 WHERE id = ?').run(id);
}

// Interactions
export function addInteraction(leadId, type, content) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO interactions (lead_id, type, content) VALUES (?, ?, ?)');
  return stmt.run(leadId, type, content);
}

export function getInteractions(leadId) {
  const db = getDb();
  return db.prepare('SELECT * FROM interactions WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
}

// Stats (excluding discarded leads)
export function getStats() {
  const db = getDb();

  const byCategory = db.prepare(`
    SELECT category, COUNT(*) as count FROM leads WHERE category != 'discarded' GROUP BY category
  `).all();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM leads WHERE category != 'discarded' GROUP BY status
  `).all();

  const bySource = db.prepare(`
    SELECT source, COUNT(*) as count FROM leads WHERE category != 'discarded' GROUP BY source
  `).all();

  const highScore = db.prepare(`
    SELECT COUNT(*) as count FROM leads WHERE total_score >= 70 AND category != 'discarded'
  `).get();

  return {
    byCategory: Object.fromEntries(byCategory.map(r => [r.category, r.count])),
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
    bySource: Object.fromEntries(bySource.map(r => [r.source, r.count])),
    highScore: highScore.count
  };
}

export function getSources() {
  const db = getDb();
  return db.prepare('SELECT DISTINCT source FROM leads').all().map(r => r.source);
}

// Get all leads for reclassification
export function getAllLeadsForReclassification() {
  const db = getDb();
  return db.prepare('SELECT id, title, company, description, source FROM leads').all();
}

// ============================================
// PROSPECTS (Outbound sales)
// ============================================

export function initProspectsTable() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      url TEXT,
      location TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      contact_name TEXT,
      product_id TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'responded', 'converted', 'discarded')),
      search_query TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS prospect_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      message TEXT NOT NULL,
      sent BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
    CREATE INDEX IF NOT EXISTS idx_prospects_product ON prospects(product_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(contact_email);
  `);
}

export function insertProspect(prospect) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO prospects (
      source, source_id, name, description, url, location,
      contact_email, contact_phone, contact_name,
      product_id, status, search_query, notes
    ) VALUES (
      @source, @source_id, @name, @description, @url, @location,
      @contact_email, @contact_phone, @contact_name,
      @product_id, @status, @search_query, @notes
    )
  `);

  const result = stmt.run({
    source: prospect.source || 'manual',
    source_id: prospect.source_id || prospect.url || `manual_${Date.now()}`,
    name: prospect.name,
    description: prospect.description || null,
    url: prospect.url || null,
    location: prospect.location || null,
    contact_email: prospect.contact_email || null,
    contact_phone: prospect.contact_phone || null,
    contact_name: prospect.contact_name || null,
    product_id: prospect.product_id || null,
    status: prospect.status || 'new',
    search_query: prospect.search_query || null,
    notes: prospect.notes || null
  });

  if (result.changes > 0) {
    return db.prepare('SELECT * FROM prospects WHERE id = ?').get(result.lastInsertRowid);
  }
  return null;
}

export function getProspects({ product_id, status, hasEmail, search, limit = 100 } = {}) {
  const db = getDb();

  let query = 'SELECT * FROM prospects WHERE 1=1';
  const params = {};

  if (product_id && product_id !== 'all') {
    query += ' AND product_id = @product_id';
    params.product_id = product_id;
  }

  if (status && status !== 'all') {
    query += ' AND status = @status';
    params.status = status;
  }

  if (hasEmail) {
    query += ' AND contact_email IS NOT NULL AND contact_email != ""';
  }

  if (search) {
    query += ' AND (name LIKE @search OR description LIKE @search OR location LIKE @search)';
    params.search = `%${search}%`;
  }

  query += ' ORDER BY created_at DESC LIMIT @limit';
  params.limit = limit;

  return db.prepare(query).all(params);
}

export function getProspect(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
}

export function updateProspect(id, updates) {
  const db = getDb();
  const allowedFields = ['name', 'description', 'url', 'location', 'contact_email',
                         'contact_phone', 'contact_name', 'product_id', 'status', 'notes'];

  const filteredUpdates = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  if (Object.keys(filteredUpdates).length === 0) return null;

  const fields = Object.keys(filteredUpdates).map(k => `${k} = @${k}`).join(', ');
  const stmt = db.prepare(`UPDATE prospects SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`);
  stmt.run({ id, ...filteredUpdates });

  return db.prepare('SELECT * FROM prospects WHERE id = ?').get(id);
}

export function deleteProspect(id) {
  const db = getDb();
  return db.prepare('DELETE FROM prospects WHERE id = ?').run(id);
}

export function getProspectStats() {
  const db = getDb();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM prospects GROUP BY status
  `).all();

  const byProduct = db.prepare(`
    SELECT product_id, COUNT(*) as count FROM prospects WHERE product_id IS NOT NULL GROUP BY product_id
  `).all();

  const withEmail = db.prepare(`
    SELECT COUNT(*) as count FROM prospects WHERE contact_email IS NOT NULL AND contact_email != ''
  `).get();

  const total = db.prepare('SELECT COUNT(*) as count FROM prospects').get();

  return {
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
    byProduct: Object.fromEntries(byProduct.map(r => [r.product_id, r.count])),
    withEmail: withEmail.count,
    total: total.count
  };
}

// Prospect Messages
export function insertProspectMessage(prospectId, productId, message) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO prospect_messages (prospect_id, product_id, message)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(prospectId, productId, message);
  return db.prepare('SELECT * FROM prospect_messages WHERE id = ?').get(result.lastInsertRowid);
}

export function getProspectMessages(prospectId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM prospect_messages WHERE prospect_id = ? ORDER BY created_at DESC
  `).all(prospectId);
}

export function markProspectMessageSent(id) {
  const db = getDb();
  db.prepare('UPDATE prospect_messages SET sent = 1 WHERE id = ?').run(id);
  return db.prepare('SELECT * FROM prospect_messages WHERE id = ?').get(id);
}
