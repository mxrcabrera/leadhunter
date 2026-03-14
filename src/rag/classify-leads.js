import { getUncategorizedLeads, updateLeadClassification } from '../db/database.js';
import { classifyLead } from './classifier.js';

async function classifyAllLeads() {
  console.log('========================================');
  console.log('CLASIFICANDO LEADS');
  console.log('========================================\n');
  
  const leads = getUncategorizedLeads();
  console.log(`Leads sin clasificar: ${leads.length}\n`);
  
  if (leads.length === 0) {
    console.log('Todos los leads ya estan clasificados.');
    return;
  }
  
  const stats = {
    freelance_direct: 0,
    agency: 0,
    fulltime_backup: 0,
    outbound_opportunity: 0,
    discarded: 0
  };
  
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const name = (lead.company || lead.title || 'Unknown').substring(0, 40);
    
    const classification = classifyLead(lead);
    updateLeadClassification(lead.id, classification);
    
    stats[classification.category] = (stats[classification.category] || 0) + 1;
    
    const techCount = JSON.parse(classification.detected_tech || '[]').length;
    console.log(`[${i + 1}/${leads.length}] ${name}... ${classification.category} (score: ${classification.total_score}, tech: ${techCount})`);
  }
  
  console.log('\n========================================');
  console.log('RESUMEN');
  console.log('========================================');
  console.log(`Freelance directo (A): ${stats.freelance_direct}`);
  console.log(`Agencias (B): ${stats.agency}`);
  console.log(`Full-time backup (D): ${stats.fulltime_backup}`);
  console.log(`Descartados: ${stats.discarded}`);
  console.log('========================================');
}

classifyAllLeads().catch(console.error);
