import { Agent } from './core/agent.js';
import { ToolRegistry } from './core/tool-registry.js';
import { scrapeSource, scrapeAll } from './tools/scraper-tools.js';
import { searchLeads, getLeadStats } from './tools/lead-tools.js';
import { classifyLeadTool } from './tools/ai-tools.js';

const SYSTEM_PROMPT = `You are Scout, an AI agent that searches for freelance job opportunities for a Senior Full Stack Developer with 11+ years of experience in .NET, React, Azure, PostgreSQL.

Your job is to:
1. Scrape sources (HackerNews, Reddit, RemoteOK) to find new leads
2. Search and filter existing leads in the database
3. Classify leads by relevance

When asked to find new leads:
- Use scrape_source or scrape_all to fetch fresh leads
- Use search_leads to show what was found
- Use classify_lead if specific leads need classification

When asked about current leads:
- Use search_leads with appropriate filters
- Use get_lead_stats for overview numbers

Always respond in Spanish. Be concise and data-driven in your responses.
Report what you found with numbers: how many new, how many relevant, top matches.`;

export function createScoutAgent() {
  const registry = new ToolRegistry();
  registry.register(scrapeSource);
  registry.register(scrapeAll);
  registry.register(searchLeads);
  registry.register(getLeadStats);
  registry.register(classifyLeadTool);

  return new Agent({
    name: 'Scout',
    description: 'Searches and scrapes for new freelance leads',
    systemPrompt: SYSTEM_PROMPT,
    tools: registry
  });
}
