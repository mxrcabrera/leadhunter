import { Ollama } from 'ollama';
import { getOllamaConfig } from '../../config.js';

const DEFAULT_MODEL = 'qwen2.5:7b';
const MAX_TOOL_RESULT_LENGTH = 3000;

export class Agent {
  constructor({ name, description, systemPrompt, model, tools, maxIterations = 8 }) {
    this.name = name;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.model = model || DEFAULT_MODEL;
    this.tools = tools;
    this.maxIterations = maxIterations;
    this.actionsLog = [];
  }

  getClient() {
    const config = getOllamaConfig();
    return new Ollama({ host: config.url });
  }

  log(message) {
    const entry = { timestamp: new Date().toISOString(), agent: this.name, message };
    this.actionsLog.push(entry);
    console.log(`[${this.name}] ${message}`);
  }

  async run(task) {
    this.actionsLog = [];
    this.log(`Tarea recibida: "${task}"`);

    const client = this.getClient();
    const ollamaTools = this.tools.getOllamaTools();

    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: task }
    ];

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;
      this.log(`Iteracion ${iterations}/${this.maxIterations} - Consultando modelo...`);

      let response;
      try {
        response = await client.chat({
          model: this.model,
          messages,
          tools: ollamaTools.length > 0 ? ollamaTools : undefined
        });
      } catch (error) {
        this.log(`Error de Ollama: ${error.message}`);
        return {
          result: `Error comunicandose con Ollama: ${error.message}`,
          actionsLog: this.actionsLog,
          iterations,
          error: true
        };
      }

      const msg = response.message;
      messages.push(msg);

      // If model made tool calls, execute them
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const toolCall of msg.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments || {};

          this.log(`Tool call: ${toolName}(${JSON.stringify(toolArgs)})`);

          const toolResult = await this.tools.executeTool(toolName, toolArgs);
          const resultStr = JSON.stringify(toolResult);

          // Truncate large results
          const truncated = resultStr.length > MAX_TOOL_RESULT_LENGTH
            ? resultStr.substring(0, MAX_TOOL_RESULT_LENGTH) + '...[truncado]'
            : resultStr;

          this.log(`Tool result (${toolName}): ${truncated.substring(0, 200)}...`);

          messages.push({
            role: 'tool',
            content: truncated
          });
        }
        continue;
      }

      // No tool calls = final answer
      const finalText = msg.content || '';
      this.log(`Respuesta final obtenida (${finalText.length} chars)`);

      return {
        result: finalText,
        actionsLog: this.actionsLog,
        iterations
      };
    }

    this.log(`Max iteraciones alcanzadas (${this.maxIterations})`);
    // Return whatever we have from the last message
    const lastAssistant = messages.filter(m => m.role === 'assistant').pop();
    return {
      result: lastAssistant?.content || 'Se alcanzo el limite de iteraciones sin respuesta final.',
      actionsLog: this.actionsLog,
      iterations,
      maxIterationsReached: true
    };
  }
}
