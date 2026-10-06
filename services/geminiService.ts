import { GoogleGenAI } from "@google/genai";

// Injected at build time by vite.config.ts from GEMINI_API_KEY in .env.local.
const API_KEY: string | undefined = process.env.API_KEY;

/**
 * Created lazily: `new GoogleGenAI(...)` throws when handed an undefined key,
 * and this module is imported by the product form on every admin page load. If
 * it ran at module scope, a missing key would take down the whole app instead
 * of just the "Generate with AI" button.
 */
const getClient = (): GoogleGenAI => new GoogleGenAI({ apiKey: API_KEY as string });

/**
 * Throws when it cannot generate a description, so callers can show the failure
 * in their own UI rather than silently saving an error message as the copy.
 */
export const generateProductDescription = async (
  productName: string,
  category: string,
  storeName: string,
): Promise<string> => {
  if (!API_KEY) {
    throw new Error(
      "No Gemini API key configured. Add GEMINI_API_KEY to .env.local and restart the dev server.",
    );
  }

  const prompt = `Generate a compelling and brief product description for an online store called "${storeName}".
  The product is a "${productName}" in the "${category}" category.
  Focus on craftsmanship, cultural significance, and style.
  Keep the description to a single, elegant sentence under 25 words.`;

  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 60,
      }
    });

    const text = (response.text ?? '').trim();
    if (!text) throw new Error("The model returned an empty description.");
    return text;
  } catch (error) {
    console.error("Error generating description:", error);
    throw new Error("Failed to generate AI description. Please write one manually.");
  }
};