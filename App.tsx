import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import { HANDWRITING_STYLE_PROMPT, LAYOUT_ANALYSIS_PROMPT, DEFAULT_STYLE } from './constants';
import { RefreshCcw, Camera, Eye, PenTool, Minus, Plus, UploadCloud, FileText, Loader, ArrowLeft, Sparkles, Wand2 } from 'lucide-react';
import { AppState, UploadedFile, ProcessedPage, HandwritingStyle, TextRegion } from './types';
import { GoogleGenAI } from "@google/genai";

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- AI INTEGRATION ---

const analyzeStyleWithGemini = async (userPrompt: string): Promise<HandwritingStyle> => {
    try {
        if (!process.env.API_KEY || !userPrompt.trim()) return DEFAULT_STYLE;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [{ text: HANDWRITING_STYLE_PROMPT + "\n\nUser Description: " + userPrompt }]
            },
            config: { responseMimeType: "application/json" }
        });

        const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
        if (text) {
            return { ...DEFAULT_STYLE, ...JSON.parse(text) };
        }
    } catch (e) {
        console.error("Style Analysis Error:", e);
    }
    return DEFAULT_STYLE;
};

const analyzeLayoutWithGemini = async (imageBase64: string): Promise<TextRegion[]> => {
    try {
        if (!process.env.API_KEY) return [];

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: LAYOUT_ANALYSIS_PROMPT },
                    { inlineData: { mimeType: "image/jpeg", data: imageBase64.split(',')[1] } }
                ]
            },
            config: { responseMimeType: "application/json" }
        });

        const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
        if (text) {
            const data = JSON.parse(text);
            return data.regions || [];
        }
    } catch (e) {
        console.error("Layout Analysis Error:", e);
    }
    return [];
};

const convertPdfToImages = async (fileData: string): Promise<string[]> => {
    const images: string[] = [];
    try {
        const base64Data = fileData.split(',')[1];
        const pdfBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const pdf = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 }); // Good quality for OCR
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.8));
            }
        }
    } catch (e) {
        console.error("PDF Conversion Error:", e);
    }
    return images;
};

// --- HANDWRITING ENGINE ---

const seededRandom = (seed: number) => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
};

const randomRange = (seed: number, min: number, max: number) => {
    return min + seededRandom(seed) * (max - min);
};

const HandwrittenChar: React.FC<{ char: string; seed: number; style: HandwritingStyle; index: number }> = ({ char, seed, style, index }) => {
    const isMath = /[0-9=+\-×÷∝]/.test(char);

    // Style variations based on HandwritingStyle
    const rotation = randomRange(seed, -style.slant * 5, style.slant * 5) + randomRange(seed + 1, -2, 2) * style.messiness;
    const yOffset = randomRange(seed + 2, -0.2, 0.2) * style.messiness * 5;
    const scale = style.size * (1 + randomRange(seed + 3, -0.05, 0.05) * style.messiness);

    const charStyle = {
        display: 'inline-block',
        transform: `rotate(${rotation}deg) translateY(${yOffset}px) scale(${scale})`,
        marginRight: `${style.spacing * 0.5 + randomRange(seed + 4, -0.2, 0.2)}px`,
        fontFamily: style.fontFamily,
        fontWeight: style.weight > 1.2 ? 700 : 400,
        color: style.color,
        opacity: 0.85 + randomRange(seed + 5, 0, 0.15),
        filter: 'contrast(1.2) brightness(0.9)',
        textShadow: style.weight > 1.2 ? `0.2px 0 0 ${style.color}` : 'none',
    };

    if (char === ' ') return <span style={{ display: 'inline-block', width: `${6 * style.spacing}px` }}></span>;
    if (char === '\n') return <br />;

    return (
        <span style={charStyle} className="select-none">
            {char}
        </span>
    );
};

const HandwrittenBlock: React.FC<{ text: string; box: any; seed: number; style: HandwritingStyle }> = ({ text, box, seed, style }) => {
    // Convert 0-1000 coordinates to percentage
    const top = box.ymin / 10;
    const left = box.xmin / 10;
    const width = (box.xmax - box.xmin) / 10;
    const height = (box.ymax - box.ymin) / 10;

    // Estimate font size based on box height and line count (rough approx)
    const lines = text.split('\n');
    // const estimatedLineHeight = height / lines.length;
    // const fontSize = Math.min(Math.max(estimatedLineHeight * 0.7, 12), 24); // Clamp font size

    // Using a fixed relative size for now, user can adjust scaling globally if needed,
    // but better to let it flow naturally or use a standard size.
    // Let's use a standard size modified by the style.size
    const fontSize = 16 * style.size;

    return (
        <div
            style={{
                position: 'absolute',
                top: `${top}%`,
                left: `${left}%`,
                width: `${width}%`,
                minHeight: `${height}%`,
                fontSize: `${fontSize}px`,
                lineHeight: `${1.5 * style.spacing}`,
                zIndex: 10,
                // Background to cover original text.
                // Using a slight blur and white/off-white background
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                // padding: '2px',
                borderRadius: '2px',
                overflow: 'hidden' // Clip if it gets too wild? Or visible?
            }}
            className="handwritten-block"
        >
            {text.split('').map((char, i) => (
                <HandwrittenChar key={i} char={char} seed={seed + i} style={style} index={i} />
            ))}
        </div>
    );
};

