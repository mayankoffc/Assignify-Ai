import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import { HANDWRITING_STYLE_PROMPT, LAYOUT_ANALYSIS_PROMPT, DEFAULT_STYLE } from './constants';
import { PaperSheet } from './components/PaperSheet';
import { RefreshCcw, Camera, Eye, PenTool, Minus, Plus, UploadCloud, FileText, Loader, ArrowLeft, Sparkles, Wand2 } from 'lucide-react';
import { AppState, UploadedFile, ProcessedPage, HandwritingStyle, Region } from './types';
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

const analyzeLayoutWithGemini = async (imageBase64: string): Promise<Region[]> => {
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
    const rotation = randomRange(seed, -style.slant * 8, style.slant * 8) + randomRange(seed + 1, -3, 3) * style.messiness;
    const yOffset = randomRange(seed + 2, -0.3, 0.3) * style.messiness * 6;
    const scale = style.size * (1 + randomRange(seed + 3, -0.08, 0.08) * style.messiness);

    // Simulating ink flow thickness variations
    const strokeWidthVariation = randomRange(seed + 4, -0.1, 0.1);

    const charStyle = {
        display: 'inline-block',
        transform: `rotate(${rotation}deg) translateY(${yOffset}px) scale(${scale})`,
        marginRight: `${style.spacing * 0.5 + randomRange(seed + 5, -0.2, 0.2)}px`,
        fontFamily: style.fontFamily,
        fontWeight: (style.weight + strokeWidthVariation) > 1.2 ? 700 : 400,
        color: style.color,
        // Ink blot effect simulation via opacity variation
        opacity: 0.8 + randomRange(seed + 6, 0, 0.2),
        filter: 'contrast(1.3) brightness(0.9)',
        // Slight text shadow for ink bleed look
        textShadow: style.weight > 0.8 ? `0.1px 0.1px 0 ${style.color}cc` : 'none',
    };

    if (char === ' ') return <span style={{ display: 'inline-block', width: `${6 * style.spacing}px` }}></span>;
    if (char === '\n') return <br />;

    return (
        <span style={charStyle} className="select-none relative">
            {char}
        </span>
    );
};

