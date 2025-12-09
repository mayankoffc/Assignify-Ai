export type AppState = 'upload' | 'processing' | 'results';

export interface UploadedFile {
  name: string;
  type: string;
  data: string;
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface Region {
  type: 'text' | 'image';
  content: string; // Text content or description
  box: BoundingBox;
}

export interface ProcessedPage {
  pageNumber: number;
  backgroundImage: string; // base64 of original page
  regions: Region[];
}

export interface HandwritingStyle {
  slant: number;
  spacing: number;
  size: number; // multiplier
  weight: number; // stroke width
  messiness: number;
  fontFamily: string;
  color: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
  interface Window {
    aistudio?: {
      hasSelectedApiKey?: () => Promise<boolean>;
      openSelectKey?: () => Promise<void>;
    };
  }
}
