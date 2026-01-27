export type AppState = 'upload' | 'processing' | 'results';

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
  id?: string;
  questionNumber?: string;
  questionText: string;
  steps: string[];
  diagram?: string;
}
