import { searchGoogle } from './google-search.js';
import { searchGoogleCustom, isGoogleConfigured, getRemainingQuota } from './google-custom-search.js';
import { extractContacts } from './contact-extractor.js';
import { interpretProspectQuery } from '../rag/query-interpreter.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadProducts() {
  try {
    const productsPath = path.join(__dirname, '../../data/products.json');
    return JSON.parse(readFileSync(productsPath, 'utf-8'));
  } catch {
    return { products: [] };
  }
}

export function matchProductToQuery(query) {
  const { products } = loadProducts();
  const queryLower = query.toLowerCase();
  let bestMatch = null, bestScore = 0;

  for (const product of products) {
    let score = 0;
    for (const keyword of product.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) score += keyword.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = product; }
  }
  return bestMatch;
}

export function getProducts() { return loadProducts().products; }
export function getProduct(productId) { return loadProducts().products.find(p => p.id === productId); }

// Deduplicate results by URL
function deduplicateResults(results) {
  const seen = new Set();
  return results.filter(r => {
    const normalizedUrl = r.url.toLowerCase().replace(/\/$/, '');
    if (seen.has(normalizedUrl)) return false;
    seen.add(normalizedUrl);
    return true;
  });
}

// Combined search: Google Custom Search API (if configured) + DuckDuckGo + Bing
async function combinedSearch(query, location, limit) {
  let allResults = [];
  const sources = [];

  // 1. Try Google Custom Search API first (best quality)
  if (isGoogleConfigured() && getRemainingQuota() > 0) {
    const googleResult = await searchGoogleCustom(query, location, Math.min(limit, 10));
    if (googleResult.results.length > 0) {
      allResults = [...googleResult.results];
      sources.push('google_api');
      console.log(`[ProspectSearch] Google API returned ${googleResult.results.length} results`);
    }
  }

  // 2. Complement with DuckDuckGo + Bing (scraping fallback)
  const needMore = allResults.length < limit;
  if (needMore || allResults.length === 0) {
    const scrapedResults = await searchGoogle(query, location, limit);
    if (scrapedResults.length > 0) {
      allResults = [...allResults, ...scrapedResults];
      sources.push('duckduckgo', 'bing');
      console.log(`[ProspectSearch] DDG+Bing returned ${scrapedResults.length} results`);
    }
  }

  // 3. Deduplicate and limit
  allResults = deduplicateResults(allResults).slice(0, limit);

  return { results: allResults, sources };
}

// Search with parallel email extraction (1.5s timeout per URL)
export async function searchProspects(query, location = '') {
  // Use AI to interpret the query and get optimal search terms
  console.log(`[ProspectSearch] Interpreting query: "${query}"`);
  const interpretation = await interpretProspectQuery(query, location);

  const searchQuery = interpretation.searchQuery;
  const matchedProduct = interpretation.productId
    ? getProduct(interpretation.productId)
    : matchProductToQuery(query);

  console.log(`[ProspectSearch] AI interpreted: "${searchQuery}" (product: ${interpretation.productId || 'none'})`);

  // Use combined search (Google API + DDG + Bing)
  const { results: searchResults, sources } = await combinedSearch(searchQuery, location, 15);

  console.log(`[ProspectSearch] Found ${searchResults.length} results from: ${sources.join(', ')}`);
  console.log('[ProspectSearch] Extracting emails...');

  // Extract all emails in PARALLEL - max 1.5s per URL
  const results = await Promise.all(searchResults.map(async r => {
    const contacts = await extractContacts(r.url);
    return {
      name: r.name,
      url: r.url,
      description: r.description,
      location: location || null,
      contact_email: contacts.primaryEmail,
      contact_phone: contacts.primaryPhone,
      product_id: matchedProduct?.id || null
    };
  }));

  const withEmail = results.filter(r => r.contact_email).length;
  const withPhone = results.filter(r => r.contact_phone).length;
  console.log(`[ProspectSearch] Done: ${withEmail}/${results.length} with email`);

  return {
    query, location, matchedProduct, results, sources,
    stats: { total: results.length, withEmail, withPhone }
  };
}

export default { searchProspects, matchProductToQuery, getProducts, getProduct };
