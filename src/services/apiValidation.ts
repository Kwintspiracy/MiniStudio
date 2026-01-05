import { GoogleGenAI } from "@google/genai";

export async function validateGeminiApiKey(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
}> {
    try {
        const ai = new GoogleGenAI({ apiKey });
        // Minimal API call to validate key (listing models represents a very light request)
        await ai.models.list();
        return { valid: true };
    } catch (error: any) {
        console.error("API Key Validation Error:", error);
        return {
            valid: false,
            error: error.message || 'Invalid API key or network error'
        };
    }
}
