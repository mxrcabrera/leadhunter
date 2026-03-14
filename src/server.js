import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import * as db from './db/database.js';
import { generateMessage, improveMessage, isOllamaRunning } from './rag/messages.js';
import { classifyLead } from './rag/classifier.js';
import { searchProspects, getProducts, getProduct, matchProductToQuery } from './scrapers/prospect-search.js';
import { extractContacts } from './scrapers/contact-extractor.js';
import { generateSalesMessage, improveSalesMessage } from './rag/sales-messages.js';
import { loadConfig, saveConfig, getConfigForUI } from './config.js';
import { testGoogleConnection } from './scrapers/google-custom-search.js';
import { orchestrate, runPipeline } from './agents/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Scrape endpoint
app.post('/api/scrape', (req, res) => {
  const scriptPath = path.join(__dirname, 'scrapers/run-all.js');
  const child = spawn('node', [scriptPath], {
    cwd: path.join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (data) => { output += data.toString(); });
  child.stderr.on('data', (data) => { output += data.toString(); });

  child.on('close', (code) => {
    if (code === 0) {
      // Parse JSON result from scraper output
      const jsonMatch = output.match(/__SCRAPE_RESULT__:(.+)/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[1]);
          res.json({ success: true, ...result, output });
        } catch {
          // Fallback to old parsing
          res.json({ success: true, added: 0, existing: 0, discarded: 0, output });
        }
      } else {
        res.json({ success: true, added: 0, existing: 0, discarded: 0, output });
      }
    } else {
      res.json({ success: false, error: output || 'Scrape failed' });
    }
  });
});

