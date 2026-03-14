import { Ollama } from 'ollama';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getOllamaConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getOllamaClient() {
  const config = getOllamaConfig();
  return new Ollama({ host: config.url });
}

function getOllamaModel() {
  return getOllamaConfig().model;
}

// Load products
function loadProducts() {
  try {
    const productsPath = path.join(__dirname, '../../data/products.json');
    const data = readFileSync(productsPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[SalesMessages] Error loading products:', error.message);
    return { products: [], default_settings: {} };
  }
}

function getProduct(productId) {
  const { products } = loadProducts();
  return products.find(p => p.id === productId);
}

export async function generateSalesMessage(prospect, productId) {
  const product = getProduct(productId);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const { default_settings } = loadProducts();

  // Build context about the prospect
  const prospectContext = [
    `Nombre: ${prospect.name}`,
    prospect.description ? `Descripción: ${prospect.description}` : null,
    prospect.location ? `Ubicación: ${prospect.location}` : null
  ].filter(Boolean).join('\n');

  // Build context about the product
  const productContext = [
    `Nombre del producto: ${product.name}`,
    `Descripción: ${product.description}`,
    `Propuesta de valor: ${product.value_prop}`,
    `Público objetivo: ${product.target_audience}`,
    product.features ? `Características principales: ${product.features.join(', ')}` : null,
    product.pain_points ? `Problemas que resuelve: ${product.pain_points.join(', ')}` : null
  ].filter(Boolean).join('\n');

  const prompt = `Eres un experto en ventas B2B. Tu tarea es escribir un mensaje corto y efectivo para contactar a un prospecto y ofrecerle un producto de software.

INFORMACIÓN DEL PROSPECTO:
${prospectContext}

PRODUCTO A OFRECER:
${productContext}

INSTRUCCIONES ESTRICTAS:
1. El mensaje debe tener entre 50 y 80 palabras MÁXIMO
2. Empezá con "Hola" seguido de algo que demuestre que investigaste al prospecto (mencioná algo de su descripción o rubro)
3. NO uses saludos genéricos como "Espero que estés bien" o "Me presento"
4. NO uses "Estimado/a" ni formalidades excesivas
5. Mencioná UN solo beneficio clave del producto, el más relevante para este prospecto
6. Terminá con UNA pregunta simple que invite a responder (ej: "¿Te interesaría ver cómo funciona?" o "¿Podemos coordinar 15 minutos para mostrártelo?")
7. Tono: profesional pero cercano, como si hablaras con un colega
8. NO uses emojis
9. NO menciones precios
10. El mensaje es para WhatsApp o email, así que debe ser conciso

IMPORTANTE: Generá SOLO el mensaje, sin explicaciones, sin comillas, sin "Asunto:", solo el texto del mensaje.`;

  try {
    console.log(`[SalesMessages] Generating message for ${prospect.name} with product ${product.name}`);

    const response = await getOllamaClient().generate({
      model: getOllamaModel(),
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9
      }
    });

    let message = response.response.trim();

    // Clean up common issues
    message = cleanupMessage(message);

    console.log(`[SalesMessages] Generated message (${message.split(' ').length} words)`);

    return {
      success: true,
      message,
      product: {
        id: product.id,
        name: product.name
      },
      prospect: {
        id: prospect.id,
        name: prospect.name
      }
    };

  } catch (error) {
    console.error('[SalesMessages] Error generating message:', error.message);

    // Return a fallback template message
    const fallbackMessage = `Hola, vi que trabajan en ${prospect.description ? 'el rubro de ' + prospect.description.substring(0, 50) : 'un área donde nuestro producto puede ayudar'}. Desarrollé ${product.name}, que ${product.value_prop.toLowerCase()}. ¿Te interesaría saber más?`;

    return {
      success: false,
      message: fallbackMessage,
      error: error.message,
      product: {
        id: product.id,
        name: product.name
      }
    };
  }
}

function cleanupMessage(message) {
  // Remove quotes if the whole message is wrapped
  if ((message.startsWith('"') && message.endsWith('"')) ||
      (message.startsWith("'") && message.endsWith("'"))) {
    message = message.slice(1, -1);
  }

  // Remove "Asunto:" or "Subject:" lines
  message = message.replace(/^(Asunto|Subject|Mensaje|Message):.*\n?/im, '');

  // Remove signature-like endings
  message = message.replace(/\n*(Saludos|Atentamente|Cordialmente|Un saludo),?\n*.*/is, '');

  // Remove excessive newlines
  message = message.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace
  message = message.trim();

  return message;
}

export async function improveSalesMessage(currentMessage, feedback, prospect, productId) {
  const product = getProduct(productId);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const prompt = `Eres un experto en ventas B2B. Tenés que mejorar un mensaje de ventas basándote en el feedback recibido.

MENSAJE ACTUAL:
${currentMessage}

FEEDBACK PARA MEJORAR:
${feedback}

CONTEXTO DEL PROSPECTO:
- Nombre: ${prospect.name}
${prospect.description ? `- Descripción: ${prospect.description}` : ''}

PRODUCTO:
- ${product.name}: ${product.value_prop}

INSTRUCCIONES:
1. Mantené el mensaje entre 50-80 palabras
2. Aplicá el feedback recibido
3. Mantené el tono profesional pero cercano
4. Terminá con una pregunta que invite a responder

Generá SOLO el mensaje mejorado, sin explicaciones.`;

  try {
    const response = await getOllamaClient().generate({
      model: getOllamaModel(),
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7
      }
    });

    let message = response.response.trim();
    message = cleanupMessage(message);

    return {
      success: true,
      message,
      wasImproved: true
    };

  } catch (error) {
    console.error('[SalesMessages] Error improving message:', error.message);
    return {
      success: false,
      message: currentMessage,
      error: error.message
    };
  }
}

// Generate a follow-up message
export async function generateFollowUpMessage(prospect, productId, previousMessage, daysSinceContact = 3) {
  const product = getProduct(productId);

  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }

  const prompt = `Eres un experto en ventas B2B. Tenés que escribir un mensaje de seguimiento (follow-up) corto.

CONTEXTO:
- Hace ${daysSinceContact} días enviaste este mensaje al prospecto "${prospect.name}":
"${previousMessage}"
- No recibiste respuesta

PRODUCTO: ${product.name}

INSTRUCCIONES:
1. Mensaje MUY corto: 30-50 palabras máximo
2. NO repitas la propuesta de valor completa
3. Sé breve y directo
4. Preguntá si vieron el mensaje anterior o si tienen alguna consulta
5. NO seas insistente ni presionante
6. Tono amigable

Generá SOLO el mensaje de follow-up, sin explicaciones.`;

  try {
    const response = await getOllamaClient().generate({
      model: getOllamaModel(),
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.7
      }
    });

    let message = response.response.trim();
    message = cleanupMessage(message);

    return {
      success: true,
      message,
      isFollowUp: true
    };

  } catch (error) {
    console.error('[SalesMessages] Error generating follow-up:', error.message);

    const fallback = `Hola, te escribí hace unos días sobre ${product.short_name || product.name}. ¿Tuviste chance de verlo? Quedó a disposición por cualquier consulta.`;

    return {
      success: false,
      message: fallback,
      error: error.message
    };
  }
}

export default {
  generateSalesMessage,
  improveSalesMessage,
  generateFollowUpMessage
};
