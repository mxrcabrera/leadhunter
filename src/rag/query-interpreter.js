import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOllamaConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

function getOllamaUrl() {
  return getOllamaConfig().url;
}

function loadProducts() {
  try {
    const productsPath = path.join(DATA_DIR, 'products.json');
    return JSON.parse(fs.readFileSync(productsPath, 'utf-8')).products || [];
  } catch {
    return [];
  }
}

// Use AI to interpret a vague query and generate optimal search terms
export async function interpretProspectQuery(userQuery, location = '') {
  const products = loadProducts();

  const productContext = products.map(p =>
    `- ${p.id}: "${p.name}" - target: ${p.target_audience}`
  ).join('\n');

  const prompt = `Genera un query de busqueda para Google.

Usuario busca: "${userQuery}"
${location ? `Ubicacion: ${location}` : ''}

Productos disponibles:
${productContext}

REGLAS para el query:
- Usa el nombre COMPLETO del tipo de negocio (ej: "clinica dental" no "dentista")
- NO repitas la ubicacion en el query (ya se agrega automaticamente)
- Maximo 3-4 palabras
- Ejemplos buenos: "clinica dental", "estudio de pilates", "administracion de consorcios", "taller mecanico"

Responde SOLO JSON:
{"searchQuery": "query", "productId": "id o null", "businessType": "tipo"}`;

  try {
    const res = await fetch(`${getOllamaUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b',
        prompt,
        stream: false,
        options: { temperature: 0.1 }
      })
    });

    if (!res.ok) {
      return fallbackInterpretation(userQuery, products);
    }

    const data = await res.json();
    const response = (data.response || '').trim();

    // Extract JSON from response - be flexible with parsing
    const jsonMatch = response.match(/\{[^{}]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const searchQuery = parsed.searchQuery || parsed.query || userQuery;
        return {
          success: true,
          originalQuery: userQuery,
          searchQuery: searchQuery.replace(/"/g, ''),
          productId: parsed.productId === 'null' ? null : parsed.productId,
          businessType: parsed.businessType || null
        };
      } catch (parseErr) {
        console.log(`[QueryInterpreter] JSON parse failed, using fallback`);
      }
    }

    return fallbackInterpretation(userQuery, products);

  } catch (error) {
    console.error('[QueryInterpreter] AI error:', error.message);
    return fallbackInterpretation(userQuery, products);
  }
}

// Fallback: use keyword matching if AI fails
function fallbackInterpretation(query, products) {
  const queryLower = query.toLowerCase();

  // Try to match product by keywords
  let matchedProduct = null;
  let bestScore = 0;

  for (const product of products) {
    let score = 0;
    for (const keyword of (product.keywords || [])) {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += keyword.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      matchedProduct = product;
    }
  }

  // If matched product has search_queries, use the first one
  let searchQuery = query;
  if (matchedProduct?.search_queries?.length > 0) {
    searchQuery = matchedProduct.search_queries[0];
  }

  return {
    success: true,
    originalQuery: query,
    searchQuery,
    productId: matchedProduct?.id || null,
    businessType: null,
    fallback: true
  };
}

export default { interpretProspectQuery };
