import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PaperSheet } from './components/PaperSheet';
import { FALLBACK_SOLUTIONS } from './constants';
import { RefreshCcw, Camera, Eye, PenTool, Minus, Plus, UploadCloud, FileText, Loader, ArrowLeft, Sparkles, ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut, Keyboard, X, Hash } from 'lucide-react';
import { AppState, UploadedFile, QuestionSolution } from './types';
import { processFileToSolutions, terminateWorker, OCRProgress } from './services/ocrService';

// --- MATRIX RAIN BACKGROUND EFFECT ---
const MatrixRain: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(1);
    
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#0f0';
      ctx.font = `${fontSize}px monospace`;
      
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        
        ctx.fillStyle = `rgba(0, 255, 0, ${Math.random() * 0.5 + 0.5})`;
        ctx.fillText(text, x, y);
        
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };
    
    const interval = setInterval(draw, 33);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);
  
  return <canvas ref={canvasRef} className="absolute inset-0 opacity-20 pointer-events-none z-0" />;
};

// --- SCANLINE OVERLAY ---
const ScanlineOverlay: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
    <div className="absolute inset-0 bg-[linear-gradient(0deg,transparent_50%,rgba(0,255,0,0.02)_50%)] bg-[length:100%_4px]" />
    <div className="absolute inset-0 animate-scanline bg-gradient-to-b from-transparent via-green-500/5 to-transparent" style={{ height: '10%' }} />
  </div>
);

// --- GLOWING BORDER COMPONENT ---
const GlowBorder: React.FC<{ active?: boolean; children: React.ReactNode; className?: string }> = ({ active, children, className = '' }) => (
  <div className={`relative ${className}`}>
    {active && (
      <div className="absolute -inset-1 bg-gradient-to-r from-green-600 via-green-400 to-green-600 rounded-lg blur opacity-30 animate-pulse" />
    )}
    <div className="relative">{children}</div>
  </div>
);

// --- KEYBOARD SHORTCUTS MODAL ---
const KeyboardShortcuts: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center animate-fadeIn" onClick={onClose}>
    <div className="bg-gray-900 border border-green-500/50 rounded-lg p-6 max-w-md w-full mx-4 shadow-[0_0_50px_rgba(0,255,0,0.2)]" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4 border-b border-green-800 pb-3">
        <h3 className="text-green-400 font-bold text-lg flex items-center gap-2">
          <Keyboard size={20} /> KEYBOARD SHORTCUTS
        </h3>
        <button onClick={onClose} className="text-gray-500 hover:text-green-400 transition-colors">
          <X size={20} />
        </button>
      </div>
      <div className="space-y-3 text-sm font-mono">
        <div className="flex justify-between text-gray-300">
          <span>Navigate pages</span>
          <span className="text-green-400">← / →</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Zoom in/out</span>
          <span className="text-green-400">+ / -</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Toggle search</span>
          <span className="text-green-400">Ctrl + F</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Toggle scan mode</span>
          <span className="text-green-400">S</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Regenerate</span>
          <span className="text-green-400">R</span>
        </div>
        <div className="flex justify-between text-gray-300">
          <span>Go back</span>
          <span className="text-green-400">ESC</span>
        </div>
      </div>
    </div>
  </div>
);

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

  const delay = delayIndex * 25;

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
        opacity: 0,
      } as React.CSSProperties}
    >
      {char}
    </span>
  );
};

const HandwrittenLineSVG: React.FC<{ width: string; seed: number; thickness: number }> = ({ width, seed, thickness }) => {
  const yStart = 2;
  const yEnd = 2 + randomRange(seed, -0.5, 0.5);
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
  const wobbleAmount = randomRange(seed, -3, 3);
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

  const parts: { type: string; content?: string; num?: string; den?: string }[] = [];
  let lastIndex = 0;
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
        
        const words = part.content!.split(' ');
        return words.map((word, i) => {
            const wordEl = (
               <span key={`${index}-${i}`} className="mr-2 inline-block whitespace-nowrap">
                {word.split('').map((char, j) => {
                    return <HandwrittenChar key={j} char={char} seed={partSeed + i * 20 + j} thickness={thickness} delayIndex={globalDelayOffset + charCounter + j} />
                })}
               </span>
            );
            charCounter += word.length + 1;
            return wordEl;
        });
      })}
    </div>
  );
};

