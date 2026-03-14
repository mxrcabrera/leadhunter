import { createScoutAgent } from './scout-agent.js';
import { createAnalystAgent } from './analyst-agent.js';
import { createWriterAgent } from './writer-agent.js';
import * as db from '../db/database.js';

const INTENT_PATTERNS = {
  scout: [
    /\b(busc|scrap|nuevos?|scout|encontr|rastr|hunt)\b/i,
    /\b(hackernews|reddit|remoteok|hn)\b/i
  ],
  analyst: [
    /\b(analiz|evalu|investig|revis|examin|valorar|recomiend)\b/i,
    /\b(top|mejor|vale la pena|worth)\b/i
  ],
  writer: [
    /\b(mensaj|escrib|redact|aplic|generar?\s*mensaj|message|write)\b/i
  ],
  stats: [
    /\b(stats?|estad[ií]stic|cu[aá]ntos?|resumen|overview|total)\b/i
  ],
  pipeline: [
    /\b(pipeline|completo|todo|full\s*run|ejecutar?\s*todo)\b/i
  ]
};

function detectIntent(message) {
  const msg = message.toLowerCase();

  // Check pipeline first (most specific)
  if (INTENT_PATTERNS.pipeline.some(p => p.test(msg))) return 'pipeline';
  if (INTENT_PATTERNS.stats.some(p => p.test(msg))) return 'stats';

  // Check for combined intents but pick the strongest
  const scores = { scout: 0, analyst: 0, writer: 0 };
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'stats' || intent === 'pipeline') continue;
    for (const pattern of patterns) {
      if (pattern.test(msg)) scores[intent]++;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] > 0) return best[0];

  // Default: try scout for general questions about leads
  return 'scout';
}

export async function orchestrate(message) {
  const intent = detectIntent(message);
  console.log(`[Orchestrator] Intent detected: ${intent} for: "${message}"`);

  if (intent === 'stats') {
    const stats = db.getStats();
    const total = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
    const lines = [
      `Estadisticas de leads:`,
      `- Total activos: ${total}`,
      ...Object.entries(stats.byCategory).map(([k, v]) => `- ${k}: ${v}`),
      `- Score alto (70+): ${stats.highScore}`,
      ``,
      `Por estado:`,
      ...Object.entries(stats.byStatus).map(([k, v]) => `- ${k}: ${v}`),
      ``,
      `Por fuente:`,
      ...Object.entries(stats.bySource).map(([k, v]) => `- ${k}: ${v}`)
    ];
    return {
      result: lines.join('\n'),
      agent: 'Orchestrator',
      actionsLog: [{ timestamp: new Date().toISOString(), agent: 'Orchestrator', message: 'Stats directas sin agente' }],
      iterations: 0
    };
  }

  if (intent === 'pipeline') {
    return runPipeline({ sources: ['hn', 'reddit', 'remoteok'], topN: 5, generateMessages: true });
  }

  const agents = {
    scout: createScoutAgent,
    analyst: createAnalystAgent,
    writer: createWriterAgent
  };

  const agent = agents[intent]();
  const result = await agent.run(message);
  return { ...result, agent: agent.name };
}

export async function runPipeline({ sources = ['hn', 'reddit', 'remoteok'], topN = 5, generateMessages = true } = {}) {
  const allLogs = [];
  const log = (msg) => {
    const entry = { timestamp: new Date().toISOString(), agent: 'Pipeline', message: msg };
    allLogs.push(entry);
    console.log(`[Pipeline] ${msg}`);
  };

  // Step 1: Scout - scrape sources
  log('Paso 1: Ejecutando Scout para scrapear fuentes...');
  const scout = createScoutAgent();
  const sourceList = sources.join(', ');
  const scoutResult = await scout.run(`Scrapeá todas las fuentes (${sourceList}) y decime cuántos leads nuevos encontraste.`);
  allLogs.push(...scoutResult.actionsLog);

  // Step 2: Get top leads
  log(`Paso 2: Buscando top ${topN} leads por score...`);
  const topLeads = db.getLeads({ minScore: 30, limit: topN });
  log(`Encontrados ${topLeads.length} leads con score >= 30`);

  let messagesGenerated = 0;
  const generatedMessages = [];

  // Step 3: Writer - generate messages for top leads
  if (generateMessages && topLeads.length > 0) {
    log('Paso 3: Ejecutando Writer para generar mensajes...');
    const writer = createWriterAgent();
    const leadIds = topLeads.slice(0, topN).map(l => l.id).join(', ');
    const writerResult = await writer.run(
      `Genera mensajes de aplicacion para los leads con IDs: ${leadIds}. Usa generate_message para cada uno.`
    );
    allLogs.push(...writerResult.actionsLog);
    // Count generated messages from logs
    messagesGenerated = writerResult.actionsLog.filter(l =>
      l.message.includes('generate_message')
    ).length;
  }

  const summary = [
    `Pipeline completado:`,
    `- Fuentes scrapeadas: ${sources.join(', ')}`,
    `- Top leads encontrados: ${topLeads.length}`,
    `- Mensajes generados: ${messagesGenerated}`,
    ``,
    `Top leads:`,
    ...topLeads.map((l, i) =>
      `${i + 1}. [${l.total_score}pts] ${l.title} @ ${l.company || 'N/A'} (${l.category})`
    )
  ].join('\n');

  return {
    result: summary,
    agent: 'Pipeline',
    actionsLog: allLogs,
    iterations: 0,
    data: {
      newLeads: scoutResult.result,
      topMatches: topLeads.map(l => ({
        id: l.id,
        title: l.title,
        company: l.company,
        score: l.total_score,
        category: l.category
      })),
      messagesGenerated
    }
  };
}
