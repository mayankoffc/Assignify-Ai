import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { QuestionSolution } from '../types';
import { OCR_CONFIG } from '../constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export interface OCRProgress {
  status: string;
  progress: number;
}

export type ProgressCallback = (progress: OCRProgress) => void;

let worker: Worker | null = null;

export async function initializeWorker(onProgress?: ProgressCallback): Promise<Worker> {
  if (worker) {
    return worker;
  }
  
  onProgress?.({ status: 'Initializing OCR engine...', progress: 0 });
  
  worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress?.({ 
          status: 'Recognizing text...', 
          progress: Math.round(m.progress * 100) 
        });
      }
    }
  });
  
  return worker;
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

export async function extractTextFromImage(
  imageData: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const w = await initializeWorker(onProgress);
  
  onProgress?.({ status: 'Processing image...', progress: 0 });
  
  const result = await w.recognize(imageData);
  
  onProgress?.({ status: 'Complete', progress: 100 });
  
  return result.data.text;
}

async function pdfPageToCanvas(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  scale: number = OCR_CONFIG.PDF_SCALE
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas
  } as any).promise;
  
  return canvas;
}

export async function extractTextFromPDF(
  pdfData: string,
  onProgress?: ProgressCallback
): Promise<string[]> {
  onProgress?.({ status: 'Loading PDF...', progress: 0 });
  
  const base64Data = pdfData.split(',')[1];
  const pdfBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
  
  const numPages = pdf.numPages;
  const pageTexts: string[] = [];
  const w = await initializeWorker(onProgress);
  
  for (let i = 1; i <= numPages; i++) {
    onProgress?.({ 
      status: `Processing page ${i} of ${numPages}...`, 
      progress: Math.round(((i - 1) / numPages) * 100) 
    });
    
    const canvas = await pdfPageToCanvas(pdf, i);
    const imageData = canvas.toDataURL('image/png');
    
    const result = await w.recognize(imageData);
    pageTexts.push(result.data.text);
    
    canvas.remove();
  }
  
  onProgress?.({ status: 'OCR complete', progress: 100 });
  
  return pageTexts;
}

export async function processFile(
  fileData: string,
  fileType: string,
  onProgress?: ProgressCallback
): Promise<string[]> {
  if (fileType === 'application/pdf' || fileData.startsWith('data:application/pdf')) {
    return await extractTextFromPDF(fileData, onProgress);
  } else {
    const text = await extractTextFromImage(fileData, onProgress);
    return [text];
  }
}

function parseTextToQuestions(pageTexts: string[]): QuestionSolution[] {
  const allText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
  
  const questionPatterns = [
    /(?:Q(?:uestion)?\.?\s*(\d+)[.:\s])/gi,
    /(?:^|\n)(\d+)[.)]\s+/gm,
    /(?:^|\n)([A-Z])[.)]\s+/gm,
  ];
  
  const lines = allText.split('\n').filter(line => line.trim().length > 0);
  
  if (lines.length === 0) {
    return [{
      questionText: 'No text could be extracted from the document',
      steps: ['Please ensure the document contains readable text.']
    }];
  }
  
  const solutions: QuestionSolution[] = [];
  let currentQuestion: string[] = [];
  let questionNumber = 0;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.includes('--- PAGE BREAK ---')) {
      continue;
    }
    
    let isNewQuestion = false;
    for (const pattern of questionPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(trimmedLine)) {
        isNewQuestion = true;
        break;
      }
    }
    
    if (isNewQuestion && currentQuestion.length > 0) {
      const questionText = currentQuestion[0] || `Question ${questionNumber}`;
      const steps = currentQuestion.slice(1);
      
      solutions.push({
        questionText: questionText,
        steps: steps.length > 0 ? steps : ['(No solution steps found)']
      });
      
      currentQuestion = [trimmedLine];
      questionNumber++;
    } else {
      currentQuestion.push(trimmedLine);
    }
  }
  
  if (currentQuestion.length > 0) {
    const questionText = currentQuestion[0] || `Content from document`;
    const steps = currentQuestion.slice(1);
    
    solutions.push({
      questionText: questionText,
      steps: steps.length > 0 ? steps : ['(Document content extracted above)']
    });
  }
  
  if (solutions.length === 0) {
    const chunks = chunkText(allText, 500);
    return chunks.map((chunk, idx) => ({
      questionText: `Extracted Content (Section ${idx + 1})`,
      steps: chunk.split('\n').filter(l => l.trim().length > 0)
    }));
  }
  
  return solutions;
}

function chunkText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\s*\n/);
  
  let currentChunk = '';
  
  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

export async function processFileToSolutions(
  fileData: string,
  fileType: string,
  onProgress?: ProgressCallback
): Promise<QuestionSolution[]> {
  try {
    const pageTexts = await processFile(fileData, fileType, onProgress);
    
    onProgress?.({ status: 'Parsing extracted text...', progress: 95 });
    
    const solutions = parseTextToQuestions(pageTexts);
    
    onProgress?.({ status: 'Complete', progress: 100 });
    
    return solutions;
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  }
}
