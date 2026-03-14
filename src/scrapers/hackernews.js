import { insertLead } from '../db/database.js';
import { classifyLead } from '../rag/classifier.js';
import { fetchWithRetry } from './utils.js';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

async function findHiringThread() {
  const response = await fetchWithRetry(`${HN_API}/user/whoishiring.json`);
  const submitted = response.data.submitted || [];

  for (const id of submitted.slice(0, 10)) {
    const item = await fetchWithRetry(`${HN_API}/item/${id}.json`);
    if (item.data.title && item.data.title.includes('Who is hiring?')) {
      return item.data;
    }
  }
  throw new Error('No hiring thread found');
}

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

function extractCompany(text) {
  const lines = text.split('\n');
  const firstLine = lines[0] || '';
  const parts = firstLine.split('|');
  return parts[0].trim().substring(0, 100) || null;
}

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrapeHackerNews() {
  console.log('========================================');
  console.log('HACKER NEWS - Who is Hiring');
  console.log('========================================');
  
  console.log('Buscando thread "Who is Hiring" mas reciente...');
  const thread = await findHiringThread();
  console.log(`Encontrado: ${thread.title}`);
  
  const kids = thread.kids || [];
  console.log(`Descargando ${kids.length} comentarios...`);
  
  let added = 0;
  let discarded = 0;
  let existing = 0;
  let noTech = 0;
  let processed = 0;

  const batchSize = 20;
  for (let i = 0; i < kids.length; i += batchSize) {
    const batch = kids.slice(i, i + batchSize);

    const items = await Promise.all(
      batch.map(id =>
        fetchWithRetry(`${HN_API}/item/${id}.json`, {}, 2)
          .then(r => r.data)
          .catch(() => null)
      )
    );

    for (const item of items) {
      if (!item || item.deleted || item.dead || !item.text) continue;
      processed++;

      const text = cleanHtml(item.text);
      const company = extractCompany(text);
      const email = extractEmail(text);

      // Classify the lead
      const classification = classifyLead({
        title: text.substring(0, 200),
        company,
        description: text
      });

      if (classification.category === 'discarded') {
        if (classification.rejection_reason?.includes('Location')) {
          discarded++;
        } else if (classification.tech_score < 0) {
          noTech++;
        } else {
          discarded++;
        }
        continue;
      }

      const wasAdded = insertLead({
        source: 'hackernews',
        source_id: String(item.id),
        title: text.substring(0, 200),
        company,
        description: text,
        url: `https://news.ycombinator.com/item?id=${item.id}`,
        contact_email: email,
        ...classification
      });

      if (wasAdded) {
        added++;
      } else {
        existing++;
      }
    }

    process.stdout.write(`\r   Progreso: ${Math.min(i + batchSize, kids.length)}/${kids.length}`);
  }

  console.log(`\nHacker News: ${added} nuevos, ${existing} ya existentes, ${discarded} US-only, ${noTech} sin tech relevante`);
  return { added, existing, discarded, noTech, processed };
}

if (process.argv[1].includes('hackernews.js')) {
  scrapeHackerNews().catch(console.error);
}
