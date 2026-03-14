import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

let profile = null;

function loadProfile() {
  if (profile) return profile;
  const profilePath = path.join(DATA_DIR, 'profile.json');
  profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
  return profile;
}

// Tech synonyms - maps canonical name to all variations
const TECH_SYNONYMS = {
  'c#': ['c#', 'csharp', 'c-sharp'],
  '.net': ['.net', 'dotnet', 'dot net', '.net core', 'dotnet core', 'asp.net', 'aspnet'],
  'javascript': ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2020', 'es2021', 'es2022'],
  'typescript': ['typescript', 'ts'],
  'react': ['react', 'reactjs', 'react.js', 'react js'],
  'node': ['node', 'nodejs', 'node.js', 'node js'],
  'next.js': ['next.js', 'nextjs', 'next js', 'next'],
  'angular': ['angular', 'angularjs', 'angular.js', 'angular js'],
  'vue': ['vue', 'vuejs', 'vue.js', 'vue js'],
  'postgresql': ['postgresql', 'postgres', 'psql', 'pg'],
  'mysql': ['mysql', 'mariadb'],
  'mongodb': ['mongodb', 'mongo'],
  'redis': ['redis'],
  'docker': ['docker', 'containerization', 'containers'],
  'kubernetes': ['kubernetes', 'k8s', 'kube'],
  'azure': ['azure', 'microsoft azure', 'ms azure'],
  'aws': ['aws', 'amazon web services', 'amazon aws'],
  'gcp': ['gcp', 'google cloud', 'google cloud platform'],
  'rest api': ['rest api', 'restful', 'rest apis', 'restful api'],
  'graphql': ['graphql', 'graph ql'],
  'microservices': ['microservices', 'micro services', 'micro-services'],
  'blazor': ['blazor', 'blazor server', 'blazor wasm', 'blazor webassembly'],
  'tailwind': ['tailwind', 'tailwindcss', 'tailwind css'],
  'firebase': ['firebase'],
  'rabbitmq': ['rabbitmq', 'rabbit mq', 'rabbit'],
  'python': ['python', 'py'],
  'java': ['java', 'jvm'],
  'go': ['golang', 'go lang'],
  'rust': ['rust', 'rustlang'],
};

// Known agencies/platforms - with regex patterns for flexible matching
const AGENCY_PATTERNS = [
  /lemon\.?io/i, /turing\.?(com|ai)?/i, /toptal\.?(com|io)?/i, /gun\.?io/i,
  /x-?team/i, /andela/i, /crossover/i, /arc\.?dev/i, /remoteok/i,
  /weworkremotely/i, /angel\.?co/i, /hired\.?(com)?/i, /vettery/i,
  /triplebyte/i, /interviewing\.?io/i, /clouddevs/i, /lathire/i,
  /hirelatam/i, /torre\.?(co)?/i, /latamcent/i, /revelo/i,
  /bairesdev/i, /globant/i, /nearsure/i, /unosquare/i
];

const AGENCIES = [
  'lemon.io', 'turing', 'toptal', 'gun.io', 'x-team', 'andela',
  'crossover', 'arc.dev', 'remoteok', 'weworkremotely', 'angel.co',
  'hired.com', 'vettery', 'triplebyte', 'interviewing.io',
  'clouddevs', 'lathire', 'hirelatam', 'torre', 'latamcent',
  'revelo', 'bairesdev', 'globant'
];

// Words that indicate freelance/contract (STRONG indicators = definitely want contractors)
const FREELANCE_INDICATORS = [
  'freelance', 'freelancer', 'contractor', 'contract', 'contracting',
  'consultant', 'consulting', 'part-time', 'part time', 'hourly',
  'project-based', 'project based', 'short-term', 'short term',
  'gig', 'per project', 'retainer',
  // Additional strong indicators
  'short term contractor', 'short-term contractor', 'contract role',
  'contract position', 'contract work', 'freelance position',
  'independent contractor', '1099', 'c2c', 'corp to corp',
  'contract-to-hire', 'contract to hire'
];

