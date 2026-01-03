import { GoogleGenAI } from "@google/genai";
import type { ImageFile } from '../types';
import { getApiKey } from './storageService';

/**
 * Creates a fresh AI client using the stored API key.
 */
const createAiClient = async () => {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("API_KEY not found. Please set your Gemini API key in settings.");
  }
  return new GoogleGenAI({ apiKey });
};

const dataUrlToGeminiPart = (image: ImageFile) => {
  // Handle both data URL format and raw base64
  const base64Data = image.base64.includes(',') 
    ? image.base64.split(',')[1] 
    : image.base64;
  
  return {
    inlineData: {
      mimeType: image.mimeType,
      data: base64Data
    }
  };
};

export async function generatePaintedMiniature(
  baseImages: ImageFile | ImageFile[] | null,
  prompt: string,
  numberOfImages: number,
  model: 'gemini-2.5-flash-image' | 'imagen-4.0-generate-001' | 'gemini-3-pro-image-preview'
): Promise<string[]> {
  const ai = await createAiClient();
  const imagesToProcess = Array.isArray(baseImages) ? baseImages : (baseImages ? [baseImages] : []);
  const isPro = model === 'gemini-3-pro-image-preview';

  if (model === 'imagen-4.0-generate-001') {
    const response = await ai.models.generateImages({
      model: model,
      prompt: `Masterpiece painted miniature: ${prompt}`,
      config: { numberOfImages: 1, aspectRatio: '1:1' },
    });
    return response.generatedImages?.[0] ? [`data:image/png;base64,${response.generatedImages[0].image.imageBytes}`] : [];
  }

  const imageParts = imagesToProcess.map(img => dataUrlToGeminiPart(img));
  
  const response = await ai.models.generateContent({
    model: model,
    contents: { 
      parts: [
        ...imageParts, 
        { text: isPro ? `[ADVANCED REASONING MODE] Focus on technical precision and material accuracy for this miniature: ${prompt}` : prompt }
      ] 
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        ...(isPro ? { imageSize: "1K" } : {})
      },
      ...(isPro ? { 
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 } 
      } : {})
    }
  });

  const generatedImages: string[] = [];
  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData) {
        generatedImages.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
      }
    }
  }
  return generatedImages;
}

export async function generateImageFromImage(
  baseImages: ImageFile | ImageFile[],
  prompt: string,
  model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
): Promise<string[]> {
  const ai = await createAiClient();
  const imagesToProcess = Array.isArray(baseImages) ? baseImages : [baseImages];
  const imageParts = imagesToProcess.map(img => dataUrlToGeminiPart(img));
  const isPro = model === 'gemini-3-pro-image-preview';

  const response = await ai.models.generateContent({
    model: model,
    contents: { 
      parts: [
        ...imageParts, 
        { text: isPro ? `[DESIGN SYNTHESIS MODE] Analyze these references and generate a new high-detail concept: ${prompt}` : prompt }
      ] 
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        ...(isPro ? { imageSize: "1K" } : {})
      },
      ...(isPro ? { 
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 32768 }
      } : {})
    }
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData) {
        return [`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`];
      }
    }
  }
  throw new Error("No image generated. Please check your prompt and try again.");
}

export async function upscaleImage(
  baseImage: ImageFile, 
  model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' = 'gemini-2.5-flash-image'
): Promise<string> {
  const ai = await createAiClient();
  const imagePart = dataUrlToGeminiPart(baseImage);
  const isPro = model === 'gemini-3-pro-image-preview';

  const response = await ai.models.generateContent({
    model: model,
    contents: { 
      parts: [
        imagePart, 
        { text: isPro ? "Enhance and upscale this miniature image to 4K resolution. Use ultra-high-definition rendering to refine every texture and sharpen every edge." : "Refine and enhance the details of this miniature image, improving clarity and texture definitions." }
      ] 
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        ...(isPro ? { imageSize: "4K" } : {})
      },
      ...(isPro ? { thinkingConfig: { thinkingBudget: 32768 } } : {})
    }
  });

  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (part?.inlineData) {
    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
  }
  throw new Error("Upscale process failed to return image data.");
}
