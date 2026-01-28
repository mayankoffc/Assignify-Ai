export type AppState = 'upload' | 'preview' | 'processing' | 'results';

export interface UploadedFile {
  name: string;
  type: string;
  data: string;
}

export interface ExtractionStats {
  totalCharacters: number;
  totalWords: number;
  totalNumbers: number;
  totalLines: number;
  totalPages: number;
  extractedImages: ExtractedImage[];
}

export interface ExtractedImage {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  pageNumber: number;
}

export interface PreviewData {
  thumbnail: string;
  extractedText: string[];
  stats: ExtractionStats;
  rawPages: string[];
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
  linePlans?: LinePlan[];
  pagePlan?: PagePlan;
}

export interface LinePlan {
  lineNumber: number;
  content: string;
  indent: number;
  isQuestionNumber: boolean;
  isFraction: boolean;
  fractionParts?: { numerator: string; denominator: string; remainingText?: string };
  isHeading: boolean;
  alignment: 'left' | 'center' | 'right';
  emphasis: 'normal' | 'bold' | 'underline';
  wordSpacing: 'tight' | 'normal' | 'loose';
  baselineVariation: number;
  slantAngle: number;
  pressureLevel: number;
}

export interface PagePlan {
  pageNumber: number;
  lines: LinePlan[];
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  lineSpacing: number;
  overallSlant: number;
  writingSpeed: 'slow' | 'medium' | 'fast';
  fatigueLevel: number;
}

export interface WritingPlan {
  pages: PagePlan[];
  globalStyle: {
    consistency: number;
    neatness: number;
    speedVariation: number;
    personalQuirks: string[];
  };
}
