
import { GoogleGenAI } from "@google/genai";

export class FinancialAssistant {
  // Fix: Removed persistent ai property to follow the guideline of creating 
  // a new instance right before making an API call.

  async getAdvice(prompt: string, financialContext: string) {
    try {
      // Fix: Initialize GoogleGenAI instance right before the generateContent call.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Contexto del socio: ${financialContext}. Consulta del socio: ${prompt}`,
        config: {
          // Fix: Move the persona/expert instruction to systemInstruction for clearer context separation.
          systemInstruction: 'Eres el asistente financiero de GUTT COMPANY S.A.S. para socios de cooperativas de ahorro y crédito reguladas por la SEPS. Responde de forma amable, profesional y concisa.',
          temperature: 0.7,
        }
      });
      // Correctly access the .text property of GenerateContentResponse
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return "Lo siento, tuve un problema analizando tus finanzas. Por favor intenta de nuevo.";
    }
  }
}