// STRONG contract indicators - these override fulltime detection
const STRONG_CONTRACT_INDICATORS = [
  /short(er)?[\s-]?term\s+contractors?/i,       // "short term contractor" or "shorter term contractors"
  /looking\s+(for|to\s+hire)\s+(a\s+)?contractors?/i,
  /hiring\s+contractors?/i,
  /hire\s+(some\s+)?contractors?/i,             // "hire some contractors"
  /contract\s+(role|position|opportunity)/i,
  /freelance\s+(developer|engineer|position)/i,
  /\bcontractors?\s+wanted\b/i,
  /\bcontract\s*->\s*/i,                        // "Contract ->" like in Pareto
];

// Words that indicate full-time
const FULLTIME_INDICATORS = [
  'full-time', 'full time', 'fulltime', 'permanent', 'employee',
  'salary', 'benefits', 'equity', 'stock options', 'pto', 'paid time off',
  '401k', 'health insurance', 'dental', 'vision'
];

// Location restrictions that disqualify
const LOCATION_BLOCKERS = [
  'us only', 'usa only', 'us-only', 'usa-only',
  'us based', 'us-based', 'usa based', 'usa-based',
  'united states only', 'must be in us', 'must be in usa',
  'u.s. only', 'u.s. based', 'u.s.-based',
  'onsite only', 'on-site only', 'in-office only', 'office only',
  'no remote', 'not remote', 'hybrid only',
  'must relocate', 'relocation required', 'willing to relocate',
  'security clearance', 'clearance required', 'us citizen',
  'work authorization', 'visa sponsorship', 'h1b',
  // Patterns that look remote but are US-only
  'remote (us)', 'remote(us)', 'remote / us', 'remote /us', 'remote/ us',
  'remote - us', 'remote -us', 'remote- us',
  'remote us only', 'remote usa only',
  'remote (usa)', 'remote(usa)', 'remote / usa',
  '[us]', '[ us ]', '[usa]', '| us |', '|us|',
  'remote, us', 'remote,us', 'us remote', 'usa remote'
];

// Regex patterns for US-only detection (improved to avoid false positives)
const LOCATION_BLOCKER_PATTERNS = [
  /remote\s*[\(\[\|\/\-]\s*us[a]?\s*[\)\]\|]/i,  // remote (us), remote [usa], remote | us |
  /\[\s*us[a]?\s*\].*remote/i,  // [US] ... remote
  /\bus[a]?\s+(only|based|citizens?)\b/i,  // "us only", "usa based", "us citizens"
  /\b(only|based)\s+in\s+(the\s+)?us[a]?\b/i,  // "only in us", "based in usa"
  /\bunited\s+states\s+(only|based|citizens?)\b/i,  // "united states only"
  // Onsite in specific countries (not remote-friendly for LATAM)
  /\b(hyderabad|bangalore|mumbai|delhi|chennai|pune|india)\b.*\b(full-?time|onsite|on-?site)\b/i,
  /\b(full-?time|onsite|on-?site)\b.*\b(hyderabad|bangalore|mumbai|delhi|chennai|pune|india)\b/i,
  /\blocation:\s*(hyderabad|bangalore|mumbai|delhi|india|singapore|berlin|london)\b/i,
];

// Role types to discard (leadership/management roles)
const ROLE_BLOCKERS = [
  /\btech lead\b/i,
  /\btechnical lead\b/i,
  /\bteam lead\b/i,
  /\beng(ineering)? lead\b/i,
  /\blead engineer\b/i,
  /\bprincipal engineer\b/i,
  /\bstaff engineer\b/i,
  /\barchitect\b/i,
  /\bhead of engineering\b/i,
  /\bhead of development\b/i,
  /\bdirector of engineering\b/i,
  /\bvp of engineering\b/i,
  /\bcto\b/i,
  /\bmanager\b/i,
  /\bengineering manager\b/i,
];

// Good location indicators
const LOCATION_GOOD = [
  'remote', 'fully remote', '100% remote', 'anywhere', 'worldwide',
  'global', 'international', 'latam', 'latin america', 'south america',
  'argentina', 'americas', 'emea', 'apac',
  'async', 'asynchronous', 'timezone flexible', 'flexible timezone',
  'distributed', 'remote-first', 'remote first'
];

