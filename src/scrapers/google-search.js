import * as cheerio from 'cheerio';

// Sites to skip (social media, platforms, known directories)
const SKIP_DOMAINS = [
  // Social & big platforms
  'wikipedia.org', 'facebook.com', 'twitter.com', 'instagram.com',
  'linkedin.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
  'reddit.com', 'quora.com', 'amazon.com', 'mercadolibre.',
  'google.com', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  '.gov', '.edu', 'wix.com', 'squarespace.com', 'wordpress.com',
  'linktr.ee', 'linktree.com',
  // Argentine directories
  'paginasamarillas.com', 'cylex.com.ar', 'firmania.com', 'argentino.com.ar',
  'redargentina.com', 'infonegocios.com', 'guiadelocales.com', 'tuugo.com.ar',
  'infobel.com', 'hotfrog.com.ar', 'locanto.com.ar', 'vivastreet.com',
  'infoveterinaria.com.ar', 'veterinarias.com.ar', 'clinicaveterinaria24.help',
  'miguiaargentina.com', 'guialocal.com', 'dondeir.com.ar', 'sectormix.com.ar',
  'todosnegocios.com', 'yelp.com', 'tripadvisor.com', 'foursquare.com',
  'pilatesya.com.ar', 'esencialpilates.com', 'metodo-pilates.com.ar',
  'dateas.com', 'compuempresa.com', 'dnb.com', '.gob.ar', '.gob.',
  'pilates-sanfernando.es', 'cybo.com', 'kompass.com', 'emis.com',
  'empresite.com', 'einforma.com', 'opencorporates.com', 'yably.com',
  'guiaurbana.com', 'lawzana.com', 'abogadosespecialistas.com', 'zonadental.es'
];

function shouldSkipUrl(url) {
  const urlLower = url.toLowerCase();
  return SKIP_DOMAINS.some(domain => urlLower.includes(domain));
}

// Quick filter by title (obvious directories)
function shouldSkipByTitle(title) {
  const t = title.toLowerCase();
  return t.includes('directorio') || t.includes('listado de') || t.includes('los mejores') ||
         t.includes('top 10') || t.includes('ranking') || t.includes('guía de');
}

// Use Ollama to filter: is this a real business or a directory/aggregator?
async function isRealBusiness(title, description, url) {
  try {
    const prompt = `Responde SOLO "SI" o "NO".

¿Este resultado parece ser el sitio web de UN negocio/empresa específica?

Responde "NO" si claramente es:
- Un directorio de negocios (páginas amarillas, cylex, yelp, infonegocios, guiadelocales)
- Una lista de "los mejores X" o "top 10"
- Un artículo de blog o revista
- Un catálogo que lista múltiples negocios

Responde "SI" si parece ser el sitio propio de un negocio (aunque no estés 100% seguro).

Título: ${title}
URL: ${url}

Respuesta:`;

    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.1:8b', prompt, stream: false })
    });

    if (!res.ok) return true; // Si falla Ollama, dejamos pasar
    const data = await res.json();
    const answer = (data.response || '').trim().toUpperCase();
    return answer.startsWith('SI') || answer.startsWith('SÍ');
  } catch {
    return true; // Si falla, dejamos pasar
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Use DuckDuckGo HTML version (no JS required, no CAPTCHA)
async function searchDuckDuckGo(query, limit = 30) {
  const results = [];

  // Search for real businesses, not web design agencies
  const businessQuery = `${query} telefono direccion`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(businessQuery)}`;

  console.log(`[GoogleSearch] Using DuckDuckGo HTML: "${businessQuery}"`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      console.error(`[GoogleSearch] DuckDuckGo returned ${response.status}`);
      return results;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // DuckDuckGo HTML results
    $('.result').each((i, el) => {
      if (results.length >= limit) return false;

      const $el = $(el);
      const $link = $el.find('.result__a');
      const $snippet = $el.find('.result__snippet');

      let href = $link.attr('href') || '';
      const title = $link.text().trim();
      const description = $snippet.text().trim();

      // DuckDuckGo wraps URLs - extract the actual URL
      if (href.includes('uddg=')) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
          href = decodeURIComponent(match[1]);
        }
      }

      // Skip ads, tracking URLs, and non-business sites
      if (!href ||
          href.includes('duckduckgo.com') ||
          href.includes('/y.js') ||
          !href.startsWith('http') ||
          shouldSkipUrl(href)) {
        return;
      }

      // Skip if no useful content
      if (!title || title.length < 3) return;

      // Skip web design agencies by title
      if (shouldSkipByTitle(title)) return;

      results.push({
        name: title,
        url: href,
        description: description || ''
      });
    });

    console.log(`[GoogleSearch] DuckDuckGo found ${results.length} results`);

  } catch (error) {
    console.error(`[GoogleSearch] DuckDuckGo error: ${error.message}`);
  }

  return results;
}

// Use Bing as backup
async function searchBing(query, limit = 30) {
  const results = [];

  const businessQuery = `${query} telefono direccion`;
  const url = `https://www.bing.com/search?q=${encodeURIComponent(businessQuery)}&count=50`;

  console.log(`[GoogleSearch] Using Bing: "${businessQuery}"`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      console.error(`[GoogleSearch] Bing returned ${response.status}`);
      return results;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Bing organic results
    $('li.b_algo').each((i, el) => {
      if (results.length >= limit) return false;

      const $el = $(el);
      const $link = $el.find('h2 a');
      const $snippet = $el.find('.b_caption p');

      const href = $link.attr('href') || '';
      const title = $link.text().trim();
      const description = $snippet.text().trim();

      if (!href || !href.startsWith('http') || shouldSkipUrl(href)) {
        return;
      }

      if (!title || title.length < 3) return;

      // Skip web design agencies by title
      if (shouldSkipByTitle(title)) return;

      // Skip duplicates
      if (results.some(r => r.url === href || r.name === title)) return;

      results.push({
        name: title,
        url: href,
        description: description || ''
      });
    });

    console.log(`[GoogleSearch] Bing found ${results.length} results`);

  } catch (error) {
    console.error(`[GoogleSearch] Bing error: ${error.message}`);
  }

  return results;
}

// Main search function - combines results from multiple sources
export async function searchGoogle(query, location = '', limit = 30) {
  const searchQuery = location ? `${query} ${location}` : query;

  console.log(`[GoogleSearch] Searching: "${searchQuery}"`);

  // Try DuckDuckGo first
  let results = await searchDuckDuckGo(searchQuery, limit * 2); // Get more, we'll filter

  // If not enough results, try Bing
  if (results.length < limit) {
    await delay(500);
    const bingResults = await searchBing(searchQuery, limit * 2);

    // Merge results, avoiding duplicates
    for (const result of bingResults) {
      if (!results.some(r => r.url === result.url || r.name === result.name)) {
        results.push(result);
      }
    }
  }

  // Filter with AI in parallel (fast!)
  console.log(`[GoogleSearch] Filtering ${results.length} results with AI...`);
  const filterResults = await Promise.all(
    results.map(async r => ({
      ...r,
      isReal: await isRealBusiness(r.name, r.description, r.url)
    }))
  );

  // Keep only real businesses
  results = filterResults.filter(r => r.isReal).map(({ isReal, ...r }) => r);
  console.log(`[GoogleSearch] AI filtered: ${results.length} real businesses`);

  // Limit final results
  results = results.slice(0, limit);

  console.log(`[GoogleSearch] Done. ${results.length} total results`);
  return results;
}

export default { searchGoogle };
