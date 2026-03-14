import * as cheerio from 'cheerio';

const IGNORED_DOMAINS = ['example.com','sentry.io','wixpress.com','wordpress.com','w3.org','schema.org','facebook.com','twitter.com','instagram.com','linkedin.com','google.com','googleapis.com','cloudflare.com'];
const IGNORED_PREFIXES = ['noreply','no-reply','donotreply','mailer-daemon','postmaster','webmaster','hostmaster','abuse'];

function isValidEmail(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (IGNORED_DOMAINS.some(d => e.includes(`@${d}`))) return false;
  if (IGNORED_PREFIXES.some(p => e.startsWith(p))) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

export async function extractContacts(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 1500); // 1.5s timeout

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
      signal: controller.signal
    });
    clearTimeout(tid);

    if (!res.ok) return { primaryEmail: null, primaryPhone: null };

    const html = await res.text();
    const $ = cheerio.load(html);
    $('script,style').remove();

    // Get mailto emails first (best quality)
    const emails = [];
    $('a[href^="mailto:"]').each((_, el) => {
      const email = $(el).attr('href')?.replace('mailto:', '').split('?')[0].trim();
      if (isValidEmail(email)) emails.push(email.toLowerCase());
    });

    // Extract from text
    const text = $('body').text();
    (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
      .filter(isValidEmail)
      .forEach(e => { if (!emails.includes(e.toLowerCase())) emails.push(e.toLowerCase()); });

    // Phones
    const phones = [];
    (text.match(/(?:\+54\s?)?(?:0?11|0?[2-9]\d{2,3})[\s-]?(?:15\s?)?[\d]{4}[\s-]?[\d]{4}/g) || []).forEach(p => phones.push(p));
    (text.match(/\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g) || []).forEach(p => phones.push(p));

    return { primaryEmail: emails[0] || null, primaryPhone: phones[0] || null };
  } catch {
    return { primaryEmail: null, primaryPhone: null };
  }
}

export default { extractContacts };
