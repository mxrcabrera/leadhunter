import { getGoogleCredentials } from '../config.js';

const GOOGLE_API_URL = 'https://www.googleapis.com/customsearch/v1';

let dailyUsage = 0;
let lastUsageDate = new Date().toDateString();
const DAILY_LIMIT = 100;
const WARNING_THRESHOLD = 20;

function checkAndResetUsage() {
  const today = new Date().toDateString();
  if (today !== lastUsageDate) {
    dailyUsage = 0;
    lastUsageDate = today;
  }
}

export function isGoogleConfigured() {
  return getGoogleCredentials() !== null;
}

export function getRemainingQuota() {
  checkAndResetUsage();
  return DAILY_LIMIT - dailyUsage;
}

export async function searchGoogleCustom(query, location = '', limit = 10) {
  const credentials = getGoogleCredentials();
  if (!credentials) {
    return { results: [], error: 'Google API not configured' };
  }

  checkAndResetUsage();

  if (dailyUsage >= DAILY_LIMIT) {
    console.warn('[GoogleCustomSearch] Daily limit reached (100/day). Using fallback search.');
    return { results: [], error: 'Daily limit reached' };
  }

  const remaining = DAILY_LIMIT - dailyUsage;
  if (remaining <= WARNING_THRESHOLD) {
    console.warn(`[GoogleCustomSearch] Warning: Only ${remaining} searches remaining today`);
  }

  const searchQuery = location ? `${query} ${location}` : query;

  try {
    const params = new URLSearchParams({
      key: credentials.apiKey,
      cx: credentials.cx,
      q: searchQuery,
      num: Math.min(limit, 10).toString(),
      lr: 'lang_es',
      gl: 'ar'
    });

    const url = `${GOOGLE_API_URL}?${params}`;

    console.log(`[GoogleCustomSearch] Searching: "${searchQuery}" (${remaining} searches remaining)`);

    const response = await fetch(url);
    dailyUsage++;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || response.statusText;
      console.error(`[GoogleCustomSearch] API error: ${errorMsg}`);
      return { results: [], error: errorMsg };
    }

    const data = await response.json();
    const items = data.items || [];

    const results = items.map(item => ({
      name: item.title || '',
      url: item.link || '',
      description: item.snippet || ''
    }));

    console.log(`[GoogleCustomSearch] Found ${results.length} results`);

    return {
      results,
      searchInfo: {
        totalResults: data.searchInformation?.totalResults || 0,
        searchTime: data.searchInformation?.searchTime || 0
      }
    };

  } catch (error) {
    console.error(`[GoogleCustomSearch] Error: ${error.message}`);
    return { results: [], error: error.message };
  }
}

export async function testGoogleConnection() {
  const credentials = getGoogleCredentials();
  if (!credentials) {
    return { success: false, error: 'No credentials configured' };
  }

  try {
    const params = new URLSearchParams({
      key: credentials.apiKey,
      cx: credentials.cx,
      q: 'test',
      num: '1'
    });

    const response = await fetch(`${GOOGLE_API_URL}?${params}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error?.message || response.statusText
      };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export default { searchGoogleCustom, isGoogleConfigured, getRemainingQuota, testGoogleConnection };
