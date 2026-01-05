export interface StyleOption {
  id: string;
  name: string;
  prompt: string;
}

export interface ImageFile {
  base64: string;
  mimeType: string;
  uri?: string; // For React Native, we often work with URIs
}

export interface HistoryItem {
  id: string;
  url: string; // file:// URI or base64 (temporary)
  isPro: boolean;
  isMaster: boolean;
  timestamp: number;
  modelName: string;
  prompt?: string;
}

export type ToolMode = 'designer' | 'painter';
export type DesignerType = 'sketch' | 'miniature' | 'pro-shot' | 'combined';
