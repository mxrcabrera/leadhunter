import axios from 'axios';

/**
 * Fetch with exponential backoff retry logic
 * @param {string} url - URL to fetch
 * @param {object} options - Axios options
 * @param {number} retries - Number of retries (default 3)
 * @returns {Promise} - Axios response
 */
export async function fetchWithRetry(url, options = {}, retries = 3) {
  const defaultOptions = {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await axios.get(url, mergedOptions);
      return response;
    } catch (error) {
      const isLastAttempt = attempt === retries - 1;
      const status = error.response?.status;

      // Don't retry on 4xx errors (except 429)
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw error;
      }

      if (isLastAttempt) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`   Retry ${attempt + 1}/${retries} after ${delayMs}ms...`);
      await delay(delayMs);
    }
  }
}

/**
 * Delay helper
 * @param {number} ms - Milliseconds to wait
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
