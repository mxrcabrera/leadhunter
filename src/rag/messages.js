import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOllamaConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

function getOllamaUrl() {
  return getOllamaConfig().url;
}

function getOllamaModel() {
  return getOllamaConfig().model;
}

function loadProfile() {
  const profilePath = path.join(DATA_DIR, 'profile.json');
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
}

export async function isOllamaRunning() {
  try {
    await axios.get(`${getOllamaUrl()}/api/tags`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export async function generateMessage(lead, messageType = 'apply') {
  const profile = loadProfile();
  
  // Find relevant experience based on detected tech AND domain
  let detectedTech = [];
  try {
    detectedTech = JSON.parse(lead.detected_tech || '[]');
  } catch {}
  
  const leadText = `${lead.title || ''} ${lead.company || ''} ${lead.description || ''}`.toLowerCase();
  const titleText = (lead.title || '').toLowerCase();

  // Detect job type: frontend, backend, or fullstack
  // Also detect by tech stack mentioned - if job mentions React/Vue/Angular prominently, it's frontend-leaning
  const frontendKeywords = /\b(frontend|front-end|front end|ui developer|ui engineer|react developer|angular developer|vue developer|frontend engineer)\b/i.test(leadText);
  const hasFrontendStack = /\b(react|vue|angular|next\.?js|typescript.*react|react.*typescript)\b/i.test(leadText);
  const isFrontendJob = frontendKeywords || hasFrontendStack;

  const isBackendJob = /\b(backend|back-end|back end|api developer|server-side|\.net developer|c# developer|python developer|backend engineer)\b/i.test(leadText);

  // Is this an ENGINEERING job? (not training, annotation, etc)
  const isEngineeringJob = /\b(engineer|developer|architect|programmer)\b/i.test(leadText);

  // Frontend tech indicators
  const frontendTech = ['react', 'angular', 'vue', 'next.js', 'nextjs', 'tailwind', 'css', 'html', 'frontend', 'ui'];
  const backendTech = ['.net', 'c#', 'asp.net', 'sql', 'postgresql', 'api', 'microservices', 'backend'];

  // Score each experience by relevance
  const scoredExperiences = profile.experience_summary.map(exp => {
    let score = 0;
    const expTech = exp.tech.map(t => t.toLowerCase());
    const expDomain = (exp.domain || '').toLowerCase();
    const expDesc = (exp.description || '').toLowerCase();
    const expRole = (exp.role || '').toLowerCase();

    // TECH MATCH IS MOST IMPORTANT - check what the job actually requires
    const jobTechKeywords = ['c#', '.net', 'dotnet', 'react', 'node', 'typescript', 'javascript', 'sql', 'postgresql', 'azure', 'python', 'go', 'golang', 'java', 'ruby', 'php', 'next.js', 'nextjs', 'angular', 'vue'];
    for (const tech of jobTechKeywords) {
      if (leadText.includes(tech)) {
        // Job wants this tech - check if experience has it
        if (expTech.some(et => et.toLowerCase().includes(tech))) {
          score += 20; // Strong match for actual tech required
        }
      }
    }

    // Direct tech match from detected tech
    for (const dt of detectedTech) {
      if (expTech.some(et => et.toLowerCase().includes(dt.toLowerCase()) || dt.toLowerCase().includes(et.toLowerCase()))) {
        score += 15;
      }
    }

    // Frontend/Backend role matching - CRITICAL for getting the right experience
    if (isFrontendJob && !isBackendJob) {
      // Modern frontend tech (React, Vue, Angular, Next.js) is MUCH more valuable than legacy (HTML/CSS/jQuery)
      const modernFrontendTech = ['react', 'angular', 'vue', 'next.js', 'nextjs', 'typescript'];
      const hasModernFrontend = expTech.some(t => modernFrontendTech.some(mft => t.includes(mft)));
      const hasLegacyFrontend = expTech.some(t => ['html', 'css', 'javascript', 'jquery', 'vtex'].some(lt => t.includes(lt)));

      // Role detection - include React/Angular/Vue in role as frontend indicator
      const isFrontendRole = expRole.includes('frontend') || expRole.includes('front-end') || expRole.includes('ui') ||
                             expRole.includes('react') || expRole.includes('angular') || expRole.includes('vue');

      if (hasModernFrontend) score += 40; // Strong boost for modern frontend
      else if (hasLegacyFrontend) score += 10; // Small boost for legacy frontend

      if (isFrontendRole) score += 25;

      // Penalize pure backend roles for frontend jobs
      const isPureBackend = (expRole.includes('.net') || expRole.includes('asp.net')) && !hasModernFrontend && !hasLegacyFrontend;
      if (isPureBackend) score -= 20;

      // Penalize old experiences for modern frontend jobs
      if (!exp.period.includes('2020') && !exp.period.includes('2021') && !exp.period.includes('2022') &&
          !exp.period.includes('2023') && !exp.period.includes('2024') && !exp.period.includes('2025')) {
        score -= 15; // Old frontend experience (pre-2020) is less relevant
      }
    } else if (isBackendJob && !isFrontendJob) {
      // Job is specifically backend - boost backend experiences
      const hasBackendTech = expTech.some(t => backendTech.some(bt => t.includes(bt)));
      if (hasBackendTech) score += 25;
    }

    // Domain match
    if (leadText.includes('health') && expDomain.includes('health')) score += 15;
    if (leadText.includes('medical') && expDomain.includes('health')) score += 15;
    if (leadText.includes('logistics') && expDomain.includes('logistics')) score += 20;
    if (leadText.includes('shipping') && expDomain.includes('shipping')) score += 20;
    if (leadText.includes('e-commerce') && expDomain.includes('commerce')) score += 15;
    if (leadText.includes('ecommerce') && expDomain.includes('commerce')) score += 15;
    if (leadText.includes('saas') && expDomain.includes('saas')) score += 10;
    if (leadText.includes('platform') && expDesc.includes('platform')) score += 5;
    if (leadText.includes('fintech') && expDomain.includes('finance')) score += 15;
    if (leadText.includes('political') || leadText.includes('democracy') || leadText.includes('advocacy')) score += 5;

    // AI/ML - CRITICAL: Outlier was AI TRAINING (evaluation/testing), NOT engineering
    // If a job mentions "AI" in company name but wants ENGINEERS, Outlier is NOT relevant
    const wantsAIDev = /\b(ai engineer|ml engineer|machine learning engineer|ai developer)\b/i.test(leadText);
    const isAITrainingRole = expRole.includes('training') || expRole.includes('specialist');

    // If job is for engineers and this is a training/non-engineering role, HEAVILY penalize
    if (isEngineeringJob && isAITrainingRole) {
      score -= 50; // Outlier AI Training is NOT relevant for engineering jobs
    }

    // Only boost AI experience if job explicitly wants AI DEVELOPMENT and you have real AI dev experience
    if (wantsAIDev && !isAITrainingRole && expTech.some(t => t.includes('python'))) {
      score += 10;
    }

    // Prefer recent experience
    if (exp.period.includes('2024') || exp.period.includes('2025')) score += 10;
    if (exp.period.includes('2023')) score += 5;

    // Boost .NET roles only if job isn't specifically frontend
    if (!isFrontendJob) {
      if (expRole.includes('.net') || expRole.includes('asp.net') || expTech.some(t => t.includes('.net') || t.includes('c#'))) {
        score += 10;
      }
    }

    // Penalize non-dev roles
    if (expRole.includes('training') || expRole.includes('analyst') || expRole.includes('intern')) {
      score -= 10;
    }

    return { exp, score };
  });
  
  // Also score personal projects (especially good for frontend/fullstack roles)
  const scoredProjects = (profile.projects || []).map(proj => {
    let score = 0;
    const projTech = proj.tech.map(t => t.toLowerCase());
    const projDesc = (proj.description || '').toLowerCase();

    // Tech match - STRONG boost for exact tech matches
    const techMatchList = ['react', 'typescript', 'next.js', 'nextjs', 'node', 'tailwind', 'express', 'postgresql', 'python'];
    for (const tech of techMatchList) {
      if (leadText.includes(tech) && projTech.some(pt => pt.includes(tech))) {
        score += 25; // Strong match
      }
    }

    // Frontend job boost for frontend projects
    if (isFrontendJob) {
      const hasFrontendTech = projTech.some(t => frontendTech.some(ft => t.includes(ft)));
      if (hasFrontendTech) score += 35;

      // Extra boost for React+TypeScript combo (very in demand)
      const hasReactTS = projTech.some(t => t.includes('react')) && projTech.some(t => t.includes('typescript'));
      if (hasReactTS) score += 20;
    }

    // Backend job boost for backend projects
    if (isBackendJob) {
      const hasBackendTech = projTech.some(t => ['node', 'express', 'postgresql', 'api'].some(bt => t.includes(bt)));
      if (hasBackendTech) score += 30;
    }

    // SDK/API projects are great for engineering roles
    if (isEngineeringJob && (proj.name.toLowerCase().includes('sdk') || proj.name.toLowerCase().includes('api') || projDesc.includes('modular'))) {
      score += 15;
    }

    // Recent projects get a small boost
    score += 5;

    return { proj, score, isProject: true };
  });

  // Sort by score and get best match
  scoredExperiences.sort((a, b) => b.score - a.score);
  scoredProjects.sort((a, b) => b.score - a.score);

  // Debug: log top 3 matches
  console.log('=== Experience Scoring Debug ===');
  console.log('Lead:', lead.title, '| Tech detected:', detectedTech);
  console.log('Frontend job:', isFrontendJob, '| Backend job:', isBackendJob);
  scoredExperiences.slice(0, 3).forEach((s, i) => {
    console.log(`${i+1}. ${s.exp.company} (${s.exp.domain}): score ${s.score}`);
  });
  if (scoredProjects.length > 0) {
    console.log('Top project:', scoredProjects[0]?.proj.name, '- score', scoredProjects[0]?.score);
  }
  console.log('================================');

  // Decide between work experience and personal project
  const bestExp = scoredExperiences[0];
  const bestProj = scoredProjects[0];

  let relevantExp;
  let relevantProject = null;

  // Use project if it scores significantly better than experience (especially for frontend/fullstack)
  // This handles cases like Pareto where Survey SDK (React/TS) is way more relevant than work experience
  const projectScoreThreshold = 50; // Project needs to score at least this to be considered
  const projectWinsByMargin = bestProj && bestProj.score >= projectScoreThreshold && bestProj.score > bestExp.score;

  if (projectWinsByMargin) {
    // Project is more relevant - use it as primary, with best work exp as secondary context
    relevantProject = bestProj.proj;
    relevantExp = bestExp.exp; // Still include work exp for credibility
    console.log(`Using PROJECT "${bestProj.proj.name}" (score: ${bestProj.score}) over ${bestExp.exp.company} (score: ${bestExp.score})`);
  } else {
    relevantExp = bestExp?.exp || profile.experience_summary[0];
    // Still mention project if it scored well and job is technical
    if (bestProj && bestProj.score >= 40 && isEngineeringJob) {
      relevantProject = bestProj.proj;
    }
  }

  let prompt;
  
  if (messageType === 'apply') {

    // Extract key info for a focused prompt
    const companyName = lead.company || 'your company';

    // Get the full job description for business need analysis
    const jobDescription = (lead.description || '').substring(0, 800);

    // Build relevant experience summary
    const relevantWorkDesc = projectWinsByMargin && relevantProject
      ? `${relevantProject.name}: ${relevantProject.description}`
      : `${relevantExp.role} at ${relevantExp.company}: ${relevantExp.description}`;

    prompt = `Analyze this job posting and write a personalized 50-60 word application message.

JOB AT ${companyName}:
${jobDescription}

MY BACKGROUND:
${relevantWorkDesc}
Tech: ${projectWinsByMargin && relevantProject ? relevantProject.tech.join(', ') : relevantExp.tech.join(', ')}

INSTRUCTIONS:
1. First identify the client's MAIN BUSINESS NEED or PROBLEM from the job description
2. Write a message that directly addresses that need with specific experience
3. No greeting. No "I'm excited". Be specific, not generic.
4. End with "Happy to chat."

FORMAT: [Identify their specific need] + [How your experience solves it with concrete example] + "Happy to chat."

Message:`;
  } else if (messageType === 'outbound') {
    prompt = `Write a 40-word cold outreach message. No greeting. Direct and professional.

FROM: Mar, senior developer, 10+ years, specializing in ${relevantExp.tech.slice(0, 3).join(', ')}.
TO: ${lead.company || 'Company'}
CONTEXT: ${(lead.description || '').substring(0, 150)}

FORMAT: [Identify one problem you could solve] + [Brief credential] + "Open to a quick chat?"

Message:`;
  }
  
  try {
    const response = await axios.post(`${getOllamaUrl()}/api/generate`, {
      model: getOllamaModel(),
      prompt,
      stream: false,
      options: {
        temperature: 0.5,      // Slightly more creative for personalization
        num_predict: 200,      // More room for analysis + message
        top_p: 0.9,
        repeat_penalty: 1.3    // Avoid repetitive phrases
      }
    }, { timeout: 60000 });

    let message = response.data.response.trim();

    // Aggressive cleanup for LLM artifacts
    message = message.replace(/^["']|["']$/g, '');
    message = message.replace(/^(Hi|Hello|Hey|Dear|Greetings)[,!\s]*/i, '');
    message = message.replace(/^(I am writing|I'm writing|I wanted|I would like)[^.]*\.\s*/i, '');
    message = message.replace(/^(I came across|I noticed|I saw|I found)[^.]*\.\s*/i, '');
    message = message.replace(/^Message:\s*/i, '');
    message = message.replace(/\n+/g, ' ').trim();

    // Replace emotional/salesy language - use simple string replacements
    const replacements = [
      ['Excited about', 'Interested in'],
      ['excited about', 'interested in'],
      ['Excited to', 'Looking to'],
      ['excited to', 'looking to'],
      ['Thrilled about', 'Interested in'],
      ['thrilled about', 'interested in'],
      ['Eager to', 'Looking to'],
      ['eager to', 'looking to'],
      ['Enthusiastic about', 'Interested in'],
      ['enthusiastic about', 'interested in'],
      ['Passionate about', 'Focused on'],
      ['passionate about', 'focused on'],
      ['Proudly ', ''],
      ['proudly ', ''],
      ["Let's chat!", 'Happy to chat.'],
    ];
    for (const [from, to] of replacements) {
      message = message.split(from).join(to);
    }
    message = message.replace(/Happy to contribute[^.]*\./gi, 'Happy to chat.');

    // Remove salesy filler phrases entirely
    message = message.replace(/I believe I would be a great fit[^.]*\.\s*/gi, '');
    message = message.replace(/I would love to[^.]*\.\s*/gi, '');
    message = message.replace(/This role resonates[^.]*\.\s*/gi, '');
    message = message.replace(/Happy to contribute[^.]*\.\s*/gi, 'Happy to chat. ');
    message = message.replace(/\bshowcases my skills in\b/gi, 'demonstrates');
    message = message.replace(/\bLet's chat!\s*$/gi, 'Happy to chat.');
    message = message.replace(/\bHappy to chat\.\s*Happy to chat\./gi, 'Happy to chat.');

    // Trim to ~60 words max
    const words = message.split(/\s+/);
    if (words.length > 65) {
      // Find a good cutoff point (end of sentence near 60 words)
      let cutoff = 60;
      for (let i = 55; i < Math.min(70, words.length); i++) {
        if (words[i]?.match(/[.!?]$/)) {
          cutoff = i + 1;
          break;
        }
      }
      message = words.slice(0, cutoff).join(' ');
    }

    // Ensure it ends properly
    if (!message.match(/[.!?]$/)) {
      message += '.';
    }

    // Return what was actually used in the message
    const usedReference = (projectWinsByMargin && relevantProject)
      ? relevantProject.name
      : relevantExp.company;
    return { success: true, message, relevantExp: usedReference };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      return { success: false, error: 'Ollama no esta corriendo. Ejecuta: ollama serve' };
    }
    return { success: false, error: error.message };
  }
}

export async function improveMessage(currentMessage, feedback) {
  const prompt = `Rewrite this message applying the requested change. Keep it under 60 words. Output ONLY the new message.

CURRENT: "${currentMessage}"
CHANGE: ${feedback}

NEW MESSAGE:`;

  try {
    const response = await axios.post(`${getOllamaUrl()}/api/generate`, {
      model: getOllamaModel(),
      prompt,
      stream: false,
      options: {
        temperature: 0.4,
        num_predict: 150,
        repeat_penalty: 1.2
      }
    }, { timeout: 60000 });

    let message = response.data.response.trim();
    message = message.replace(/^["']|["']$/g, '');
    message = message.replace(/^(NEW MESSAGE|Message|Here'?s?):\s*/i, '');
    message = message.replace(/\n+/g, ' ').trim();

    return { success: true, message };
  } catch (error) {
    return { success: false, error: error.message };
  }
}