// Location OVERRIDE patterns - if these are present, IGNORE US blockers
// These indicate the job is actually open to international applicants
const LOCATION_OVERRIDE_PATTERNS = [
  /intl?\s*remote/i,                              // "INTL REMOTE" or "INT REMOTE"
  /international\s*remote/i,                       // "international remote"
  /fully\s+distributed/i,                          // "fully distributed"
  /remote[\s-]?first/i,                            // "remote-first" or "remote first"
  /no\s+restriction\s+on\s+(where|location)/i,     // "no restriction on where you're located"
  /anywhere\s+(in\s+the\s+)?world/i,               // "anywhere in the world"
  /worldwide/i,                                    // "worldwide"
  /global\s+remote/i,                              // "global remote"
  /work\s+from\s+anywhere/i,                       // "work from anywhere"
  /location[\s-]?agnostic/i,                       // "location agnostic"
  /timezone[\s-]?flexible/i,                       // "timezone flexible"
  /any\s+timezone/i,                               // "any timezone"
  /\blatam\b/i,                                    // "LATAM" - specifically includes Latin America
  /latin\s*america/i,                              // "Latin America"
  /south\s*america/i,                              // "South America"
  /\bargentina\b/i,                                // "Argentina" - we're from there!
];

// Helper function to match tech with synonyms
function techMatchesWithSynonyms(tech, text) {
  const techLower = tech.toLowerCase();

  // Check if we have synonyms for this tech
  const synonyms = TECH_SYNONYMS[techLower];

  if (synonyms) {
    // Check all synonyms
    for (const syn of synonyms) {
      const regex = syn.length <= 3
        ? new RegExp(`\\b${syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        : new RegExp(`\\b${syn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (regex.test(text)) return true;
    }
  } else {
    // No synonyms, do direct match
    const regex = techLower.length <= 3
      ? new RegExp(`\\b${techLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      : new RegExp(`\\b${techLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    if (regex.test(text)) return true;
  }

  return false;
}

// Helper function to detect agencies with flexible patterns
function isAgencyMatch(text) {
  // Check regex patterns first (more flexible)
  for (const pattern of AGENCY_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  // Fallback to exact string match
  return AGENCIES.some(a => text.includes(a));
}

export function classifyLead(lead) {
  const p = loadProfile();
  const text = `${lead.title || ''} ${lead.company || ''} ${lead.description || ''}`.toLowerCase();

  const result = {
    category: 'uncategorized',
    tech_score: 0,
    location_score: 0,
    type_score: 0,
    domain_score: 0,
    total_score: 0,
    detected_tech: [],
    detected_location: null,
    detected_type: null,
    rejection_reason: null
  };

  // === 1. CHECK LOCATION (with smart override logic) ===

  // FIRST: Check if there are OVERRIDE patterns that indicate international acceptance
  // If present, we should NOT discard even if US is mentioned
  let hasLocationOverride = false;
  for (const pattern of LOCATION_OVERRIDE_PATTERNS) {
    if (pattern.test(text)) {
      hasLocationOverride = true;
      result.detected_location = 'international';
      result.location_score = 20;
      break;
    }
  }

  // Only check blockers if NO override pattern was found
  if (!hasLocationOverride) {
    // Check string patterns
    for (const blocker of LOCATION_BLOCKERS) {
      if (text.includes(blocker)) {
        result.category = 'discarded';
        result.rejection_reason = `Location restriction: "${blocker}"`;
        result.detected_location = 'us-only';
        result.location_score = -100;
        result.total_score = 0;
        result.detected_tech = JSON.stringify(result.detected_tech);
        return result;
      }
    }

    // Check regex patterns
    for (const pattern of LOCATION_BLOCKER_PATTERNS) {
      if (pattern.test(text)) {
        result.category = 'discarded';
        result.rejection_reason = `Location restriction: US-only pattern detected`;
        result.detected_location = 'us-only';
        result.location_score = -100;
        result.total_score = 0;
        result.detected_tech = JSON.stringify(result.detected_tech);
        return result;
      }
    }
  }
  
  // === 1.5 CHECK ROLE TYPE (discard leadership roles) ===
  const titleText = (lead.title || '').toLowerCase();
  for (const pattern of ROLE_BLOCKERS) {
    if (pattern.test(lead.title || '')) {
      result.category = 'discarded';
      result.rejection_reason = `Role type: Leadership/management position`;
      result.detected_location = 'n/a';
      result.location_score = 0;
      result.total_score = 0;
      result.detected_tech = JSON.stringify(result.detected_tech);
      return result;
    }
  }
  
  // Check for good location
  for (const good of LOCATION_GOOD) {
    if (text.includes(good)) {
      result.location_score = 20;
      result.detected_location = good;
      break;
    }
  }
  
  // If no location mentioned, assume neutral
  if (!result.detected_location) {
    result.location_score = 5;
    result.detected_location = 'not specified';
  }
  
  // === 2. CHECK TECH STACK (with synonyms) ===
  const foundCoreTech = [];
  for (const tech of p.core_tech) {
    if (techMatchesWithSynonyms(tech, text)) {
      foundCoreTech.push(tech);
    }
  }

  const foundSecondaryTech = [];
  for (const tech of p.secondary_tech) {
    if (techMatchesWithSynonyms(tech, text)) {
      foundSecondaryTech.push(tech);
    }
  }

  result.detected_tech = [...new Set([...foundCoreTech, ...foundSecondaryTech])];
  
  // Tech scoring: core tech is worth more
  result.tech_score = (foundCoreTech.length * 15) + (foundSecondaryTech.length * 5);
  result.tech_score = Math.min(result.tech_score, 50); // Cap at 50
  
  // If NO relevant tech found, major penalty
  if (foundCoreTech.length === 0 && foundSecondaryTech.length === 0) {
    result.tech_score = -20;
  }
  
  // === 3. CHECK TYPE (freelance vs fulltime vs agency) ===

  // Only check if source is remoteok job board (not just random text mentioning "remoteok")
  const isFromRemoteOKBoard = lead.source === 'remoteok';
  const isAgency = isAgencyMatch(text) || isFromRemoteOKBoard;

  const hasFreelanceIndicator = FREELANCE_INDICATORS.some(f => text.includes(f));
  const hasFulltimeIndicator = FULLTIME_INDICATORS.some(f => text.includes(f));

  // Check for STRONG contract indicators (these override agency AND fulltime detection)
  const hasStrongContractIndicator = STRONG_CONTRACT_INDICATORS.some(p => p.test(text));

  if (hasStrongContractIndicator) {
    // Strong contract indicator found - this is definitely freelance/contract work
    // This takes priority over agency detection (company hiring contractors directly)
    result.detected_type = 'contract';
    result.type_score = 25;
    result.category = 'freelance_direct';
  } else if (isAgency && !hasFreelanceIndicator) {
    // Only classify as agency if it's a job board AND doesn't have freelance indicators
    result.detected_type = 'agency';
    result.type_score = 10;
    result.category = 'agency';
  } else if (hasFreelanceIndicator && !hasFulltimeIndicator) {
    result.detected_type = 'freelance';
    result.type_score = 25;
    result.category = 'freelance_direct';
  } else if (hasFulltimeIndicator && !hasFreelanceIndicator) {
    result.detected_type = 'fulltime';
    result.type_score = 5;
    result.category = 'fulltime_backup';
  } else if (hasFreelanceIndicator && hasFulltimeIndicator) {
    // Mentions both - if there's contract language, prioritize freelance
    result.detected_type = 'mixed';
    result.type_score = 15;
    result.category = 'freelance_direct';
  } else {
    // No clear indicator - assume fulltime (most HN posts are)
    result.detected_type = 'unclear';
    result.type_score = 0;
    result.category = 'fulltime_backup';
  }
  
  // === 4. CHECK DOMAIN MATCH ===
  for (const domain of p.domains) {
    if (text.includes(domain)) {
      result.domain_score += 5;
    }
  }
  result.domain_score = Math.min(result.domain_score, 15);
  
  // === 5. CALCULATE TOTAL SCORE ===
  result.total_score = result.tech_score + result.location_score + result.type_score + result.domain_score;
  result.total_score = Math.max(0, Math.min(100, result.total_score));
  
  // === 6. FINAL CATEGORY ADJUSTMENTS ===
  
  // If tech score is negative (no relevant tech), mark as low priority
  if (result.tech_score < 0 && result.category !== 'discarded') {
    result.category = 'fulltime_backup';
    result.rejection_reason = 'No matching tech stack';
  }
  
  // If score is very high and freelance, definitely category A
  if (result.total_score >= 60 && result.detected_type === 'freelance') {
    result.category = 'freelance_direct';
  }
  
  // Stringify detected_tech for storage
  result.detected_tech = JSON.stringify(result.detected_tech);

  return result;
}