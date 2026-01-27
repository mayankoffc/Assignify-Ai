export type AppState = 'upload' | 'processing' | 'preview';

export interface UploadedFile {
  name: string;
  type: string;
  data: string;
}

export interface ExtractedPage {
  pageNumber: number;
  backgroundImage: string;
  textContent: string;
}

export interface DocumentContent {
  pages: ExtractedPage[];
  totalPages: number;
}

export interface HandwritingStyle {
  slant: number;
  spacing: number;
  size: number;
  pressure: number;
  messiness: number;
  fontMix: string[];
}

export interface QuestionSolution {
  question: string;
  answer: string;
  diagram?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      API_KEY: string;
    }
  }
}
