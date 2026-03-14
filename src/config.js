import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../data/config.json');

const DEFAULT_CONFIG = {
  google: {
    apiKey: '',
    cx: ''
  },
  ollama: {
    url: 'http://localhost:11434',
    model: 'mistral'
  }
};

export function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      saveConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const config = JSON.parse(data);
    return {
      google: { ...DEFAULT_CONFIG.google, ...config.google },
      ollama: { ...DEFAULT_CONFIG.ollama, ...config.ollama }
    };
  } catch (error) {
    console.error('[Config] Error loading config:', error.message);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config) {
  try {
    const dataDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const merged = {
      google: { ...DEFAULT_CONFIG.google, ...config.google },
      ollama: { ...DEFAULT_CONFIG.ollama, ...config.ollama }
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
    return true;
  } catch (error) {
    console.error('[Config] Error saving config:', error.message);
    return false;
  }
}

export function getGoogleCredentials() {
  const config = loadConfig();
  if (config.google.apiKey && config.google.cx) {
    return {
      apiKey: config.google.apiKey,
      cx: config.google.cx
    };
  }
  return null;
}

export function getOllamaConfig() {
  const config = loadConfig();
  return {
    url: config.ollama.url || DEFAULT_CONFIG.ollama.url,
    model: config.ollama.model || DEFAULT_CONFIG.ollama.model
  };
}

export function maskApiKey(key) {
  if (!key || key.length < 8) return key ? '****' : '';
  return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

export function getConfigForUI() {
  const config = loadConfig();
  return {
    google: {
      configured: !!(config.google.apiKey && config.google.cx),
      apiKey: maskApiKey(config.google.apiKey),
      cx: maskApiKey(config.google.cx)
    },
    ollama: {
      url: config.ollama.url,
      model: config.ollama.model
    }
  };
}

export default {
  loadConfig,
  saveConfig,
  getGoogleCredentials,
  getOllamaConfig,
  getConfigForUI,
  maskApiKey
};
