import { insertLead } from '../db/database.js';
import { classifyLead } from '../rag/classifier.js';
import { fetchWithRetry, delay } from './utils.js';

const SUBREDDITS = [
  'forhire',
  'remotejs',
  'dotnet',
  'reactjs',
  'freelance',
  'webdev'
];

function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

async function scrapeSubreddit(subreddit) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=50`;
    const response = await fetchWithRetry(url, { timeout: 10000 });
    
    const posts = response.data.data.children || [];
    const hiringPosts = [];
    
    for (const post of posts) {
      const data = post.data;
      const title = (data.title || '').toLowerCase();
      const flair = (data.link_flair_text || '').toLowerCase();
      
      const isHiring = 
        flair.includes('hiring') ||
        title.includes('[hiring]') ||
        title.includes('(hiring)') ||
        (title.includes('hiring') && !title.includes('for hire'));
      
      const isForHire = 
        flair.includes('for hire') ||
        title.includes('[for hire]') ||
        title.includes('(for hire)');
      
      if (isHiring && !isForHire) {
        hiringPosts.push({
          id: data.id,
          title: data.title,
          selftext: data.selftext,
          url: `https://reddit.com${data.permalink}`,
          author: data.author
        });
      }
    }
    
    return hiringPosts;
  } catch (error) {
    console.log(`   Error en r/${subreddit}: ${error.message}`);
    return [];
  }
}

export async function scrapeReddit() {
  console.log('========================================');
  console.log('REDDIT - Hiring Posts');
  console.log('========================================');

  let totalAdded = 0;
  let totalDiscarded = 0;
  let totalExisting = 0;
  let totalProcessed = 0;

  for (const subreddit of SUBREDDITS) {
    console.log(`Buscando en r/${subreddit}...`);

    const posts = await scrapeSubreddit(subreddit);
    console.log(`   ${posts.length} posts de hiring`);

    for (const post of posts) {
      totalProcessed++;
      const email = extractEmail(post.selftext || '');

      const classification = classifyLead({
        title: post.title,
        company: null,
        description: post.selftext
      });

      if (classification.category === 'discarded') {
        totalDiscarded++;
        continue;
      }

      const wasAdded = insertLead({
        source: 'reddit',
        source_id: post.id,
        title: post.title.substring(0, 200),
        company: null,
        description: (post.selftext || '').substring(0, 5000),
        url: post.url,
        contact_email: email,
        contact_name: post.author,
        ...classification
      });

      if (wasAdded) {
        totalAdded++;
      } else {
        totalExisting++;
      }
    }

    await delay(1500);
  }

  console.log(`Reddit: ${totalAdded} nuevos, ${totalExisting} ya existentes, ${totalDiscarded} descartados`);
  return { added: totalAdded, existing: totalExisting, discarded: totalDiscarded, processed: totalProcessed };
}

if (process.argv[1].includes('reddit.js')) {
  scrapeReddit().catch(console.error);
}
