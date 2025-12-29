
import { GoogleGenAI } from "@google/genai";

export class FinancialAssistant {
  private ai: GoogleGenAI;

  constructor() {
    // Correctly initialize GoogleGenAI using a named parameter with process.env.API_KEY
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async getAdvice(prompt: string, financialContext: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Eres un asistente financiero experto para una Caja de Ahorro y Crédito. 
        Contexto del usuario: ${financialContext}. 
        Responde de forma amable, profesional y concisa a la siguiente duda: ${prompt}`,
        config: {
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