// Leads
app.get('/api/leads', (req, res) => {
  try {
    const { category, status, source, minScore, search, hasEmail, limit } = req.query;
    const leads = db.getLeads({
      category,
      status,
      source,
      minScore: minScore ? parseInt(minScore) : undefined,
      search,
      hasEmail: hasEmail === 'true',
      limit: limit ? parseInt(limit) : 100
    });
    res.json(leads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id', (req, res) => {
  try {
    const lead = db.getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/leads/:id', (req, res) => {
  try {
    db.updateLead(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/leads/:id/status', (req, res) => {
  try {
    db.updateLeadStatus(parseInt(req.params.id), req.body.status);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/leads/:id/category', (req, res) => {
  try {
    db.updateLeadCategory(parseInt(req.params.id), req.body.category);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/leads/:id', (req, res) => {
  try {
    db.deleteLead(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reclassify a lead
app.post('/api/leads/:id/reclassify', (req, res) => {
  try {
    const lead = db.getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const classification = classifyLead(lead);
    db.updateLeadClassification(lead.id, classification);
    
    res.json({ success: true, classification });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Messages
app.post('/api/leads/:id/generate-message', async (req, res) => {
  try {
    const lead = db.getLead(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    
    const messageType = lead.category === 'outbound_opportunity' ? 'outbound' : 'apply';
    const result = await generateMessage(lead, messageType);
    
    if (result.success) {
      db.insertMessage(lead.id, result.message, result.relevantExp);
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/improve', async (req, res) => {
  try {
    const { currentMessage, feedback } = req.body;
    const result = await improveMessage(currentMessage, feedback);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id/messages', (req, res) => {
  try {
    const messages = db.getMessages(parseInt(req.params.id));
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/messages/:id/sent', (req, res) => {
  try {
    db.markMessageSent(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Interactions
app.post('/api/leads/:id/interactions', (req, res) => {
  try {
    const { type, content } = req.body;
    db.addInteraction(parseInt(req.params.id), type, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id/interactions', (req, res) => {
  try {
    const interactions = db.getInteractions(parseInt(req.params.id));
    res.json(interactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add outbound opportunity manually
app.post('/api/outbound', (req, res) => {
  try {
    const { title, company, description, url, email, contact } = req.body;
    
    const classification = classifyLead({
      title, company, description
    });
    classification.category = 'outbound_opportunity';
    
    const wasAdded = db.insertLead({
      source: 'manual',
      source_id: `manual-${Date.now()}`,
      title,
      company,
      description,
      url,
      contact_email: email,
      contact_name: contact,
      ...classification
    });
    
    res.json({ success: wasAdded });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sources
app.get('/api/sources', (req, res) => {
  try {
    const sources = db.getSources();
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reclassify all leads (useful when profile changes)
app.post('/api/reclassify-all', (req, res) => {
  try {
    const leads = db.getAllLeadsForReclassification();
    let updated = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        const classification = classifyLead(lead);
        db.updateLeadClassification(lead.id, classification);
        updated++;
      } catch (e) {
        errors++;
      }
    }

    res.json({
      success: true,
      total: leads.length,
      updated,
      errors
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ollama status
app.get('/api/ollama/status', async (req, res) => {
  const running = await isOllamaRunning();
  res.json({ running });
});

// ============================================
// CONFIGURATION
// ============================================

// Get current config (masked for UI)
app.get('/api/config', (req, res) => {
  try {
    const config = getConfigForUI();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save config
app.post('/api/config', (req, res) => {
  try {
    const { google, ollama } = req.body;
    const currentConfig = loadConfig();

    const newConfig = {
      google: {
        apiKey: google?.apiKey !== undefined ? google.apiKey : currentConfig.google.apiKey,
        cx: google?.cx !== undefined ? google.cx : currentConfig.google.cx
      },
      ollama: {
        url: ollama?.url || currentConfig.ollama.url,
        model: ollama?.model || currentConfig.ollama.model
      }
    };

    const saved = saveConfig(newConfig);
    if (saved) {
      res.json({ success: true, message: 'Configuration saved' });
    } else {
      res.status(500).json({ error: 'Failed to save configuration' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Google API connection
app.get('/api/config/test-google', async (req, res) => {
  try {
    const result = await testGoogleConnection();
    res.json(result);
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// PROSPECTS (Outbound sales)
// ============================================

// Initialize prospects table on startup
db.initProspectsTable();

// Get all products
app.get('/api/products', (req, res) => {
  try {
    const products = getProducts();
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific product
app.get('/api/products/:id', (req, res) => {
  try {
    const product = getProduct(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search prospects (scraping)
app.post('/api/prospects/search', async (req, res) => {
  try {
    const { query, location, limit, extractEmails } = req.body;

    if (!query || query.length < 3) {
      return res.status(400).json({ error: 'Query must be at least 3 characters' });
    }

    console.log(`[API] Searching prospects: "${query}" in "${location || 'any'}"`);

    const result = await searchProspects(query, location || '', {
      limit: limit || 30,
      extractEmails: extractEmails !== false
    });

    res.json({
      success: true,
      query: result.query,
      location: result.location,
      matchedProduct: result.matchedProduct ? {
        id: result.matchedProduct.id,
        name: result.matchedProduct.name
      } : null,
      results: result.results,
      stats: result.stats,
      sources: result.sources || []
    });

  } catch (error) {
    console.error('[API] Prospect search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Match product to query (without searching)
app.post('/api/prospects/match-product', (req, res) => {
  try {
    const { query } = req.body;
    const product = matchProductToQuery(query || '');
    res.json({
      success: true,
      product: product ? { id: product.id, name: product.name } : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save a prospect
app.post('/api/prospects', (req, res) => {
  try {
    const prospect = db.insertProspect(req.body);
    if (prospect) {
      res.json({ success: true, prospect });
    } else {
      res.json({ success: false, message: 'Prospect already exists' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get saved prospects
app.get('/api/prospects', (req, res) => {
  try {
    const { product_id, status, hasEmail, search, limit } = req.query;
    const prospects = db.getProspects({
      product_id,
      status,
      hasEmail: hasEmail === 'true',
      search,
      limit: limit ? parseInt(limit) : 100
    });
    res.json({ success: true, prospects });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Extract email from URL (called when saving a prospect)
app.post('/api/prospects/extract-email', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.json({ email: null, phone: null });
    const contacts = await extractContacts(url);
    res.json({ email: contacts.primaryEmail, phone: contacts.primaryPhone });
  } catch {
    res.json({ email: null, phone: null });
  }
});

// Get prospect stats
app.get('/api/prospects/stats', (req, res) => {
  try {
    const stats = db.getProspectStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific prospect
app.get('/api/prospects/:id', (req, res) => {
  try {
    const prospect = db.getProspect(parseInt(req.params.id));
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    res.json({ success: true, prospect });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a prospect
app.patch('/api/prospects/:id', (req, res) => {
  try {
    const prospect = db.updateProspect(parseInt(req.params.id), req.body);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found or no changes' });
    res.json({ success: true, prospect });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a prospect
app.delete('/api/prospects/:id', (req, res) => {
  try {
    db.deleteProspect(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate sales message for a prospect
app.post('/api/prospects/:id/generate-message', async (req, res) => {
  try {
    const prospect = db.getProspect(parseInt(req.params.id));
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const productId = req.body.product_id || prospect.product_id;
    if (!productId) {
      return res.status(400).json({ error: 'No product associated with this prospect' });
    }

    const result = await generateSalesMessage(prospect, productId);

    if (result.success) {
      // Save the message
      db.insertProspectMessage(prospect.id, productId, result.message);
    }

    res.json(result);

  } catch (error) {
    console.error('[API] Generate sales message error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Improve a sales message
app.post('/api/prospects/:id/improve-message', async (req, res) => {
  try {
    const prospect = db.getProspect(parseInt(req.params.id));
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const { currentMessage, feedback, product_id } = req.body;
    const productId = product_id || prospect.product_id;

    const result = await improveSalesMessage(currentMessage, feedback, prospect, productId);
    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a prospect
app.get('/api/prospects/:id/messages', (req, res) => {
  try {
    const messages = db.getProspectMessages(parseInt(req.params.id));
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark prospect message as sent
app.patch('/api/prospect-messages/:id/sent', (req, res) => {
  try {
    const message = db.markProspectMessageSent(parseInt(req.params.id));
    res.json({ success: true, message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AGENTS
// ============================================

app.post('/api/agents/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const result = await orchestrate(message);
    res.json({
      result: result.result,
      actions: result.actionsLog || [],
      agent: result.agent || 'unknown',
      iterations: result.iterations || 0
    });
  } catch (error) {
    console.error('[Agents] Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents/pipeline', async (req, res) => {
  try {
    const { sources, topN, generateMessages } = req.body;
    const result = await runPipeline({
      sources: sources || ['hn', 'reddit', 'remoteok'],
      topN: topN || 5,
      generateMessages: generateMessages !== false
    });
    res.json({
      result: result.result,
      actions: result.actionsLog || [],
      data: result.data || {}
    });
  } catch (error) {
    console.error('[Agents] Pipeline error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/status', async (req, res) => {
  try {
    const ollamaRunning = await isOllamaRunning();
    const config = loadConfig();
    let availableModels = [];

    if (ollamaRunning) {
      try {
        const axios = (await import('axios')).default;
        const resp = await axios.get(`${config.ollama.url}/api/tags`, { timeout: 3000 });
        availableModels = (resp.data.models || []).map(m => m.name);
      } catch { /* ignore */ }
    }

    res.json({
      ollamaRunning,
      model: 'qwen2.5:7b',
      availableModels,
      agents: ['scout', 'analyst', 'writer']
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});