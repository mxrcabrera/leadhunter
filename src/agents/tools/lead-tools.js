import * as db from '../../db/database.js';

export const searchLeads = {
  name: 'search_leads',
  description: 'Search leads in the database with optional filters. Returns a list of freelance job leads.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter by category: freelance_direct, agency, fulltime_backup, or all',
        enum: ['freelance_direct', 'agency', 'fulltime_backup', 'all']
      },
      status: {
        type: 'string',
        description: 'Filter by status: new, contacted, responded, call, closed, or all',
        enum: ['new', 'contacted', 'responded', 'call', 'closed', 'all']
      },
      minScore: {
        type: 'number',
        description: 'Minimum total score (0-100)'
      },
      search: {
        type: 'string',
        description: 'Search text in title, company, description'
      },
      limit: {
        type: 'number',
        description: 'Max results to return (default 10)'
      }
    }
  },
  execute: async (args) => {
    const leads = db.getLeads({
      category: args.category !== 'all' ? args.category : undefined,
      status: args.status !== 'all' ? args.status : undefined,
      minScore: args.minScore,
      search: args.search,
      limit: args.limit || 10
    });
    return {
      count: leads.length,
      leads: leads.map(l => ({
        id: l.id,
        title: l.title,
        company: l.company,
        category: l.category,
        status: l.status,
        score: l.total_score,
        source: l.source,
        url: l.url,
        detected_tech: l.detected_tech
      }))
    };
  }
};

export const getLeadDetails = {
  name: 'get_lead_details',
  description: 'Get full details for a specific lead by ID.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'The lead ID' }
    },
    required: ['id']
  },
  execute: async (args) => {
    const lead = db.getLead(args.id);
    if (!lead) return { error: `Lead ${args.id} not found` };
    return lead;
  }
};

export const updateLeadStatus = {
  name: 'update_lead_status',
  description: 'Update the status of a lead.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'number', description: 'The lead ID' },
      status: {
        type: 'string',
        description: 'New status',
        enum: ['new', 'contacted', 'responded', 'call', 'closed', 'discarded']
      }
    },
    required: ['id', 'status']
  },
  execute: async (args) => {
    const lead = db.getLead(args.id);
    if (!lead) return { error: `Lead ${args.id} not found` };
    db.updateLeadStatus(args.id, args.status);
    return { success: true, id: args.id, newStatus: args.status };
  }
};

export const getLeadStats = {
  name: 'get_lead_stats',
  description: 'Get general lead statistics: counts by category, status, source, and high score count.',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    return db.getStats();
  }
};