// --- UI COMPONENTS ---

const UploadScreen: React.FC<{ onStart: (file: UploadedFile, prompt: string) => void }> = ({ onStart }) => {
    const [prompt, setPrompt] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = (files: FileList | null) => {
        if (files && files[0]) {
            const file = files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target?.result) {
                    onStart({
                        name: file.name,
                        type: file.type,
                        data: e.target.result as string
                    }, prompt);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[90vh] w-full px-4 font-mono text-gray-200">
            <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 p-8 rounded-xl shadow-2xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2">Assignment Real Generator</h1>
                    <p className="text-gray-400">Transform digital documents into realistic handwriting. Preserves layout & images.</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            <Wand2 size={16} className="inline mr-2" />
                            Handwriting Style Prompt
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe the handwriting style (e.g., 'Messy student writing with blue ballpoint pen', 'Neat cursive with black ink')..."
                            className="w-full h-24 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none placeholder-gray-500 resize-none"
                        />
                    </div>

                    <div
                        onDragEnter={() => setDragActive(true)}
                        onDragLeave={() => setDragActive(false)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                        onClick={() => inputRef.current?.click()}
                        className={`border-2 border-dashed h-40 flex flex-col items-center justify-center cursor-pointer transition-all rounded-xl ${dragActive ? 'bg-blue-900/20 border-blue-500' : 'border-gray-600 hover:border-blue-500 hover:bg-gray-800'}`}
                    >
                        <UploadCloud className="text-gray-400 mb-3" size={40} />
                        <p className="text-sm text-gray-300">Click or Drag PDF / Image here</p>
                        <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProcessingScreen: React.FC = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-black text-white">
            <Loader className="animate-spin text-blue-500 mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">Analyzing Document...</h2>
            <p className="text-gray-400">Parsing text and layout structure. This may take a moment.</p>
        </div>
    );
};

const ResultsScreen: React.FC<{ pages: ProcessedPage[], style: HandwritingStyle, onReset: () => void }> = ({ pages, style, onReset }) => {
    const [globalSeed, setGlobalSeed] = useState(Date.now());
    
    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8">
            <div className="sticky top-4 z-50 flex gap-4 bg-white/80 backdrop-blur px-6 py-3 rounded-full shadow-lg border border-gray-200 mb-8 no-print">
                <button onClick={onReset} className="flex items-center gap-2 text-gray-700 hover:text-black">
                    <ArrowLeft size={16} /> New Upload
                </button>
                <div className="w-px bg-gray-300 mx-2"></div>
                <button onClick={() => setGlobalSeed(Date.now())} className="flex items-center gap-2 text-blue-600 hover:text-blue-800">
                    <RefreshCcw size={16} /> Regenerate
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-2 text-green-600 hover:text-green-800">
                    <Camera size={16} /> Print / Save PDF
                </button>
            </div>

            <div className="flex flex-col gap-8 w-full items-center print:gap-0 print:w-full">
                {pages.map((page, i) => (
                    <div key={i} className="relative bg-white shadow-2xl print:shadow-none print:break-after-page overflow-hidden" style={{ width: '210mm', height: '297mm' }}>
                        {/* Background Image (Original Page) */}
                        <img
                            src={page.backgroundImage}
                            className="absolute inset-0 w-full h-full object-contain pointer-events-none opacity-100"
                            alt={`Page ${page.pageNumber}`}
                        />

                        {/* Overlay Text Regions */}
                        <div className="absolute inset-0 w-full h-full pointer-events-none">
                            {page.textRegions.map((region, rIdx) => (
                                <HandwrittenBlock
                                    key={rIdx}
                                    text={region.text}
                                    box={region.box}
                                    seed={globalSeed + i * 1000 + rIdx}
                                    style={style}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const [appState, setAppState] = useState<AppState>('upload');
    const [pages, setPages] = useState<ProcessedPage[]>([]);
    const [currentStyle, setCurrentStyle] = useState<HandwritingStyle>(DEFAULT_STYLE);

    const handleStart = async (file: UploadedFile, prompt: string) => {
        setAppState('processing');

        // 1. Analyze Style
        const style = await analyzeStyleWithGemini(prompt);
        setCurrentStyle(style);

        // 2. Prepare Images
        let images: string[] = [];
        if (file.type === 'application/pdf') {
            images = await convertPdfToImages(file.data);
        } else {
            images = [file.data];
        }

        // 3. Process Pages (Layout Analysis)
        const processedPages: ProcessedPage[] = [];
        for (let i = 0; i < images.length; i++) {
            const regions = await analyzeLayoutWithGemini(images[i]);
            processedPages.push({
                pageNumber: i + 1,
                backgroundImage: images[i],
                textRegions: regions
            });
        }

        setPages(processedPages);
        setAppState('results');
    };

    return (
        <div className="font-sans">
            {appState === 'upload' && <UploadScreen onStart={handleStart} />}
            {appState === 'processing' && <ProcessingScreen />}
            {appState === 'results' && <ResultsScreen pages={pages} style={currentStyle} onReset={() => setAppState('upload')} />}
        </div>
    );
};

export default App;
