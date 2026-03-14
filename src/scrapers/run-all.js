import { scrapeHackerNews } from './hackernews.js';
import { scrapeReddit } from './reddit.js';
import { scrapeRemoteOK } from './remoteok.js';

async function runAll() {
  console.log('========================================');
  console.log('LEADHUNTER - Ejecutando scrapers');
  console.log(`Fecha: ${new Date().toISOString().split('T')[0]}`);
  console.log('========================================\n');

  const results = {
    hackernews: { added: 0, existing: 0, discarded: 0 },
    reddit: { added: 0, existing: 0, discarded: 0 },
    remoteok: { added: 0, existing: 0, discarded: 0 }
  };

  try {
    const hn = await scrapeHackerNews();
    results.hackernews = hn;
  } catch (error) {
    console.log(`Hacker News: Error - ${error.message}`);
  }

  console.log('');

  try {
    const reddit = await scrapeReddit();
    results.reddit = reddit;
  } catch (error) {
    console.log(`Reddit: Error - ${error.message}`);
  }

  console.log('');

  try {
    const rok = await scrapeRemoteOK();
    results.remoteok = rok;
  } catch (error) {
    console.log(`RemoteOK: Error - ${error.message}`);
  }

  // Calculate totals
  const totalAdded = results.hackernews.added + results.reddit.added + results.remoteok.added;
  const totalExisting = results.hackernews.existing + results.reddit.existing + results.remoteok.existing;
  const totalDiscarded = results.hackernews.discarded + results.reddit.discarded + results.remoteok.discarded;

  console.log('\n========================================');
  console.log('RESUMEN:');
  console.log(`  Nuevos agregados: ${totalAdded}`);
  console.log(`  Ya existentes:    ${totalExisting}`);
  console.log(`  Descartados:      ${totalDiscarded}`);
  console.log('========================================');

  // Output JSON for server parsing
  console.log(`\n__SCRAPE_RESULT__:${JSON.stringify({
    added: totalAdded,
    existing: totalExisting,
    discarded: totalDiscarded,
    bySource: {
      hackernews: results.hackernews,
      reddit: results.reddit,
      remoteok: results.remoteok
    }
  })}`);

  console.log('\nAbri http://localhost:3000 para ver los leads');
}

runAll().catch(console.error);