// --- BOOT SEQUENCE MESSAGES ---
const BOOT_MESSAGES = [
  { text: 'BIOS v4.2.1 - POST CHECK...', delay: 0 },
  { text: 'CPU: NEURAL_CORE_X86 @ 4.2GHz... OK', delay: 300 },
  { text: 'RAM: 32GB DDR5 QUANTUM... OK', delay: 500 },
  { text: 'GPU: MATRIX_RTX_9090... OK', delay: 700 },
  { text: 'LOADING KERNEL MODULES...', delay: 900 },
  { text: '├── ocr_engine.ko... LOADED', delay: 1100 },
  { text: '├── handwriting_render.ko... LOADED', delay: 1300 },
  { text: '├── neural_network.ko... LOADED', delay: 1500 },
  { text: '└── crypto_hash.ko... LOADED', delay: 1700 },
  { text: '', delay: 1900 },
  { text: '╔══════════════════════════════════════════╗', delay: 2000 },
  { text: '║     ASSIGNIFY v4.0 - UNIVERSAL SOLVER    ║', delay: 2100 },
  { text: '║     (C) 2025 NEURAL SYSTEMS INC.         ║', delay: 2200 },
  { text: '╚══════════════════════════════════════════╝', delay: 2300 },
  { text: '', delay: 2400 },
  { text: 'SYSTEM READY. AWAITING INPUT...', delay: 2500 },
];

