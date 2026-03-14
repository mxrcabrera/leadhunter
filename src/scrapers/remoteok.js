import { insertLead } from '../db/database.js';
import { classifyLead } from '../rag/classifier.js';
import { fetchWithRetry } from './utils.js';

const REMOTEOK_API = 'https://remoteok.com/api';

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrapeRemoteOK() {
  console.log('========================================');
  console.log('REMOTEOK - Remote Jobs');
  console.log('========================================');

  try {
    const response = await fetchWithRetry(REMOTEOK_API);

    const jobs = response.data.slice(1); // First element is metadata
    console.log(`Encontrados ${jobs.length} jobs`);

    let added = 0;
    let discarded = 0;
    let existing = 0;

    for (const job of jobs) {
      const description = cleanHtml(job.description);

      const classification = classifyLead({
        title: job.position,
        company: job.company,
        description
      });

      if (classification.category === 'discarded') {
        discarded++;
        continue;
      }

      // RemoteOK is mostly agencies/job boards, mark as such
      if (classification.category === 'uncategorized' || classification.category === 'fulltime_backup') {
        classification.category = 'agency';
        classification.detected_type = 'job_board';
      }

      const wasAdded = insertLead({
        source: 'remoteok',
        source_id: job.id ? String(job.id) : job.slug,
        title: job.position || 'No title',
        company: job.company || null,
        description,
        url: job.url || `https://remoteok.com/remote-jobs/${job.slug}`,
        contact_email: null,
        ...classification
      });

      if (wasAdded) {
        added++;
      } else {
        existing++;
      }
    }

    console.log(`RemoteOK: ${added} nuevos, ${existing} ya existentes, ${discarded} descartados`);
    return { added, existing, discarded, processed: jobs.length };
  } catch (error) {
    console.log(`RemoteOK: Error - ${error.message}`);
    return { added: 0, existing: 0, discarded: 0, processed: 0, error: error.message };
  }
}

if (process.argv[1].includes('remoteok.js')) {
  scrapeRemoteOK().catch(console.error);
}