const HandwrittenBlock: React.FC<{ region: Region; originalImage: string; seed: number; style: HandwritingStyle }> = ({ region, originalImage, seed, style }) => {
    // Convert 0-1000 coordinates to percentage
    const top = region.box.ymin / 10;
    const left = region.box.xmin / 10;
    const width = (region.box.xmax - region.box.xmin) / 10;
    const height = (region.box.ymax - region.box.ymin) / 10;

    // --- IMAGE REGION RENDERER ---
    if (region.type === 'image') {
        return (
            <div
                style={{
                    position: 'absolute',
                    top: `${top}%`,
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    // Clip the original image to show only this region
                    backgroundImage: `url(${originalImage})`,
                    backgroundPosition: `${(region.box.xmin / 1000) * 100}% ${(region.box.ymin / 1000) * 100}%`,
                    // We need to adjust background size relative to the container size vs crop size
                    // Actually, simpler to use a wrapper with overflow hidden and absolute img
                }}
                className="overflow-hidden border border-gray-200/20 mix-blend-multiply rotate-1"
            >
                <div style={{
                    position: 'absolute',
                    top: `-${(region.box.ymin / (region.box.ymax - region.box.ymin)) * 100}%`,
                    left: `-${(region.box.xmin / (region.box.xmax - region.box.xmin)) * 100}%`,
                    width: `${(1000 / (region.box.xmax - region.box.xmin)) * 100}%`,
                    height: `${(1000 / (region.box.ymax - region.box.ymin)) * 100}%`,
                }}>
                     <img
                        src={originalImage}
                        style={{ width: '100%', height: '100%', objectFit: 'fill' }}
                        alt="Diagram"
                     />
                </div>
            </div>
        );
    }

    // --- TEXT REGION RENDERER ---
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
                color: style.color,
            }}
            className="handwritten-block"
        >
            {region.content.split('').map((char, i) => (
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
            <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 p-8 rounded-xl shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Assignment Real Generator</h1>
                    <p className="text-gray-400">Transform digital documents into realistic handwritten paper. Preserves diagrams.</p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            <Wand2 size={16} className="inline mr-2 text-purple-400" />
                            Handwriting Style Prompt
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Describe the handwriting style (e.g., 'Messy student writing with blue ballpoint pen', 'Neat cursive with black ink')..."
                            className="w-full h-24 bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none placeholder-gray-500 resize-none transition-all"
                        />
                    </div>

                    <div
                        onDragEnter={() => setDragActive(true)}
                        onDragLeave={() => setDragActive(false)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                        onClick={() => inputRef.current?.click()}
                        className={`border-2 border-dashed h-40 flex flex-col items-center justify-center cursor-pointer transition-all rounded-xl relative overflow-hidden ${dragActive ? 'bg-purple-900/20 border-purple-500' : 'border-gray-600 hover:border-purple-500 hover:bg-gray-800'}`}
                    >
                        <UploadCloud className={`text-gray-400 mb-3 transition-transform ${dragActive ? 'scale-110 text-purple-400' : ''}`} size={40} />
                        <p className="text-sm text-gray-300 font-medium">Click or Drag PDF / Image here</p>
                        <p className="text-xs text-gray-500 mt-1">Supported: PDF, JPG, PNG</p>
                        <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProcessingScreen: React.FC = () => {
    const [status, setStatus] = useState("Initializing AI Models...");

    useEffect(() => {
        const steps = [
            "Initializing AI Models...",
            "Analyzing Document Layout...",
            "Detecting Diagrams & Images...",
            "Generating Handwriting Styles...",
            "Composing Final Pages..."
        ];
        let i = 0;
        const interval = setInterval(() => {
            if (i < steps.length - 1) {
                i++;
                setStatus(steps[i]);
            }
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen w-full bg-black text-white">
            <div className="relative">
                <div className="absolute inset-0 bg-purple-500 blur-xl opacity-20 animate-pulse"></div>
                <Loader className="animate-spin text-purple-500 mb-6 relative z-10" size={64} />
            </div>
            <h2 className="text-2xl font-bold mb-2 tracking-widest uppercase">Processing</h2>
            <p className="text-purple-300 font-mono text-sm border-r-2 border-purple-500 pr-2 animate-pulse">{status}</p>
        </div>
    );
};

const ResultsScreen: React.FC<{ pages: ProcessedPage[], style: HandwritingStyle, onReset: () => void }> = ({ pages, style, onReset }) => {
    const [globalSeed, setGlobalSeed] = useState(Date.now());

    return (
        <div className="min-h-screen bg-[#1a1a1a] flex flex-col items-center py-8">
            <div className="sticky top-4 z-50 flex gap-4 bg-gray-900/90 backdrop-blur px-6 py-3 rounded-full shadow-2xl border border-gray-700 mb-8 no-print text-gray-200">
                <button onClick={onReset} className="flex items-center gap-2 hover:text-white transition-colors">
                    <ArrowLeft size={16} /> New Upload
                </button>
                <div className="w-px bg-gray-700 mx-2"></div>
                <button onClick={() => setGlobalSeed(Date.now())} className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors">
                    <RefreshCcw size={16} /> Regenerate
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-2 text-green-400 hover:text-green-300 transition-colors">
                    <Camera size={16} /> Print / Save
                </button>
            </div>

            <div className="flex flex-col gap-12 w-full items-center print:gap-0 print:w-full">
                {pages.map((page, i) => (
                    <div key={i} className="paper-sheet-container transform hover:scale-[1.01] transition-transform duration-500" style={{ width: '210mm', height: '297mm' }}>
                        <PaperSheet>
                            {/* We are NOT rendering the original background image as a full background anymore.
                                Instead, we render the 'text_regions' as handwriting and 'image_regions' as clips.
                            */}

                            <div className="absolute inset-0 w-full h-full pointer-events-none">
                                {page.regions.map((region, rIdx) => (
                                    <HandwrittenBlock
                                        key={rIdx}
                                        region={region}
                                        originalImage={page.backgroundImage}
                                        seed={globalSeed + i * 1000 + rIdx}
                                        style={style}
                                    />
                                ))}

                                {/* Fallback: If no regions detected (AI error), show a warning or the original image faded?
                                    Let's show a subtle faded original if regions are empty to prevent "blank page" panic.
                                */}
                                {page.regions.length === 0 && (
                                    <div className="absolute inset-0 flex items-center justify-center opacity-50">
                                        <p className="text-red-500 font-bold rotate-45 border-4 border-red-500 p-4 rounded-xl">NO TEXT DETECTED</p>
                                    </div>
                                )}
                            </div>
                        </PaperSheet>
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
                regions: regions
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
