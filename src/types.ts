export interface StyleOption {
  id: string;
  name: string;
  prompt: string;
  promptPro?: string;
}

export interface ImageFile {
  base64: string;
  mimeType: string;
  uri?: string; // For React Native, we often work with URIs
  // Remote public URL (e.g. a PoYo CDN result reused as a source). When set,
  // the image is passed to the backend by URL instead of base64 — this avoids
  // a CORS-blocked client-side fetch on web.
  remoteUrl?: string;
}

export interface HistoryItem {
  url: string;
  isPro: boolean;
  isMaster: boolean;
  timestamp: number;
  modelName: string;
}

export type ToolMode = 'designer' | 'painter';
export type DesignerType = 'sketch' | 'miniature' | 'pro-shot' | 'combined';
export type StudioMode = 'sketch' | 'sculpt' | 'paint';
