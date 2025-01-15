import { GoogleGenerativeAI } from "@google/generative-ai";

interface EmotionalState {
  mood: string;
  confidence: string;
}

interface EmotionalAnalysis {
  emotionalState: EmotionalState;
  analysis: string;
}

export const createEmotionalAgent = (model: any) => {
  return async (state: any): Promise<EmotionalAnalysis> => {
    try {
      const prompt = `
        Analyze the emotional context of this conversation:
        ${state.messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')}
        
        Provide:
        1. Current emotional state (mood and confidence)
        2. Brief analysis of emotional context
      `;

      const result = await model.generateContent(prompt);
      const analysis = result.response.text();

      // Parse the emotional state from the analysis
      const emotionalState = {
        mood: analysis.includes('positive') ? 'positive' : 
              analysis.includes('negative') ? 'negative' : 'neutral',
        confidence: analysis.includes('high') ? 'high' : 
                   analysis.includes('low') ? 'low' : 'medium'
      };

      return {
        emotionalState,
        analysis
      };
    } catch (error) {
      console.error("Emotional analysis error:", error);
      return {
        emotionalState: {
          mood: "neutral",
          confidence: "medium"
        },
        analysis: "Error analyzing emotional state"
      };
    }
  };
};