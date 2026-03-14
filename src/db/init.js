import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'crm.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS interactions;
  DROP TABLE IF EXISTS leads;

  CREATE TABLE leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_id TEXT,
    title TEXT,
    company TEXT,
    description TEXT,
    url TEXT,
    contact_email TEXT,
    contact_name TEXT,
    
    -- Categorization
    category TEXT DEFAULT 'uncategorized',
    -- A: freelance_direct, B: agency, C: outbound_opportunity, D: fulltime_backup, X: discarded
    
    -- Scoring breakdown
    tech_score INTEGER DEFAULT 0,
    location_score INTEGER DEFAULT 0,
    type_score INTEGER DEFAULT 0,
    domain_score INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    
    -- Classification details
    detected_tech TEXT,
    detected_location TEXT,
    detected_type TEXT,
    rejection_reason TEXT,
    
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, source_id)
  );

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    context TEXT,
    sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE INDEX idx_leads_category ON leads(category);
  CREATE INDEX idx_leads_total_score ON leads(total_score DESC);
  CREATE INDEX idx_leads_status ON leads(status);
  CREATE INDEX idx_leads_source ON leads(source);
`);

console.log('Base de datos inicializada en:', DB_PATH);
db.close();