// --- ENHANCED UPLOAD SCREEN ---
const UploadScreen: React.FC<{ onUpload: (file: UploadedFile) => void }> = ({ onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number; type: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    BOOT_MESSAGES.forEach((msg, index) => {
      setTimeout(() => {
        setVisibleLines(index + 1);
        if (index === BOOT_MESSAGES.length - 1) {
          setTimeout(() => setBootComplete(true), 500);
        }
      }, msg.delay);
    });
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      setSelectedFile({
        name: file.name,
        size: file.size,
        type: file.type
      });
      setIsScanning(true);
      
      setTimeout(() => {
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
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full px-4 text-green-500 font-mono relative overflow-hidden">
      <MatrixRain />
      <ScanlineOverlay />
      
      <div className="w-full max-w-4xl border border-green-500/50 bg-black/90 rounded-lg shadow-[0_0_50px_rgba(0,255,0,0.15)] z-10 overflow-hidden animate-fadeIn">
        <div className="flex justify-between items-center px-4 py-3 border-b border-green-800 bg-green-900/20">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors cursor-pointer" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs uppercase tracking-widest text-green-600">
              root@assignify:~/{bootComplete ? 'READY' : 'BOOTING'}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="h-64 overflow-hidden font-mono text-sm">
            {BOOT_MESSAGES.slice(0, visibleLines).map((msg, i) => (
              <div key={i} className="leading-relaxed">
                {msg.text ? (
                  <span className={`${msg.text.includes('OK') ? 'text-green-400' : msg.text.includes('LOADED') ? 'text-green-500' : msg.text.startsWith('╔') || msg.text.startsWith('║') || msg.text.startsWith('╚') ? 'text-green-300 font-bold' : 'text-green-600'}`}>
                    {msg.text}
                  </span>
                ) : <br />}
              </div>
            ))}
            {!bootComplete && <span className="terminal-cursor ml-1" />}
          </div>

          {bootComplete && (
            <div className="space-y-6 animate-slideUp">
              <GlowBorder active={dragActive}>
                <div 
                  onDragEnter={() => setDragActive(true)}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                  onClick={() => !selectedFile && inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden ${
                    isScanning 
                      ? 'bg-green-900/30 border-green-400' 
                      : dragActive 
                        ? 'bg-green-900/40 border-green-300 shadow-[inset_0_0_30px_rgba(0,255,0,0.2)]' 
                        : 'border-green-600/50 bg-green-900/10 hover:bg-green-900/20 hover:border-green-400'
                  }`}
                >
                  {isScanning && (
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-1 bg-green-400 animate-scanVertical" />
                      <div className="absolute inset-0 bg-gradient-to-b from-green-500/20 to-transparent animate-scanPulse" />
                    </div>
                  )}
                  
                  {selectedFile ? (
                    <div className="text-center z-10 animate-fadeIn">
                      <FileText className="mx-auto mb-3 text-green-400" size={48} />
                      <p className="text-lg font-bold text-green-300">{selectedFile.name}</p>
                      <div className="flex gap-4 justify-center mt-2 text-xs text-green-600">
                        <span>SIZE: {formatFileSize(selectedFile.size)}</span>
                        <span>TYPE: {selectedFile.type.split('/')[1]?.toUpperCase() || 'UNKNOWN'}</span>
                      </div>
                      {isScanning && (
                        <p className="mt-4 text-green-400 animate-pulse flex items-center justify-center gap-2">
                          <Loader className="animate-spin" size={16} />
                          SCANNING DOCUMENT...
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-center z-10">
                      <UploadCloud className={`mx-auto mb-4 transition-all duration-300 ${dragActive ? 'text-green-300 scale-125' : 'text-green-500'}`} size={56} />
                      <p className="text-xl font-bold transition-colors">{dragActive ? '[ DROP FILE HERE ]' : '[ UPLOAD TARGET FILE ]'}</p>
                      <p className="text-xs mt-3 text-green-700">DRAG & DROP OR CLICK TO BROWSE</p>
                      <p className="text-xs mt-1 text-green-800">SUPPORTS: PDF, JPG, PNG, WEBP</p>
                    </div>
                  )}
                  <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
                </div>
              </GlowBorder>

              <div className="flex justify-between text-xs text-green-700 border-t border-green-900 pt-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${selectedFile ? 'bg-yellow-500' : 'bg-green-500'} animate-pulse`} />
                  <span>STATUS: {selectedFile ? (isScanning ? 'SCANNING' : 'FILE_LOADED') : 'IDLE'}</span>
                </div>
                <span className="flex items-center gap-1">
                  <Keyboard size={12} />
                  PRESS ANY KEY TO START<span className="terminal-cursor" />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- ENHANCED PROCESSING SCREEN ---
const ProcessingScreen: React.FC<{ file: UploadedFile | null, onComplete: (solutions: QuestionSolution[]) => void }> = ({ file, onComplete }) => {
  const [logLines, setLogLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('INITIALIZING');
  const [extractedPreview, setExtractedPreview] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logLines]);

  useEffect(() => {
    if (!file) return;

    const addLog = (msg: string) => {
      setLogLines(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    const handleProgress = (ocrProgress: OCRProgress) => {
      setProgress(ocrProgress.progress);
      setCurrentStatus(ocrProgress.status.toUpperCase());
      addLog(`${ocrProgress.status} - ${ocrProgress.progress}%`);
      
      if (ocrProgress.status.toLowerCase().includes('recognizing')) {
        const fakeText = 'Processing text content...';
        setExtractedPreview(prev => [...prev.slice(-3), fakeText]);
      }
    };

    const processFileWithOCR = async () => {
      addLog('INITIATING SECURE UPLOAD SEQUENCE...');
      setProgress(5);
      
      await new Promise(r => setTimeout(r, 500));
      addLog(`FILE RECEIVED: ${file.name}`);
      setProgress(10);
      
      await new Promise(r => setTimeout(r, 300));
      addLog('DECRYPTING FILE HEADERS...');
      setProgress(15);
      
      await new Promise(r => setTimeout(r, 300));
      addLog('INITIALIZING TESSERACT OCR ENGINE v5.0...');
      setCurrentStatus('LOADING OCR');
      setProgress(20);
      
      await new Promise(r => setTimeout(r, 500));
      addLog('LOADING TRAINED DATA MODELS...');
      setProgress(25);
      
      await new Promise(r => setTimeout(r, 300));
      addLog('STARTING TEXT EXTRACTION PIPELINE...');
      setCurrentStatus('EXTRACTING');
      
      try {
        const solutions = await processFileToSolutions(file.data, file.type, handleProgress);
        
        setProgress(85);
        addLog('TEXT EXTRACTION COMPLETE');
        setCurrentStatus('RENDERING');
        
        await new Promise(r => setTimeout(r, 400));
        addLog('FORMATTING HANDWRITING VECTORS...');
        setProgress(90);
        
        await new Promise(r => setTimeout(r, 400));
        addLog('APPLYING STYLE TRANSFORMATIONS...');
        setProgress(95);
        
        await new Promise(r => setTimeout(r, 300));
        addLog('COMPILING FINAL RENDER...');
        setProgress(100);
        setCurrentStatus('COMPLETE');
        
        await new Promise(r => setTimeout(r, 500));
        addLog('✓ PROCESSING COMPLETE - REDIRECTING...');
        
        setTimeout(() => onComplete(solutions), 800);
      } catch (e) {
        addLog(`ERROR: ${e}`);
        addLog('REVERTING TO FALLBACK MODE...');
        setCurrentStatus('FALLBACK');
        setTimeout(() => onComplete(FALLBACK_SOLUTIONS), 1500);
      }
    };
    
    const t = setTimeout(processFileWithOCR, 500);
    return () => clearTimeout(t);
  }, [file, onComplete]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full px-4 text-green-500 font-mono relative overflow-hidden">
      <MatrixRain />
      <ScanlineOverlay />
      
      <div className="w-full max-w-5xl z-10">
        <div className="border border-green-500/50 bg-black/95 rounded-lg shadow-[0_0_60px_rgba(0,255,0,0.2)] overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 border-b border-green-800 bg-green-900/20">
            <div className="flex items-center gap-3">
              <Loader className="animate-spin text-green-400" size={20} />
              <span className="font-bold text-green-300">PROCESSING: {file?.name || 'UNKNOWN'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-green-600">{currentStatus}</span>
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-green-600">PROGRESS</span>
                <span className="text-green-400 font-bold">{progress}%</span>
              </div>
              <div className="h-4 bg-green-900/30 rounded-full overflow-hidden border border-green-800">
                <div 
                  className="h-full bg-gradient-to-r from-green-600 via-green-400 to-green-500 transition-all duration-300 relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between text-xs text-green-800">
                <span>0%</span>
                <span className="text-green-600">{currentStatus}</span>
                <span>100%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs text-green-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Hash size={12} />
                  SYSTEM LOG
                </div>
                <div 
                  ref={logRef}
                  className="h-48 overflow-y-auto bg-black/50 rounded border border-green-900 p-3 text-xs space-y-1"
                >
                  {logLines.map((line, i) => (
                    <div key={i} className={`${line.includes('ERROR') ? 'text-red-400' : line.includes('✓') ? 'text-green-300' : 'text-green-600'}`}>
                      {line}
                    </div>
                  ))}
                  <span className="animate-pulse">_</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-green-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Eye size={12} />
                  EXTRACTED TEXT PREVIEW
                </div>
                <div className="h-48 overflow-y-auto bg-black/50 rounded border border-green-900 p-3 text-xs">
                  {extractedPreview.length > 0 ? (
                    extractedPreview.map((text, i) => (
                      <p key={i} className="text-green-500/70 mb-1 animate-fadeIn">{text}</p>
                    ))
                  ) : (
                    <p className="text-green-800 italic">Waiting for text extraction...</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-green-900 pt-4 text-green-700">
              <div className="flex gap-4">
                <span>CPU: 78%</span>
                <span>MEM: 2.4GB</span>
                <span>THREADS: 8</span>
              </div>
              <span className="animate-pulse">DO NOT CLOSE THIS WINDOW</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- ENHANCED RESULTS SCREEN ---
const ResultsScreen: React.FC<{ solutions: QuestionSolution[], onReset: () => void }> = ({ solutions, onReset }) => {
  const [globalSeed, setGlobalSeed] = useState(Date.now()); 
  const [penThickness, setPenThickness] = useState(0.5);
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const regenerate = () => setGlobalSeed(prev => prev + 1);
  const toggleScanner = () => setIsScannerMode(prev => !prev);

  const goToPage = useCallback((page: number) => {
    const targetPage = Math.max(0, Math.min(page, solutions.length - 1));
    setCurrentPage(targetPage);
    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [solutions.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case 'ArrowLeft':
          goToPage(currentPage - 1);
          break;
        case 'ArrowRight':
          goToPage(currentPage + 1);
          break;
        case '+':
        case '=':
          setZoom(z => Math.min(150, z + 10));
          break;
        case '-':
          setZoom(z => Math.max(50, z - 10));
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) toggleScanner();
          break;
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) regenerate();
          break;
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setShowSearch(s => !s);
          }
          break;
        case 'Escape':
          if (showSearch) setShowSearch(false);
          else if (showShortcuts) setShowShortcuts(false);
          else onReset();
          break;
        case '?':
          setShowShortcuts(s => !s);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, goToPage, showSearch, showShortcuts, onReset]);
  
  const handleDownload = (mode: 'clean' | 'scan') => {
    const originalMode = isScannerMode;
    if (mode === 'clean') setIsScannerMode(false);
    else setIsScannerMode(true);
    setTimeout(() => {
      window.print();
      if (mode === 'clean') setIsScannerMode(originalMode);
    }, 100);
  };

  const filteredSolutions = useMemo(() => {
    if (!searchQuery.trim()) return solutions;
    const query = searchQuery.toLowerCase();
    return solutions.filter(sol => 
      sol.questionText.toLowerCase().includes(query) ||
      sol.steps.some(step => step.toLowerCase().includes(query))
    );
  }, [solutions, searchQuery]);

  let charAccumulator = 0;

  return (
    <div className="w-full flex flex-col items-center bg-[#e5e5e5] min-h-screen">
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
      
      <div className="sticky top-0 z-40 w-full bg-gray-900/95 backdrop-blur border-b border-green-500/30 shadow-2xl no-print">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <button onClick={onReset} className="text-green-400 hover:text-green-300 flex items-center gap-2 font-mono text-sm transition-colors">
            <ArrowLeft size={18} /> BACK
          </button>

          <div className="flex items-center gap-2 font-mono">
            <button 
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="bg-gray-800 rounded px-3 py-1.5 flex items-center gap-2">
              <span className="text-green-400 text-sm">PAGE</span>
              <select 
                value={currentPage}
                onChange={(e) => goToPage(Number(e.target.value))}
                className="bg-transparent text-green-300 font-bold text-sm outline-none cursor-pointer"
              >
                {solutions.map((_, i) => (
                  <option key={i} value={i} className="bg-gray-900">{i + 1}</option>
                ))}
              </select>
              <span className="text-green-600 text-sm">/ {solutions.length}</span>
            </div>
            <button 
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === solutions.length - 1}
              className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {showSearch && (
              <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-1.5 animate-slideIn">
                <Search size={14} className="text-green-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search text..."
                  className="bg-transparent text-green-400 text-sm outline-none w-40 placeholder:text-green-800"
                  autoFocus
                />
                {searchQuery && (
                  <span className="text-xs text-green-600">{filteredSolutions.length} found</span>
                )}
              </div>
            )}
            
            <button
              onClick={() => setShowSearch(s => !s)}
              className={`p-2 rounded transition-all ${showSearch ? 'bg-green-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-green-400'}`}
            >
              <Search size={18} />
            </button>

            <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-1">
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1 text-green-400 hover:text-green-300">
                <ZoomOut size={16} />
              </button>
              <span className="text-xs text-green-500 w-10 text-center font-mono">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1 text-green-400 hover:text-green-300">
                <ZoomIn size={16} />
              </button>
            </div>

            <button onClick={() => handleDownload('clean')} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs font-mono transition-colors">
              <FileText size={14} /> CLEAN
            </button>
            
            <button onClick={() => handleDownload('scan')} className="flex items-center gap-2 px-3 py-1.5 bg-green-900 hover:bg-green-800 text-green-100 rounded text-xs font-mono border border-green-700 transition-colors">
              <Camera size={14} /> SCANNED
            </button>

            <button
              onClick={() => setShowShortcuts(true)}
              className="p-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-green-400 transition-all"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 no-print font-sans">
        {showTools && (
          <div className="bg-gray-800/95 backdrop-blur p-4 rounded-xl shadow-xl flex flex-col gap-3 mb-2 border border-green-500/30 animate-slideUp">
            <label className="text-green-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <PenTool size={12} /> Ink Flow
            </label>
            <div className="flex items-center gap-3">
              <button onClick={() => setPenThickness(p => Math.max(0.3, p - 0.1))} className="p-1.5 bg-gray-700 rounded text-green-400 hover:bg-gray-600 transition-colors">
                <Minus size={14} />
              </button>
              <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all" style={{ width: `${((penThickness - 0.3) / 0.7) * 100}%` }} />
              </div>
              <button onClick={() => setPenThickness(p => Math.min(1.0, p + 0.1))} className="p-1.5 bg-gray-700 rounded text-green-400 hover:bg-gray-600 transition-colors">
                <Plus size={14} />
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button 
            onClick={() => setShowTools(!showTools)} 
            className={`p-4 rounded-full shadow-2xl transition-all border-2 hover:scale-110 ${showTools ? 'bg-green-600 border-green-300' : 'bg-gray-800 border-gray-600 hover:border-green-500'} text-white`}
          >
            <PenTool size={22} />
          </button>
          <button 
            onClick={toggleScanner} 
            className={`p-4 rounded-full shadow-2xl transition-all border-2 hover:scale-110 ${isScannerMode ? 'bg-green-600 border-green-300' : 'bg-gray-800 border-gray-600 hover:border-green-500'} text-white`}
          >
            {isScannerMode ? <Eye size={22} /> : <Sparkles size={22} />}
          </button>
          <button 
            onClick={regenerate} 
            className="bg-gray-800 hover:bg-gray-700 text-green-400 p-4 rounded-full shadow-2xl transition-all border-2 border-green-600 hover:border-green-400 hover:scale-110"
          >
            <RefreshCcw size={22} />
          </button>
        </div>
      </div>

      <div 
        className="w-full flex flex-col gap-12 items-center max-w-[21cm] py-8 transition-transform origin-top"
        style={{ transform: `scale(${zoom / 100})` }}
      >
        {filteredSolutions.map((sol, index) => {
          const solutionSeed = globalSeed + (index * 9999);
          
          return (
            <div 
              key={sol.id || index} 
              ref={el => { if (el) pageRefs.current[index] = el; }}
              className="paper-sheet-container scroll-mt-24"
            >
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
                      
                      charAccumulator += line.length + 5;
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
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    setIsClient(true);
    return () => {
      terminateWorker();
    };
  }, []);

  const transitionTo = (newState: AppState) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setAppState(newState);
      setIsTransitioning(false);
    }, 300);
  };

  if (!isClient) return null;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${appState === 'results' ? 'bg-[#e5e5e5]' : 'bg-[#000]'} flex flex-col items-center`}>
      <div className={`w-full transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
        {appState === 'upload' && (
          <UploadScreen onUpload={(file) => {
            setUploadedFile(file);
            transitionTo('processing');
          }} />
        )}
        {appState === 'processing' && (
          <ProcessingScreen file={uploadedFile} onComplete={(sols) => {
            setSolutions(sols);
            transitionTo('results');
          }} />
        )}
        {appState === 'results' && (
          <ResultsScreen solutions={solutions} onReset={() => {
            setUploadedFile(null);
            setSolutions([]);
            transitionTo('upload');
          }} />
        )}
      </div>
    </div>
  );
};

export default App;
