import axios from 'axios';
import * as cheerio from 'cheerio';

const MAX_BODY_LENGTH = 2000;
const REQUEST_TIMEOUT = 10000;

export const webFetch = {
  name: 'web_fetch',
  description: 'Fetch a URL and return the text content (useful to research companies or job postings). Limited to 2000 chars.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The URL to fetch' }
    },
    required: ['url']
  },
  execute: async (args) => {
    if (!args.url || !args.url.startsWith('http')) {
      return { error: 'Invalid URL. Must start with http:// or https://' };
    }

    try {
      const response = await axios.get(args.url, {
        timeout: REQUEST_TIMEOUT,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadHunter/1.0)'
        },
        maxRedirects: 3
      });

      const html = response.data;
      if (typeof html !== 'string') {
        return { url: args.url, content: JSON.stringify(html).substring(0, MAX_BODY_LENGTH) };
      }

      const $ = cheerio.load(html);

      // Remove scripts and styles
      $('script, style, nav, footer, header').remove();

      const title = $('title').text().trim();
      const text = $('body').text()
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, MAX_BODY_LENGTH);

      return { url: args.url, title, content: text };
    } catch (error) {
      return { error: `Failed to fetch ${args.url}: ${error.message}` };
    }
  }
};
