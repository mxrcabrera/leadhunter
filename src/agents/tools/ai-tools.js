import { classifyLead } from '../../rag/classifier.js';
import { generateMessage } from '../../rag/messages.js';
import * as db from '../../db/database.js';

export const classifyLeadTool = {
  name: 'classify_lead',
  description: 'Classify a lead using the rule-based classifier. Assigns category, scores, and detected tech.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'The lead ID to classify' }
    },
    required: ['id']
  },
  execute: async (args) => {
    const lead = db.getLead(args.id);
    if (!lead) return { error: `Lead ${args.id} not found` };

    const classification = classifyLead(lead);
    db.updateLeadClassification(lead.id, classification);

    return {
      id: lead.id,
      title: lead.title,
      category: classification.category,
      totalScore: classification.total_score,
      detectedTech: classification.detected_tech,
      rejectionReason: classification.rejection_reason
    };
  }
};

export const generateMessageTool = {
  name: 'generate_message',
  description: 'Generate a personalized application message for a lead using AI (Ollama).',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'The lead ID to generate a message for' }
    },
    required: ['id']
  },
  execute: async (args) => {
    const lead = db.getLead(args.id);
    if (!lead) return { error: `Lead ${args.id} not found` };

    const messageType = lead.category === 'outbound_opportunity' ? 'outbound' : 'apply';
    const result = await generateMessage(lead, messageType);

    if (result.success) {
      db.insertMessage(lead.id, result.message, result.relevantExp);
      return {
        id: lead.id,
        title: lead.title,
        message: result.message,
        relevantExp: result.relevantExp
      };
    }

    return { error: result.error };
  }
};
