import { createWorker, Worker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { QuestionSolution, ExtractionStats, ExtractedImage, PreviewData } from '../types';
import { OCR_CONFIG } from '../constants';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface OCRProgress {
  status: string;
  progress: number;
  stage?: 'loading' | 'extracting' | 'analyzing' | 'complete';
}

export type ProgressCallback = (progress: OCRProgress) => void;

let worker: Worker | null = null;

export async function initializeWorker(onProgress?: ProgressCallback): Promise<Worker> {
  if (worker) {
    return worker;
  }
  
  onProgress?.({ status: 'Initializing OCR engine...', progress: 0, stage: 'loading' });
  
  try {
    worker = await createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          onProgress?.({ 
            status: 'Recognizing text...', 
            progress: Math.round(m.progress * 100),
            stage: 'extracting'
          });
        }
      }
    });
    
    return worker;
  } catch (error) {
    console.warn('Tesseract worker failed, using fallback text extraction');
    throw error;
  }
}

export async function terminateWorker(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate();
    } catch (e) {
      console.warn('Worker termination warning:', e);
    }
    worker = null;
  }
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
    canvas: canvas,
  } as any).promise;
  
  return canvas;
}

async function extractTextFromPDFPage(page: pdfjsLib.PDFPageProxy): Promise<string> {
  try {
    const textContent = await page.getTextContent();
    const textItems = textContent.items as Array<{ str: string }>;
    return textItems.map(item => item.str).join(' ');
  } catch (e) {
    return '';
  }
}

async function extractImagesFromCanvas(
  canvas: HTMLCanvasElement,
  pageNum: number
): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return images;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let hasNonWhitePixels = false;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      hasNonWhitePixels = true;
      break;
    }
  }
  
  if (hasNonWhitePixels) {
    images.push({
      id: `page-${pageNum}-full`,
      dataUrl: canvas.toDataURL('image/png', 0.8),
      width: canvas.width,
      height: canvas.height,
      pageNumber: pageNum
    });
  }
  
  return images;
}

export async function extractPreviewData(
  fileData: string,
  fileType: string,
  onProgress?: ProgressCallback
): Promise<PreviewData> {
  const extractedText: string[] = [];
  const extractedImages: ExtractedImage[] = [];
  let thumbnail = '';
  
  onProgress?.({ status: 'Loading document...', progress: 5, stage: 'loading' });

  if (fileType === 'application/pdf' || fileData.startsWith('data:application/pdf')) {
    const base64Data = fileData.split(',')[1];
    const pdfBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    onProgress?.({ status: 'Parsing PDF structure...', progress: 10, stage: 'loading' });
    
    const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
    const numPages = pdf.numPages;
    
    for (let i = 1; i <= numPages; i++) {
      const progressPercent = 10 + Math.round((i / numPages) * 70);
      onProgress?.({ 
        status: `Extracting page ${i} of ${numPages}...`, 
        progress: progressPercent,
        stage: 'extracting'
      });
      
      const page = await pdf.getPage(i);
      
      const nativeText = await extractTextFromPDFPage(page);
      
      const canvas = await pdfPageToCanvas(pdf, i, 1.5);
      
      if (i === 1) {
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 200;
        thumbCanvas.height = 280;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          thumbCtx.drawImage(canvas, 0, 0, 200, 280);
          thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);
        }
        thumbCanvas.remove();
      }
      
      let pageText = nativeText;
      
      if (nativeText.trim().length < 50) {
        onProgress?.({ 
          status: `OCR scanning page ${i}...`, 
          progress: progressPercent + 5,
          stage: 'extracting'
        });
        
        try {
          const w = await initializeWorker(onProgress);
          const ocrResult = await w.recognize(canvas.toDataURL('image/png'));
          pageText = ocrResult.data.text || nativeText;
        } catch (e) {
          console.warn('OCR failed for page', i, e);
          pageText = nativeText || `[Page ${i} content]`;
        }
      }
      
      extractedText.push(pageText);
      
      const pageImages = await extractImagesFromCanvas(canvas, i);
      extractedImages.push(...pageImages);
      
      canvas.remove();
    }
  } else {
    onProgress?.({ status: 'Processing image...', progress: 20, stage: 'extracting' });
    
    thumbnail = fileData;
    
    const img = new Image();
    img.src = fileData;
    await new Promise((resolve) => { img.onload = resolve; });
    
    extractedImages.push({
      id: 'image-1',
      dataUrl: fileData,
      width: img.width,
      height: img.height,
      pageNumber: 1
    });
    
    onProgress?.({ status: 'Running OCR...', progress: 40, stage: 'extracting' });
    
    try {
      const w = await initializeWorker(onProgress);
      const result = await w.recognize(fileData);
      extractedText.push(result.data.text || '[Image content]');
    } catch (e) {
      console.warn('OCR failed:', e);
      extractedText.push('[Image content - OCR unavailable]');
    }
  }
  
  onProgress?.({ status: 'Analyzing content...', progress: 90, stage: 'analyzing' });
  
  const allText = extractedText.join('\n');
  const words = allText.split(/\s+/).filter(w => w.length > 0);
  const numbers = allText.match(/\d+/g) || [];
  const lines = allText.split('\n').filter(l => l.trim().length > 0);
  
  const stats: ExtractionStats = {
    totalCharacters: allText.length,
    totalWords: words.length,
    totalNumbers: numbers.length,
    totalLines: lines.length,
    totalPages: extractedText.length,
    extractedImages
  };
  
  onProgress?.({ status: 'Preview ready', progress: 100, stage: 'complete' });
  
  return {
    thumbnail,
    extractedText,
    stats,
    rawPages: extractedText
  };
}

function parseTextToQuestions(pageTexts: string[]): QuestionSolution[] {
  const allText = pageTexts.join('\n\n');
  
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
  let questionNumber = 1;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
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
        questionNumber: `Q${questionNumber}.`,
        questionText: questionText,
        steps: steps.length > 0 ? steps : ['(Answer content)']
      });
      
      currentQuestion = [trimmedLine];
      questionNumber++;
    } else {
      currentQuestion.push(trimmedLine);
    }
  }
  
  if (currentQuestion.length > 0) {
    const questionText = currentQuestion[0] || `Content`;
    const steps = currentQuestion.slice(1);
    
    solutions.push({
      questionNumber: solutions.length === 0 ? 'Q1.' : `Q${questionNumber}.`,
      questionText: questionText,
      steps: steps.length > 0 ? steps : ['(Document content)']
    });
  }
  
  if (solutions.length === 0) {
    const chunks = chunkText(allText, 800);
    return chunks.map((chunk, idx) => ({
      questionNumber: `Section ${idx + 1}`,
      questionText: `Extracted Content`,
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

export async function processPreviewToSolutions(
  previewData: PreviewData,
  onProgress?: ProgressCallback
): Promise<QuestionSolution[]> {
  onProgress?.({ status: 'Converting to handwriting...', progress: 10, stage: 'analyzing' });
  
  const solutions = parseTextToQuestions(previewData.rawPages);
  
  onProgress?.({ status: 'Complete', progress: 100, stage: 'complete' });
  
  return solutions;
}

export async function processFileToSolutions(
  fileData: string,
  fileType: string,
  onProgress?: ProgressCallback
): Promise<QuestionSolution[]> {
  try {
    const preview = await extractPreviewData(fileData, fileType, onProgress);
    return await processPreviewToSolutions(preview, onProgress);
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  }
}
