import { scrapeHackerNews } from '../../scrapers/hackernews.js';
import { scrapeReddit } from '../../scrapers/reddit.js';
import { scrapeRemoteOK } from '../../scrapers/remoteok.js';

const SCRAPERS = {
  hn: { fn: scrapeHackerNews, label: 'HackerNews' },
  reddit: { fn: scrapeReddit, label: 'Reddit' },
  remoteok: { fn: scrapeRemoteOK, label: 'RemoteOK' }
};

export const scrapeSource = {
  name: 'scrape_source',
  description: 'Run a specific scraper to find new leads. Source can be: hn (HackerNews), reddit, or remoteok.',
  parameters: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Which source to scrape',
        enum: ['hn', 'reddit', 'remoteok']
      }
    },
    required: ['source']
  },
  execute: async (args) => {
    const scraper = SCRAPERS[args.source];
    if (!scraper) {
      return { error: `Unknown source: ${args.source}. Use: hn, reddit, remoteok` };
    }
    try {
      console.log(`[Scraper] Running ${scraper.label}...`);
      const result = await scraper.fn();
      return {
        source: scraper.label,
        added: result.added || 0,
        existing: result.existing || 0,
        discarded: result.discarded || 0
      };
    } catch (error) {
      return { error: `Scraper ${scraper.label} failed: ${error.message}` };
    }
  }
};

export const scrapeAll = {
  name: 'scrape_all',
  description: 'Run all scrapers (HackerNews, Reddit, RemoteOK) to find new leads.',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    const results = {};
    let totalAdded = 0;
    let totalExisting = 0;
    let totalDiscarded = 0;

    for (const [key, scraper] of Object.entries(SCRAPERS)) {
      try {
        console.log(`[Scraper] Running ${scraper.label}...`);
        const r = await scraper.fn();
        results[key] = { added: r.added || 0, existing: r.existing || 0, discarded: r.discarded || 0 };
        totalAdded += r.added || 0;
        totalExisting += r.existing || 0;
        totalDiscarded += r.discarded || 0;
      } catch (error) {
        results[key] = { error: error.message };
      }
    }

    return {
      totalAdded,
      totalExisting,
      totalDiscarded,
      bySource: results
    };
  }
};
