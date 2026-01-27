import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PaperSheet } from './components/PaperSheet';
import { FALLBACK_SOLUTIONS } from './constants';
import { RefreshCcw, Camera, Eye, PenTool, Minus, Plus, UploadCloud, FileText, Loader, ArrowLeft, Sparkles } from 'lucide-react';
import { AppState, UploadedFile, QuestionSolution } from './types';
import { processFileToSolutions, terminateWorker, OCRProgress } from './services/ocrService';
// --- HANDWRITING ENGINE ---

const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const randomRange = (seed: number, min: number, max: number) => {
  return min + seededRandom(seed) * (max - min);
};

interface CharStyle {
  rotation: number;     
  yOffset: number;      
  scale: number;        
  skew: number;        
  opacity: number;      
  marginRight: number;
  strokeWidth: number;
  fontFamily: string;
}

const getFontForType = (char: string, seed: number) => {
  const isNumber = /[0-9]/.test(char);
  const isSymbol = /[=+\-×÷∝]/.test(char);
  
  if (isNumber || isSymbol) {
    const r = seededRandom(seed);
    if (r < 0.6) return 'Caveat'; 
    return 'Shadows Into Light';
  }

  const r = seededRandom(seed);
  if (r < 0.70) return 'Cedarville Cursive'; 
  return 'Caveat'; 
};

const generateCharStyle = (char: string, seed: number, baseThickness: number): CharStyle => {
  const isMath = /[0-9=+\-×÷∝]/.test(char);
  // Refined for "Topper" look - less wild rotation, more consistent baseline
  return {
    rotation: randomRange(seed, -0.8, 0.8),         
    yOffset: randomRange(seed + 1, -0.15, 0.15),      
    scale: randomRange(seed + 2, 0.98, 1.04),       
    skew: isMath ? randomRange(seed + 3, -0.5, 0.5) : -3 + randomRange(seed + 3, -1, 1),  
    opacity: randomRange(seed + 4, 0.88, 0.99),     
    marginRight: randomRange(seed + 5, -0.2, 0.2),  
    strokeWidth: baseThickness + randomRange(seed + 6, -0.05, 0.05),     
    fontFamily: getFontForType(char, seed + 7),
  };
};

