export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(tool) {
    if (!tool.name || !tool.description || !tool.parameters || !tool.execute) {
      throw new Error(`Invalid tool definition: missing required fields (name, description, parameters, execute)`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name) {
    return this.tools.get(name) || null;
  }

  getToolNames() {
    return [...this.tools.keys()];
  }

  getOllamaTools() {
    return [...this.tools.values()].map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  async executeTool(name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Tool "${name}" not found. Available: ${this.getToolNames().join(', ')}` };
    }
    try {
      const result = await tool.execute(args);
      return result;
    } catch (error) {
      return { error: `Tool "${name}" failed: ${error.message}` };
    }
  }
}