const HandwrittenChar: React.FC<{ char: string; seed: number; isMath?: boolean; thickness: number; delayIndex: number }> = ({ char, seed, isMath = false, thickness, delayIndex }) => {
  const style = useMemo(() => generateCharStyle(char, seed, thickness), [char, seed, thickness]);
  
  if (char === ' ') return <span className="inline-block w-2"></span>;

  // Staggered animation delay based on index
  const delay = delayIndex * 25; // slightly faster writing for Topper

  return (
    <span 
      className="inline-block relative select-none"
      style={{
        '--target-opacity': style.opacity,
        '--target-y': `${style.yOffset}px`,
        '--target-scale': style.scale,
        '--target-rot': `${style.rotation}deg`,
        marginRight: `${style.marginRight}px`,
        fontFamily: style.fontFamily,
        fontWeight: isMath || style.strokeWidth > 0.6 ? 500 : 400,
        color: '#0a2472', 
        fontSize: isMath ? '1.1em' : '1em',
        filter: 'contrast(1.2) brightness(0.9)',
        textShadow: style.strokeWidth > 0.5 
          ? `0.1px 0 0 rgba(10, 36, 114, ${style.strokeWidth * 0.8}), -0.1px 0 0 rgba(10, 36, 114, ${style.strokeWidth * 0.8})` 
          : 'none',
        animation: `writeIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
        animationDelay: `${delay}ms`,
        opacity: 0, // Initial state before animation
      } as React.CSSProperties}
    >
      {char}
    </span>
  );
};

const HandwrittenLineSVG: React.FC<{ width: string; seed: number; thickness: number }> = ({ width, seed, thickness }) => {
  const yStart = 2;
  const yEnd = 2 + randomRange(seed, -0.5, 0.5); // straighter lines for topper
  const midPointX = 50 + randomRange(seed + 1, -10, 10);
  const midPointY = 2 + randomRange(seed + 2, -1, 1);

  return (
    <div className="w-full h-[6px] relative overflow-visible" style={{ width: width }}>
      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 5">
         <path 
           d={`M0,${yStart} Q${midPointX},${midPointY} 100,${yEnd}`} 
           stroke="#0a2472" 
           strokeWidth={thickness * 1.5} 
           fill="none" 
           opacity="0.85" 
           strokeLinecap="round"
         />
      </svg>
    </div>
  );
};

// --- PENCIL DRAWING ENGINE ---

const WobbleLine: React.FC<{ x1: number; y1: number; x2: number; y2: number; seed: number; strokeWidth?: number }> = ({ x1, y1, x2, y2, seed, strokeWidth = 1.2 }) => {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const perpAngle = angle + Math.PI / 2;
  const wobbleAmount = randomRange(seed, -3, 3); // Slightly less wobble for neatness
  const cX = midX + Math.cos(perpAngle) * wobbleAmount;
  const cY = midY + Math.sin(perpAngle) * wobbleAmount;
  const overshootStart = randomRange(seed + 1, 2, 4);
  const overshootEnd = randomRange(seed + 2, 2, 4);
  const startX = x1 - Math.cos(angle) * overshootStart;
  const startY = y1 - Math.sin(angle) * overshootStart;
  const endX = x2 + Math.cos(angle) * overshootEnd;
  const endY = y2 + Math.sin(angle) * overshootEnd;

  return (
    <g className="graphite-pencil">
      <path d={`M${startX},${startY} Q${cX},${cY} ${endX},${endY}`} stroke="#2d2d2d" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      <path d={`M${startX + randomRange(seed+3, -1, 1)},${startY + randomRange(seed+4, -1, 1)} Q${cX + randomRange(seed+5, -2, 2)},${cY + randomRange(seed+6, -2, 2)} ${endX},${endY}`} stroke="#2d2d2d" strokeWidth={strokeWidth * 0.5} fill="none" strokeLinecap="round" opacity="0.4" />
    </g>
  );
};

const PencilText: React.FC<{ x: number; y: number; text: string; seed: number; fontSize?: number }> = ({ x, y, text, seed, fontSize = 14 }) => {
  return (
    <text x={x} y={y} fontFamily="'Shadows Into Light', cursive" fontSize={fontSize} fill="#2d2d2d" transform={`rotate(${randomRange(seed, -2, 2)}, ${x}, ${y})`} className="graphite-pencil" style={{ letterSpacing: '0.5px' }}>{text}</text>
  );
};

const PencilArrow: React.FC<{ x1: number; y1: number; x2: number; y2: number; seed: number }> = ({ x1, y1, x2, y2, seed }) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  return (
    <g>
      <WobbleLine x1={x1} y1={y1} x2={x2} y2={y2} seed={seed} />
      <WobbleLine x1={x2} y1={y2} x2={x2 - 12 * Math.cos(angle - Math.PI/6)} y2={y2 - 12 * Math.sin(angle - Math.PI/6)} seed={seed + 10} strokeWidth={1} />
      <WobbleLine x1={x2} y1={y2} x2={x2 - 12 * Math.cos(angle + Math.PI/6)} y2={y2 - 12 * Math.sin(angle + Math.PI/6)} seed={seed + 20} strokeWidth={1} />
    </g>
  )
}

// --- DIAGRAM RENDERER ---
const HandwrittenDiagram: React.FC<{ type: string; seed: number }> = ({ type, seed }) => {
  return (
    <div className="w-full my-6 flex justify-center">
      <div className="relative p-2 w-full flex justify-center" style={{ transform: `rotate(${randomRange(seed, -1.5, 1.5)}deg)` }}>
        <svg width="100%" height="auto" viewBox="0 0 350 180" className="overflow-visible max-w-2xl" style={{ minHeight: "180px" }}>
          <rect x="20" y="20" width="310" height="140" fill="none" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="5,5" className="graphite-pencil" />
          <PencilText x={175} y={90} text={`[Diagram: ${type}]`} seed={seed} fontSize={16} />
          <PencilText x={175} y={115} text="(Refer to textbook)" seed={seed + 1} fontSize={12} />
        </svg>
      </div>
    </div>
  );
};

const HandwrittenStrike: React.FC<{ content: string; seed: number; thickness: number; delayIndex: number }> = ({ content, seed, thickness, delayIndex }) => {
   return (
     <div className="relative inline-block mx-1">
        <span className="opacity-80">
           {content.split('').map((c, i) => <HandwrittenChar key={i} char={c} seed={seed + i} thickness={thickness} delayIndex={delayIndex + i} />)}
        </span>
        <svg className="absolute inset-0 w-[110%] h-full -left-[5%] pointer-events-none overflow-visible">
             <line x1="0" y1="60%" x2="100%" y2="40%" stroke="#0a2472" strokeWidth={thickness * 1.8} opacity="0.9" strokeLinecap="round" transform={`rotate(${randomRange(seed, -2, 2)})`} 
                style={{ animation: `writeIn 0.2s ease forwards`, animationDelay: `${(delayIndex + content.length) * 30}ms`, opacity: 0 }}
             />
        </svg>
     </div>
   );
};

const HandwrittenFraction: React.FC<{ num: string; den: string; seed: number; thickness: number; delayIndex: number }> = ({ num, den, seed, thickness, delayIndex }) => {
  return (
    <div className="inline-flex flex-col items-center align-middle mx-2 -my-4 align-baseline relative top-3">
      <div className="mb-0.5 text-[0.95em]">
        {num.split('').map((c, i) => <HandwrittenChar key={i} char={c} seed={seed + i} isMath thickness={thickness} delayIndex={delayIndex + i} />)}
      </div>
      <HandwrittenLineSVG width="100%" seed={seed + 50} thickness={thickness} />
      <div className="mt-0.5 text-[0.95em]">
        {den.split('').map((c, i) => <HandwrittenChar key={i} char={c} seed={seed + 100 + i} isMath thickness={thickness} delayIndex={delayIndex + num.length + i} />)}
      </div>
    </div>
  );
};

const HandwrittenSqrt: React.FC<{ content: string; seed: number; thickness: number; delayIndex: number }> = ({ content, seed, thickness, delayIndex }) => {
  return (
    <div className="inline-flex items-center mx-1 relative">
      <span className="text-2xl text-[#0a2472] font-[Caveat] relative -top-0.5 mr-0.5" style={{ fontWeight: thickness > 0.6 ? 700 : 400 }}>√</span>
      <div className="flex flex-col">
          <HandwrittenLineSVG width="100%" seed={seed + 99} thickness={thickness} />
          <span className="pt-0.5 pb-1 px-1">
            {content.split(' ').map((word, i) => (
              <span key={i} className="inline-block whitespace-nowrap">
                {word.split('').map((char, j) => <HandwrittenChar key={j} char={char} seed={seed + 200 + i*10 + j} isMath thickness={thickness} delayIndex={delayIndex + i*5 + j} />)}
                <span className="w-1 inline-block"></span>
              </span>
            ))}
          </span>
      </div>
    </div>
  );
};

const HandwrittenLineParser: React.FC<{ text: string; seed: number; thickness: number; globalDelayOffset: number }> = ({ text, seed, thickness, globalDelayOffset }) => {
  const diagramMatch = text.trim().match(/^DIAGRAM\[(.*?)\]$/);

  if (diagramMatch) {
    return <HandwrittenDiagram type={diagramMatch[1]} seed={seed} />;
  }

  const parts = [];
  let lastIndex = 0;
  // Match FRAC, SQRT, STRIKE
  const regex = /(FRAC\[(.*?)\|(.*?)\])|(SQRT\[(.*?)\])|(STRIKE\[(.*?)\])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    if (match[1]) parts.push({ type: 'frac', num: match[2], den: match[3] });
    else if (match[4]) parts.push({ type: 'sqrt', content: match[5] });
    else if (match[6]) parts.push({ type: 'strike', content: match[7] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.substring(lastIndex) });

  let charCounter = 0;

  return (
    <div className="flex flex-wrap items-baseline leading-[2.6rem]">
      {parts.map((part, index) => {
        const partSeed = seed + index * 50;
        const currentDelay = globalDelayOffset + charCounter;
        
        if (part.type === 'frac') {
            const len = (part.num?.length || 0) + (part.den?.length || 0);
            charCounter += len;
            return <HandwrittenFraction key={index} num={part.num!} den={part.den!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        if (part.type === 'sqrt') {
            const len = part.content?.length || 0;
            charCounter += len;
            return <HandwrittenSqrt key={index} content={part.content!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        if (part.type === 'strike') {
            const len = part.content?.length || 0;
            charCounter += len;
            return <HandwrittenStrike key={index} content={part.content!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        
        // Text part
        const words = part.content!.split(' ');
        return words.map((word, i) => {
            const wordEl = (
               <span key={`${index}-${i}`} className="mr-2 inline-block whitespace-nowrap">
                {word.split('').map((char, j) => {
                    return <HandwrittenChar key={j} char={char} seed={partSeed + i * 20 + j} thickness={thickness} delayIndex={globalDelayOffset + charCounter + j} />
                })}
               </span>
            );
            charCounter += word.length + 1; // +1 for space
            return wordEl;
        });
      })}
    </div>
  );
};

// --- HACKER / TERMINAL UI COMPONENTS ---

const UploadScreen: React.FC<{ onUpload: (file: UploadedFile) => void }> = ({ onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
      if (files && files[0]) {
          const file = files[0];
          const reader = new FileReader();
          reader.onload = (e) => {
              if (e.target?.result) {
                  onUpload({
                      name: file.name,
                      type: file.type,
                      data: e.target.result as string
                  });
              }
          };
          reader.readAsDataURL(file);
      }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full px-2 text-green-500 font-mono">
      <div className="w-full max-w-4xl border border-green-500/50 bg-black/80 p-6 rounded-sm shadow-[0_0_20px_rgba(0,255,0,0.2)]">
        <div className="flex justify-between items-center mb-6 border-b border-green-800 pb-2">
           <div className="flex gap-2"><div className="w-3 h-3 rounded-full bg-red-500/50"></div><div className="w-3 h-3 rounded-full bg-yellow-500/50"></div><div className="w-3 h-3 rounded-full bg-green-500/50"></div></div>
           <span className="text-xs uppercase tracking-widest text-green-700">ROOT@SYSTEM:~/ASSIGNIFY</span>
        </div>

        <div className="space-y-6">
           <div className="typewriter">
             <p className="text-xl terminal-text">&gt; INITIALIZING ASSIGNIFY_v4.0...</p>
             <p className="text-sm text-green-700 mt-1">&gt; UNIVERSAL TMA SOLVER READY. UPLOAD YOUR ASSIGNMENT.</p>
           </div>
           
           <div 
             onDragEnter={() => setDragActive(true)}
             onDragLeave={() => setDragActive(false)}
             onDragOver={(e) => e.preventDefault()}
             onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
             onClick={() => inputRef.current?.click()}
             className={`border-2 border-dashed h-48 flex flex-col items-center justify-center cursor-pointer transition-all group ${dragActive ? 'bg-green-900/30 border-green-400' : 'border-green-600/50 bg-green-900/10 hover:bg-green-900/20 hover:border-green-400'}`}
           >
             <UploadCloud className="text-green-500 group-hover:scale-110 transition-transform mb-4" size={48} />
             <p className="text-lg font-bold group-hover:text-white transition-colors">[ UPLOAD TARGET FILE ]</p>
             <p className="text-xs mt-2 text-green-600">SUPPORTS: PDF, JPG, PNG</p>
             <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
           </div>

           <div className="flex justify-between text-xs text-green-800 mt-4">
              <span>STATUS: IDLE</span>
              <span className="animate-pulse">WAITING_FOR_INPUT<span className="terminal-cursor"></span></span>
           </div>
        </div>
      </div>
    </div>
  );
};

const ProcessingScreen: React.FC<{ file: UploadedFile | null, onComplete: (solutions: QuestionSolution[]) => void }> = ({ file, onComplete }) => {
  const [logLines, setLogLines] = useState<string[]>(["> INITIATING UPLOAD SEQUENCE..."]);

  useEffect(() => {
    if (!file) return;

    const handleProgress = (progress: OCRProgress) => {
      setLogLines(prev => [...prev, `> ${progress.status.toUpperCase()} (${progress.progress}%)`]);
    };

    const processFileWithOCR = async () => {
        setLogLines(prev => [...prev, `> FILE RECEIVED: ${file.name}`, "> INITIALIZING TESSERACT OCR ENGINE...", "> EXTRACTING TEXT FROM DOCUMENT..."]);
        
        try {
            const solutions = await processFileToSolutions(file.data, file.type, handleProgress);
            setLogLines(prev => [...prev, "> TEXT EXTRACTION COMPLETE.", "> FORMATTING HANDWRITING VECTORS...", "> COMPILING FINAL RENDER..."]);
            setTimeout(() => {
                onComplete(solutions);
            }, 1000);
        } catch (e) {
            setLogLines(prev => [...prev, `> ERROR: ${e}`, "> REVERTING TO FALLBACK MODE..."]);
            setTimeout(() => {
                onComplete(FALLBACK_SOLUTIONS);
            }, 2000);
        }
    };
    
    const t = setTimeout(processFileWithOCR, 1500);
    return () => {
      clearTimeout(t);
    };
  }, [file, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full px-4 text-green-500 font-mono">
      <div className="w-full max-w-5xl border border-green-500/50 bg-black p-8 shadow-[0_0_30px_rgba(0,255,0,0.15)] relative overflow-hidden">
         <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0)_50%,rgba(0,255,0,0.02)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
         <div className="mb-6 flex items-center gap-4">
            <Loader className="animate-spin text-green-400" size={32} />
            <h2 className="text-2xl font-bold terminal-text">PROCESSING...</h2>
         </div>
         <div className="font-mono text-sm space-y-2 h-64 overflow-y-auto pr-2 border-l-2 border-green-800 pl-4">
            {logLines.map((line, i) => <p key={i} className="opacity-90">{line}</p>)}
            <p className="animate-pulse">_</p>
         </div>
      </div>
    </div>
  );
};

const ResultsScreen: React.FC<{ solutions: QuestionSolution[], onReset: () => void }> = ({ solutions, onReset }) => {
  const [globalSeed, setGlobalSeed] = useState(Date.now()); 
  const [penThickness, setPenThickness] = useState(0.5);
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const regenerate = () => setGlobalSeed(prev => prev + 1);
  const toggleScanner = () => setIsScannerMode(prev => !prev);
  
  const handleDownload = (mode: 'clean' | 'scan') => {
    const originalMode = isScannerMode;
    if (mode === 'clean') setIsScannerMode(false);
    else setIsScannerMode(true);
    setTimeout(() => {
       window.print();
       if (mode === 'clean') setIsScannerMode(originalMode);
    }, 100);
  };

  // Calculate cumulative character counts for smooth staggered animation across lines
  let charAccumulator = 0;

  return (
    <div className="w-full flex flex-col items-center bg-[#e5e5e5] min-h-screen py-8">
       {/* Sticky Header */}
       <div className="sticky top-4 z-40 bg-gray-900/90 backdrop-blur border border-green-500/30 rounded-full px-6 py-3 flex gap-4 items-center shadow-2xl mb-8 no-print animate-in slide-in-from-top-10 font-mono">
          <button onClick={onReset} className="text-green-400 hover:text-green-300 mr-2 border-r border-green-700 pr-4 flex items-center gap-2">
             <ArrowLeft size={16} /> BACK_TO_HOME
          </button>
          
          <button onClick={() => handleDownload('clean')} className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs">
            <FileText size={14} /> EXPORT_CLEAN
          </button>
          
          <button onClick={() => handleDownload('scan')} className="flex items-center gap-2 px-3 py-1 bg-green-900 hover:bg-green-800 text-green-100 rounded text-xs border border-green-700">
             <Camera size={14} /> EXPORT_SCANNED
          </button>
       </div>

      {/* Floating Controls */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 no-print font-sans">
        {showTools && (
          <div className="bg-gray-800 p-4 rounded-xl shadow-xl flex flex-col gap-2 mb-2 border border-gray-600 animate-in slide-in-from-bottom-5">
             <label className="text-white text-xs font-bold uppercase tracking-wider mb-1">Ink Flow</label>
             <div className="flex items-center gap-3">
                <button onClick={() => setPenThickness(p => Math.max(0.3, p - 0.1))} className="p-1 bg-gray-700 rounded text-white"><Minus size={16} /></button>
                <div className="w-24 h-2 bg-gray-600 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${((penThickness - 0.3) / 0.7) * 100}%` }}></div></div>
                <button onClick={() => setPenThickness(p => Math.min(1.0, p + 0.1))} className="p-1 bg-gray-700 rounded text-white"><Plus size={16} /></button>
             </div>
          </div>
        )}

        <div className="flex gap-4">
          <button onClick={() => setShowTools(!showTools)} className={`p-4 rounded-full shadow-2xl transition-all border-2 ${showTools ? 'bg-blue-600 border-blue-300' : 'bg-gray-700 border-gray-500'} text-white hover:scale-105`}><PenTool size={24} /></button>
          <button onClick={toggleScanner} className={`p-4 rounded-full shadow-2xl transition-all border-2 ${isScannerMode ? 'bg-green-600 border-green-300' : 'bg-gray-700 border-gray-500'} text-white hover:scale-105`}>{isScannerMode ? <Eye size={24} /> : <Sparkles size={24} />}</button>
          <button onClick={regenerate} className="bg-gray-800 hover:bg-gray-700 text-green-400 p-4 rounded-full shadow-2xl transition-all border-2 border-green-500"><RefreshCcw size={24} /></button>
        </div>
      </div>

      <div className="w-full flex flex-col gap-12 items-center max-w-[21cm]">
        {solutions.map((sol, index) => {
          const solutionSeed = globalSeed + (index * 9999);
          
          return (
            <div key={sol.id || index} className="paper-sheet-container">
              <PaperSheet isScannerMode={isScannerMode}>
                <div className="ballpoint-ink flex flex-col items-start w-full text-xl paper-content" style={{ fontWeight: penThickness > 0.7 ? 600 : 400 }}>
                  <div className="flex items-baseline mb-6 -ml-4">
                    <span className="text-3xl font-bold font-[Caveat] text-[#0a2472] mr-4 relative">
                      {sol.questionNumber}
                      <div className="absolute -bottom-1 left-0 w-full">
                        <HandwrittenLineSVG width="100%" seed={solutionSeed} thickness={penThickness} />
                      </div>
                    </span>
                    <div className="opacity-95 font-semibold">
                      <HandwrittenLineParser 
                          text={sol.questionText} 
                          seed={solutionSeed} 
                          thickness={penThickness} 
                          globalDelayOffset={charAccumulator} 
                      />
                      {/* Increment accumulator roughly for question text */}
                      <span className="hidden">{charAccumulator += sol.questionText.length}</span>
                    </div>
                  </div>

                  <div className="w-full flex flex-col gap-1">
                    {sol.steps.map((line, lineIdx) => {
                      const isStepLabel = line.trim().startsWith('Step') || line.trim().startsWith('Sol:') || line.trim().startsWith('Given') || line.trim().startsWith('Ans');
                      const isMath = line.includes('=') || line.includes('∝');
                      if (line === "") return <div key={lineIdx} className="h-[1.5rem]"></div>;
                      let indentClass = "";
                      if (line.trim().startsWith('(') || line.trim().startsWith('1.') || line.trim().startsWith('2.')) indentClass = "pl-6";
                      else if (isMath && !isStepLabel) indentClass = "pl-12";
                      
                      const lineComponent = (
                        <div key={lineIdx} className={`relative min-h-[2.6rem] flex items-center ${indentClass}`}>
                          {isStepLabel && (
                              <div className="absolute left-0 bottom-2 w-12">
                                  <HandwrittenLineSVG width="100%" seed={solutionSeed + lineIdx} thickness={penThickness} />
                              </div>
                          )}
                          <HandwrittenLineParser 
                              text={line} 
                              seed={solutionSeed + 500 + (lineIdx * 77)} 
                              thickness={penThickness} 
                              globalDelayOffset={charAccumulator} 
                          />
                        </div>
                      );
                      
                      charAccumulator += line.length + 5; // Add some buffer for pause between lines
                      return lineComponent;
                    })}
                  </div>
                </div>
              </PaperSheet>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('upload');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [solutions, setSolutions] = useState<QuestionSolution[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    return () => {
      terminateWorker();
    };
  }, []);

  if (!isClient) return null;

  return (
    <div className={`min-h-screen ${appState === 'results' ? 'bg-[#e5e5e5]' : 'bg-[#000]'} flex flex-col items-center`}>
      {appState === 'upload' && (
          <UploadScreen onUpload={(file) => {
              setUploadedFile(file);
              setAppState('processing');
          }} />
      )}
      {appState === 'processing' && (
          <ProcessingScreen file={uploadedFile} onComplete={(sols) => {
              setSolutions(sols);
              setAppState('results');
          }} />
      )}
      {appState === 'results' && (
          <ResultsScreen solutions={solutions} onReset={() => {
              setUploadedFile(null);
              setSolutions([]);
              setAppState('upload');
          }} />
      )}
    </div>
  );
};

export default App;