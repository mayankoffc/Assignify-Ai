import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { List, useListRef } from 'react-window';
import type { CSSProperties } from 'react';
import { PaperSheet } from './components/PaperSheet';
import { FALLBACK_SOLUTIONS } from './constants';
import { 
  RotateCcw, Scan, Eye, Pen, Minus, Plus, Upload, FileText, Loader2, 
  ArrowLeft, Sparkles, ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut, 
  Keyboard, X, Menu, User, LayoutDashboard, Sliders, CircleHelp, FolderUp, TypeOutline, 
  Layers2, CheckCircle2, History, Bolt, BarChart2, ArrowDownToLine, Wand, ImageIcon, Hash, FileDigit, BrainCircuit,
  PanelLeft, Grid3X3, ScanText, FileOutput, Pencil
} from 'lucide-react';
import { AppState, UploadedFile, QuestionSolution, PreviewData, ExtractionStats, LinePlan, WritingPlan, PagePlan } from './types';
import { extractPreviewData, processPreviewToSolutions, terminateWorker, OCRProgress } from './services/ocrService';
import { aiPlanningService } from './services/aiPlanningService';
import { ScanningAnimation } from './components/ScanningAnimation';

const COLORS = {
  bgDark: '#0F0F12', // Deep charcoal
  bgCard: '#18181B', // Zinc dark
  bgInput: '#1F1F24',
  border: '#27272A',
  primaryGreen: '#71717A', // Neutral zinc accent
  primaryGreenBright: '#A1A1AA',
  accentBlue: '#52525B', // Muted slate
  accentTeal: '#3F3F46',
  textPrimary: '#FAFAFA',
  textSecondary: '#71717A',
  danger: '#DC2626',
  success: '#16A34A',
  accent: '#E4E4E7', // Light accent for highlights
  cardHover: '#1C1C21',
};

const seededRandom = (seed: number) => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};

const randomRange = (seed: number, min: number, max: number) => {
  return min + seededRandom(seed) * (max - min);
};

const gaussianRandom = (seed: number, mean: number = 0, stdDev: number = 1) => {
  const u1 = seededRandom(seed);
  const u2 = seededRandom(seed + 1);
  const z = Math.sqrt(-2 * Math.log(u1 + 0.001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
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
  inkPoolStart: boolean;
  inkPoolEnd: boolean;
  inkBlob: boolean;
  letterConnect: boolean;
  pressureVariation: number;
}

interface WordContext {
  wordSeed: number;
  wordFont: string;
  wordSlant: number;
  charIndex: number;
  wordLength: number;
  isFirstChar: boolean;
  isLastChar: boolean;
}

interface LineContext {
  lineSeed: number;
  lineWaveAmplitude: number;
  lineWaveFrequency: number;
  lineHeightVariation: number;
  marginOffset: number;
}

const NUMERIC_VARIATIONS = {
  '0': { widthVar: 0.95, heightVar: 1.02, rotationBias: -0.3 },
  '1': { widthVar: 0.85, heightVar: 1.05, rotationBias: 0.5 },
  '2': { widthVar: 1.0, heightVar: 0.98, rotationBias: -0.2 },
  '3': { widthVar: 0.98, heightVar: 1.0, rotationBias: 0.3 },
  '4': { widthVar: 1.02, heightVar: 1.03, rotationBias: -0.4 },
  '5': { widthVar: 0.97, heightVar: 0.99, rotationBias: 0.2 },
  '6': { widthVar: 1.0, heightVar: 1.01, rotationBias: -0.1 },
  '7': { widthVar: 0.93, heightVar: 1.04, rotationBias: 0.6 },
  '8': { widthVar: 1.01, heightVar: 1.0, rotationBias: 0.0 },
  '9': { widthVar: 0.99, heightVar: 1.02, rotationBias: -0.2 },
};

const getNumericStyle = (char: string, seed: number) => {
  const numVar = NUMERIC_VARIATIONS[char as keyof typeof NUMERIC_VARIATIONS];
  if (!numVar) return null;
  
  const personalStyle = seededRandom(seed * 7) * 0.3;
  const fatigue = Math.sin(seed * 0.01) * 0.15;
  
  return {
    scaleX: numVar.widthVar + gaussianRandom(seed, 0, 0.03) + personalStyle,
    scaleY: numVar.heightVar + gaussianRandom(seed + 1, 0, 0.02),
    rotation: numVar.rotationBias + gaussianRandom(seed + 2, 0, 0.8) + fatigue,
    yDrift: gaussianRandom(seed + 3, 0, 0.4),
    pressure: 0.9 + seededRandom(seed + 4) * 0.2,
  };
};

const getFontForWord = (wordSeed: number, isNumber: boolean = false, isSymbol: boolean = false) => {
  if (isNumber) {
    const r = seededRandom(wordSeed);
    if (r < 0.6) return 'Caveat';
    if (r < 0.85) return 'Shadows Into Light';
    return 'Cedarville Cursive';
  }
  if (isSymbol) return 'Caveat';
  const r = seededRandom(wordSeed);
  if (r < 0.65) return 'Cedarville Cursive';
  if (r < 0.90) return 'Caveat';
  return 'Shadows Into Light';
};

const getFontForType = (char: string, seed: number, wordContext?: WordContext) => {
  const isNumber = /[0-9]/.test(char);
  const isSymbol = /[=+\-×÷∝()[\]{}]/.test(char);
  
  if (wordContext) {
    if (isNumber) return seededRandom(seed) < 0.85 ? wordContext.wordFont : 'Caveat';
    if (isSymbol) return 'Caveat';
    if (seededRandom(seed) < 0.92) return wordContext.wordFont;
  }

  if (isNumber || isSymbol) {
    return seededRandom(seed) < 0.6 ? 'Caveat' : 'Shadows Into Light';
  }

  return seededRandom(seed) < 0.70 ? 'Cedarville Cursive' : 'Caveat';
};

const generateCharStyle = (
  char: string, 
  seed: number, 
  baseThickness: number,
  wordContext?: WordContext,
  lineContext?: LineContext
): CharStyle => {
  const isNumber = /[0-9]/.test(char);
  const isMath = /[0-9=+\-×÷∝]/.test(char);
  const isPunctuation = /[.,!?;:'"]/.test(char);
  
  const numericStyle = isNumber ? getNumericStyle(char, seed) : null;
  
  const baselineWave = lineContext 
    ? Math.sin((wordContext?.charIndex || 0) * lineContext.lineWaveFrequency) * lineContext.lineWaveAmplitude
    : 0;
  
  // Advanced Fatigue: Baseline drifts slightly over the line
  const fatigueDrift = wordContext ? (wordContext.charIndex / Math.max(wordContext.wordLength, 10)) * (gaussianRandom(seed + 99, 0, 0.5)) : 0;
  
  const baselineDrift = gaussianRandom(seed + 100, 0, 0.8);
  const numericYDrift = numericStyle ? numericStyle.yDrift : 0;
  const yOffset = baselineWave + baselineDrift + fatigueDrift + numericYDrift + randomRange(seed + 1, -0.3, 0.3);
  
  const kerningVariance = gaussianRandom(seed + 200, 0, 0.5);
  const positionInWord = wordContext ? wordContext.charIndex / Math.max(wordContext.wordLength, 1) : 0.5;
  const kerningCurve = Math.sin(positionInWord * Math.PI) * 0.3;
  
  const pressureStart = wordContext?.isFirstChar ? randomRange(seed + 300, 0.1, 0.25) : 0;
  const pressureEnd = wordContext?.isLastChar ? randomRange(seed + 301, 0.05, 0.15) : 0;
  const numericPressure = numericStyle ? (numericStyle.pressure - 1) * 0.1 : 0;
  const pressureVariation = pressureStart + pressureEnd + numericPressure + gaussianRandom(seed + 302, 0, 0.08);
  
  let rotation: number;
  if (numericStyle) {
    rotation = numericStyle.rotation;
  } else if (isMath) {
    rotation = randomRange(seed, -0.5, 0.5);
  } else {
    const baseRotation = randomRange(seed, -1.5, 1.5);
    const wordSlantInfluence = wordContext ? wordContext.wordSlant * 0.3 : 0;
    rotation = baseRotation + wordSlantInfluence;
  }
  
  let scale: number;
  if (numericStyle) {
    scale = (numericStyle.scaleX + numericStyle.scaleY) / 2;
  } else {
    scale = randomRange(seed + 2, 0.96, 1.06);
  }
  
  const inkPoolStart = wordContext?.isFirstChar && seededRandom(seed + 400) < 0.35;
  const inkPoolEnd = wordContext?.isLastChar && seededRandom(seed + 401) < 0.25;
  const inkBlob = seededRandom(seed + 402) < 0.03;
  
  const letterConnect = !isPunctuation && !isMath && 
    wordContext && !wordContext.isLastChar && 
    seededRandom(seed + 500) < 0.15;
  
  const baseOpacity = randomRange(seed + 4, 0.85, 0.98);
  const pressureOpacity = 1 - Math.abs(pressureVariation) * 0.3;
  const finalOpacity = baseOpacity * pressureOpacity;
  
  return {
    rotation,         
    yOffset,      
    scale,       
    skew: isMath ? randomRange(seed + 3, -0.5, 0.5) : (wordContext?.wordSlant || -3) + randomRange(seed + 3, -1.2, 1.2),  
    opacity: finalOpacity,     
    marginRight: kerningVariance + kerningCurve + randomRange(seed + 5, -0.3, 0.3),  
    strokeWidth: baseThickness + pressureVariation + randomRange(seed + 6, -0.08, 0.08),     
    fontFamily: getFontForType(char, seed + 7, wordContext),
    inkPoolStart,
    inkPoolEnd,
    inkBlob,
    letterConnect,
    pressureVariation,
  };
};

const generateWordContext = (wordSeed: number, wordLength: number): Omit<WordContext, 'charIndex' | 'isFirstChar' | 'isLastChar'> => {
  const wordFont = getFontForWord(wordSeed);
  const wordSlant = -3 + gaussianRandom(wordSeed + 50, 0, 1.5);
  return { wordSeed, wordFont, wordSlant, wordLength };
};

const generateLineContext = (lineSeed: number): LineContext => ({
  lineSeed,
  lineWaveAmplitude: randomRange(lineSeed, 0.2, 0.8),
  lineWaveFrequency: randomRange(lineSeed + 1, 0.1, 0.25),
  lineHeightVariation: randomRange(lineSeed + 2, -2, 2),
  marginOffset: randomRange(lineSeed + 3, -3, 3),
});

interface HandwrittenCharProps {
  char: string;
  seed: number;
  isMath?: boolean;
  thickness: number;
  delayIndex: number;
  wordContext?: WordContext;
  lineContext?: LineContext;
}

const HandwrittenChar: React.FC<HandwrittenCharProps> = ({ 
  char, seed, isMath = false, thickness, delayIndex, wordContext, lineContext
}) => {
  const style = useMemo(() => generateCharStyle(char, seed, thickness, wordContext, lineContext), [char, seed, thickness, wordContext, lineContext]);
  
  if (char === ' ') {
    const spaceVariation = wordContext ? randomRange(seed, 0.7, 1.3) : 1;
    return <span className="inline-block" style={{ width: `${0.5 * spaceVariation}em` }}></span>;
  }

  const delay = delayIndex * 25;
  
  const inkPoolShadow = style.inkPoolStart 
    ? `0 0 2px rgba(10, 36, 114, 0.4), -1px 0 1px rgba(10, 36, 114, 0.3)`
    : style.inkPoolEnd 
    ? `1px 0 1px rgba(10, 36, 114, 0.3), 0 0 2px rgba(10, 36, 114, 0.3)`
    : '';
  
  const strokeShadow = style.strokeWidth > 0.5 
    ? `0.1px 0 0 rgba(10, 36, 114, ${style.strokeWidth * 0.8}), -0.1px 0 0 rgba(10, 36, 114, ${style.strokeWidth * 0.8})`
    : '';
  
  const blobShadow = style.inkBlob ? `, 0 1px 2px rgba(10, 36, 114, 0.5)` : '';
  
  const combinedShadow = [inkPoolShadow, strokeShadow, blobShadow].filter(Boolean).join(', ') || 'none';
  
  const connectStyle = style.letterConnect ? {
    marginRight: '-1px',
    paddingRight: '1px',
    background: 'linear-gradient(90deg, transparent 80%, rgba(10, 36, 114, 0.15) 100%)',
    backgroundClip: 'text',
  } : {};

  const baseStyle: React.CSSProperties = {
    marginRight: `${style.marginRight}px`,
    fontFamily: style.fontFamily,
    fontWeight: isMath || style.strokeWidth > 0.6 ? 500 : 400,
    color: '#0a2472', 
    fontSize: isMath ? '1.1em' : '1em',
    filter: `contrast(1.2) brightness(${0.88 + style.pressureVariation * 0.1})`,
    textShadow: combinedShadow,
    transform: `translateY(${style.yOffset}px) rotate(${style.rotation}deg) scale(${style.scale}) skewX(${style.skew}deg)`,
    animation: `writeIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
    animationDelay: `${delay}ms`,
    opacity: 0,
  };

  return (
    <span className="inline-block relative select-none" style={{ ...baseStyle, ...connectStyle }}>
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
    <div className="w-full h-[6px] relative overflow-visible" style={{ width }}>
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

const PencilText: React.FC<{ x: number; y: number; text: string; seed: number; fontSize?: number }> = ({ x, y, text, seed, fontSize = 14 }) => (
  <text x={x} y={y} fontFamily="'Shadows Into Light', cursive" fontSize={fontSize} fill="#2d2d2d" transform={`rotate(${randomRange(seed, -2, 2)}, ${x}, ${y})`} style={{ letterSpacing: '0.5px' }}>{text}</text>
);

const HandwrittenDiagram: React.FC<{ type: string; seed: number }> = ({ type, seed }) => (
  <div className="w-full my-6 flex justify-center">
    <div className="relative p-2 w-full flex justify-center" style={{ transform: `rotate(${randomRange(seed, -1.5, 1.5)}deg)` }}>
      <svg width="100%" height="auto" viewBox="0 0 350 180" className="overflow-visible max-w-2xl" style={{ minHeight: "180px" }}>
        <rect x="20" y="20" width="310" height="140" fill="none" stroke="#2d2d2d" strokeWidth="1" strokeDasharray="5,5" />
        <PencilText x={175} y={90} text={`[Diagram: ${type}]`} seed={seed} fontSize={16} />
        <PencilText x={175} y={115} text="(Refer to textbook)" seed={seed + 1} fontSize={12} />
      </svg>
    </div>
  </div>
);

const HandwrittenStrike: React.FC<{ content: string; seed: number; thickness: number; delayIndex: number }> = ({ content, seed, thickness, delayIndex }) => (
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

const HandwrittenFraction: React.FC<{ num: string; den: string; seed: number; thickness: number; delayIndex: number }> = ({ num, den, seed, thickness, delayIndex }) => (
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

const HandwrittenSqrt: React.FC<{ content: string; seed: number; thickness: number; delayIndex: number }> = ({ content, seed, thickness, delayIndex }) => (
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

interface HandwrittenWordProps {
  word: string;
  seed: number;
  thickness: number;
  delayOffset: number;
  lineContext: LineContext;
  wordIndex: number;
}

const HandwrittenWord: React.FC<HandwrittenWordProps> = ({ word, seed, thickness, delayOffset, lineContext, wordIndex }) => {
  const wordContextBase = useMemo(() => generateWordContext(seed, word.length), [seed, word.length]);
  const wordSpaceVariation = randomRange(seed + 1000, 0.8, 1.4);
  
  return (
    <span 
      className="inline-block whitespace-nowrap"
      style={{ marginRight: `${0.5 * wordSpaceVariation}em`, transform: `translateY(${lineContext.lineHeightVariation * 0.3}px)` }}
    >
      {word.split('').map((char, j) => {
        const wordContext: WordContext = {
          ...wordContextBase,
          charIndex: j,
          isFirstChar: j === 0,
          isLastChar: j === word.length - 1,
        };
        return (
          <HandwrittenChar 
            key={j} 
            char={char} 
            seed={seed + wordIndex * 100 + j} 
            thickness={thickness} 
            delayIndex={delayOffset + j}
            wordContext={wordContext}
            lineContext={lineContext}
          />
        );
      })}
    </span>
  );
};

const HandwrittenLineParser: React.FC<{ text: string; seed: number; thickness: number; globalDelayOffset: number; lineIndex?: number }> = ({ text, seed, thickness, globalDelayOffset, lineIndex = 0 }) => {
  const lineContext = useMemo(() => generateLineContext(seed + lineIndex * 1000), [seed, lineIndex]);
  
  const diagramMatch = text.trim().match(/^DIAGRAM\[(.*?)\]$/);
  if (diagramMatch) return <HandwrittenDiagram type={diagramMatch[1]} seed={seed} />;

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
  let wordCounter = 0;

  return (
    <div 
      className="flex flex-wrap items-baseline leading-[2.6rem]"
      style={{ marginLeft: `${lineContext.marginOffset}px`, transform: `translateY(${lineContext.lineHeightVariation}px)` }}
    >
      {parts.map((part, index) => {
        const partSeed = seed + index * 50;
        const currentDelay = globalDelayOffset + charCounter;
        
        if (part.type === 'frac') {
          const len = (part.num?.length || 0) + (part.den?.length || 0);
          charCounter += len;
          return <HandwrittenFraction key={index} num={part.num!} den={part.den!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        if (part.type === 'sqrt') {
          charCounter += part.content?.length || 0;
          return <HandwrittenSqrt key={index} content={part.content!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        if (part.type === 'strike') {
          charCounter += part.content?.length || 0;
          return <HandwrittenStrike key={index} content={part.content!} seed={partSeed} thickness={thickness} delayIndex={currentDelay} />;
        }
        
        const words = part.content!.split(' ').filter(w => w.length > 0);
        return words.map((word, i) => {
          const wordEl = (
            <HandwrittenWord
              key={`${index}-${i}`}
              word={word}
              seed={partSeed + i * 20}
              thickness={thickness}
              delayOffset={globalDelayOffset + charCounter}
              lineContext={lineContext}
              wordIndex={wordCounter++}
            />
          );
          charCounter += word.length + 1;
          return wordEl;
        });
      })}
    </div>
  );
};

const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void; currentTool: string; onToolChange: (tool: string) => void }> = ({ isOpen, onClose, currentTool, onToolChange }) => {
  const [history, setHistory] = useState<any[]>([]);
  
  useEffect(() => {
    const saved = localStorage.getItem('assignify_history');
    if (saved) setHistory(JSON.parse(saved));
  }, [isOpen]);

  const tools = [
    { id: 'handwriting', icon: Pencil, label: 'Generator' },
    { id: 'history', icon: History, label: 'Recent' },
    { id: 'settings', icon: Sliders, label: 'Settings' },
  ];

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" 
            onClick={onClose} 
          />
        )}
      </AnimatePresence>
      
      <aside className={`fixed left-0 top-0 h-full w-72 z-50 transform transition-all duration-500 ease-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto border-r`}
        style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
      >
        <div className="p-6 sm:p-8 border-b" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center" 
                 style={{ backgroundColor: COLORS.accent }}>
              <Pencil size={20} className="text-zinc-900" />
            </div>
            <div>
              <h1 className="font-semibold text-base sm:text-lg tracking-tight" style={{ color: COLORS.textPrimary }}>Assignify</h1>
              <p className="text-[10px] font-medium tracking-wide" style={{ color: COLORS.textSecondary }}>Professional Edition</p>
            </div>
          </div>
        </div>

        <nav className="p-4 sm:p-6 space-y-1">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => { onToolChange(tool.id); if(tool.id !== 'history') onClose(); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all group ${currentTool === tool.id ? '' : 'hover:bg-zinc-800/50'}`}
              style={{ 
                backgroundColor: currentTool === tool.id ? COLORS.cardHover : 'transparent',
                color: currentTool === tool.id ? COLORS.accent : COLORS.textSecondary,
                borderLeft: currentTool === tool.id ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              }}
            >
              <div className="flex items-center gap-3">
                <tool.icon size={18} strokeWidth={1.5} />
                <span className="font-medium text-sm">{tool.label}</span>
              </div>
              {tool.id === 'history' && history.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/20 font-bold">
                  {history.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {currentTool === 'history' && (
          <div className="px-6 py-2 h-[400px] overflow-y-auto space-y-3 custom-scrollbar">
            <p className="text-[10px] font-black uppercase tracking-widest mb-4 opacity-40 px-2">Recently Generated</p>
            {history.map((item) => (
              <div key={item.id} className="p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 transition-all cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-10 rounded bg-white/10 flex items-center justify-center overflow-hidden">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <FileText size={14} className="opacity-40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: COLORS.textPrimary }}>{item.name}</p>
                    <p className="text-[10px] opacity-50" style={{ color: COLORS.textSecondary }}>
                      {new Date(item.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center py-8 opacity-40">
                <History className="mx-auto mb-2" size={28} strokeWidth={1.5} />
                <p className="text-xs font-medium">No history yet</p>
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 border-t" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: COLORS.bgDark }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: COLORS.accent }}>
              <User size={18} className="text-zinc-900" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: COLORS.textPrimary }}>Pro Account</p>
              <p className="text-[10px]" style={{ color: COLORS.textSecondary }}>Active</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

const Header: React.FC<{ onMenuClick: () => void; title: string }> = ({ onMenuClick, title }) => (
  <header className="h-14 sm:h-16 flex items-center justify-between px-4 sm:px-6 border-b" style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}>
    <div className="flex items-center gap-3">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg transition-colors" style={{ color: COLORS.textSecondary }}>
        <PanelLeft size={20} strokeWidth={1.5} />
      </button>
      <h2 className="text-base sm:text-lg font-medium" style={{ color: COLORS.textPrimary }}>{title}</h2>
    </div>
    <div className="flex items-center gap-2">
      <button className="p-2 rounded-lg transition-colors hover:bg-zinc-800/50" style={{ color: COLORS.textSecondary }}>
        <Sliders size={18} strokeWidth={1.5} />
      </button>
    </div>
  </header>
);

const UploadScreen: React.FC<{ onUpload: (file: UploadedFile) => void }> = ({ onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      setIsLoading(true);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          onUpload({ name: file.name, type: file.type, data: e.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: COLORS.bgDark }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} currentTool="handwriting" onToolChange={() => {}} />
      
      <div className="flex-1 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} title="Handwriting Generator" />
        
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-4xl mx-auto space-y-6"
          >
            <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-8 border" 
                 style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}>
              <div className="flex items-center gap-4 mb-6 sm:mb-8">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center" 
                     style={{ backgroundColor: COLORS.accent }}>
                  <FolderUp size={24} className="text-zinc-900" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: COLORS.textPrimary }}>Upload Document</h3>
                  <p className="text-xs sm:text-sm" style={{ color: COLORS.textSecondary }}>PDF, Images, or scanned documents</p>
                </div>
              </div>

              <motion.div 
                whileHover={{ scale: 1.005 }}
                whileTap={{ scale: 0.995 }}
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => !isLoading && inputRef.current?.click()}
                className={`border border-dashed rounded-xl sm:rounded-2xl h-48 sm:h-64 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative group`}
                style={{ 
                  borderColor: dragActive ? COLORS.accent : COLORS.border,
                  backgroundColor: dragActive ? `${COLORS.accent}08` : COLORS.bgDark,
                }}
              >
                {isLoading ? (
                  <div className="text-center z-10">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" 
                         style={{ backgroundColor: COLORS.bgCard }}>
                      <Loader2 className="animate-spin" size={32} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                    </div>
                    <p className="text-lg sm:text-xl font-medium mb-1" style={{ color: COLORS.textPrimary }}>Processing...</p>
                    <p className="text-xs" style={{ color: COLORS.textSecondary }}>Analyzing document</p>
                  </div>
                ) : (
                  <div className="text-center z-10 space-y-3 px-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl mx-auto flex items-center justify-center transition-transform group-hover:scale-105" 
                         style={{ backgroundColor: COLORS.bgCard }}>
                      <Upload size={24} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-base sm:text-lg font-medium" style={{ color: COLORS.textPrimary }}>
                        {dragActive ? 'Release to upload' : 'Drop files here'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: COLORS.textSecondary }}>or click to browse</p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center pt-2">
                      {['PDF', 'PNG', 'JPG'].map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-md text-[10px] font-medium" style={{ backgroundColor: COLORS.bgCard, color: COLORS.textSecondary }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {[
                { icon: ScanText, title: 'Smart OCR', desc: 'High accuracy text extraction' },
                { icon: Pencil, title: 'Natural Writing', desc: 'Realistic handwriting styles' },
                { icon: FileOutput, title: 'Export Ready', desc: 'Print-ready A4 format' },
              ].map((item, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * i }}
                  className="rounded-xl p-4 sm:p-5 border transition-colors hover:border-zinc-600" 
                  style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
                >
                  <div className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center" 
                       style={{ backgroundColor: COLORS.bgDark }}>
                    <item.icon size={18} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                  </div>
                  <h4 className="text-sm font-medium mb-1" style={{ color: COLORS.textPrimary }}>{item.title}</h4>
                  <p className="text-xs" style={{ color: COLORS.textSecondary }}>{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

const PreviewScreen: React.FC<{ 
  file: UploadedFile; 
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
  onConvert: (preview: PreviewData) => void;
  onBack: () => void;
}> = ({ file, apiKey = '', onApiKeyChange, onConvert, onBack }) => {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isExtracting, setIsExtracting] = useState(true);
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractStatus, setExtractStatus] = useState('Loading document...');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showApiInput, setShowApiInput] = useState(false);
  const [localApiKey, setLocalApiKey] = useState(apiKey);

  useEffect(() => {
    const extract = async () => {
      try {
        const data = await extractPreviewData(file.data, file.type, (p) => {
          setExtractProgress(p.progress);
          setExtractStatus(p.status);
        });
        setPreviewData(data);
        setIsExtracting(false);
      } catch (e) {
        console.error('Extraction failed:', e);
        setExtractStatus('Extraction failed - using fallback');
        setPreviewData({
          thumbnail: '',
          extractedText: ['Document content could not be fully extracted'],
          stats: { totalCharacters: 0, totalWords: 0, totalNumbers: 0, totalLines: 0, totalPages: 1, extractedImages: [] },
          rawPages: ['Document content']
        });
        setIsExtracting(false);
      }
    };
    extract();
  }, [file]);

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: COLORS.bgDark }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} currentTool="handwriting" onToolChange={() => {}} />
      
      <div className="flex-1 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} title="Document Preview" />
        
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800/50" style={{ color: COLORS.textSecondary }}>
              <ArrowLeft size={16} strokeWidth={1.5} /> Back
            </button>

            {isExtracting ? (
              <div className="rounded-xl sm:rounded-2xl p-6 sm:p-8" style={{ backgroundColor: COLORS.bgCard }}>
                <div className="text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mx-auto mb-4 sm:mb-6 flex items-center justify-center" style={{ backgroundColor: COLORS.bgDark }}>
                    <Loader2 className="animate-spin" size={32} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-medium mb-2" style={{ color: COLORS.textPrimary }}>Extracting Content</h3>
                  <p className="text-sm mb-4 sm:mb-6" style={{ color: COLORS.textSecondary }}>{extractStatus}</p>
                  
                  <div className="max-w-sm mx-auto">
                    <div className="flex justify-between text-xs mb-2">
                      <span style={{ color: COLORS.textSecondary }}>Progress</span>
                      <span className="font-medium" style={{ color: COLORS.textPrimary }}>{extractProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                      <div 
                        className="h-full transition-all duration-300 rounded-full"
                        style={{ width: `${extractProgress}%`, backgroundColor: COLORS.accent }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : previewData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col items-center" style={{ backgroundColor: COLORS.bgCard }}>
                    <h4 className="text-xs font-medium mb-3" style={{ color: COLORS.textSecondary }}>Preview</h4>
                    {previewData.thumbnail ? (
                      <img 
                        src={previewData.thumbnail} 
                        alt="Document preview" 
                        className="w-full max-w-[160px] rounded-lg border"
                        style={{ borderColor: COLORS.border }}
                      />
                    ) : (
                      <div className="w-full max-w-[160px] h-[200px] rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS.bgDark }}>
                        <FileText size={32} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                      </div>
                    )}
                    <p className="mt-3 text-xs font-medium truncate max-w-full" style={{ color: COLORS.textPrimary }}>{file.name}</p>
                  </div>

                  <div className="lg:col-span-2 rounded-xl sm:rounded-2xl p-4 sm:p-6" style={{ backgroundColor: COLORS.bgCard }}>
                    <h4 className="text-xs font-medium mb-4" style={{ color: COLORS.textSecondary }}>Statistics</h4>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { icon: TypeOutline, label: 'Characters', value: formatNumber(previewData.stats.totalCharacters) },
                        { icon: FileText, label: 'Words', value: formatNumber(previewData.stats.totalWords) },
                        { icon: Hash, label: 'Numbers', value: formatNumber(previewData.stats.totalNumbers) },
                        { icon: Layers2, label: 'Pages', value: String(previewData.stats.totalPages) },
                      ].map((stat, i) => (
                        <div key={i} className="p-3 rounded-lg text-center" style={{ backgroundColor: COLORS.bgDark }}>
                          <stat.icon size={16} className="mx-auto mb-2" style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                          <p className="text-lg font-medium" style={{ color: COLORS.textPrimary }}>{stat.value}</p>
                          <p className="text-[10px]" style={{ color: COLORS.textSecondary }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {previewData.stats.extractedImages.length > 0 && (
                      <div className="mt-4">
                        <div className="flex items-center gap-2 mb-2">
                          <ImageIcon size={14} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                          <span className="text-xs" style={{ color: COLORS.textSecondary }}>
                            {previewData.stats.extractedImages.length} image{previewData.stats.extractedImages.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {previewData.stats.extractedImages.slice(0, 5).map((img, i) => (
                            <img 
                              key={i} 
                              src={img.dataUrl} 
                              alt={`Extracted ${i + 1}`}
                              className="h-12 w-12 object-cover rounded-md border"
                              style={{ borderColor: COLORS.border }}
                            />
                          ))}
                          {previewData.stats.extractedImages.length > 5 && (
                            <div className="h-12 w-12 rounded-md flex items-center justify-center" style={{ backgroundColor: COLORS.bgDark }}>
                              <span className="text-xs" style={{ color: COLORS.textSecondary }}>
                                +{previewData.stats.extractedImages.length - 5}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6" style={{ backgroundColor: COLORS.bgCard }}>
                  <h4 className="text-xs font-medium mb-3" style={{ color: COLORS.textSecondary }}>Extracted Text</h4>
                  <div 
                    className="p-3 rounded-lg max-h-36 overflow-y-auto text-xs leading-relaxed"
                    style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}
                  >
                    {previewData.extractedText.slice(0, 3).map((text, i) => (
                      <p key={i} className="mb-2">{text.substring(0, 500)}{text.length > 500 ? '...' : ''}</p>
                    ))}
                    {previewData.extractedText.length > 3 && (
                      <p className="italic">... and {previewData.extractedText.length - 3} more pages</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6" style={{ backgroundColor: COLORS.bgCard }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: COLORS.bgDark }}>
                        <BrainCircuit size={18} style={{ color: localApiKey ? COLORS.accent : COLORS.textSecondary }} strokeWidth={1.5} />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>AI Layout</h4>
                        <p className="text-[10px]" style={{ color: COLORS.textSecondary }}>
                          {localApiKey ? 'Enabled' : 'Optional'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowApiInput(!showApiInput)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-zinc-700/50"
                      style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}
                    >
                      {showApiInput ? 'Hide' : localApiKey ? 'Edit' : 'Add Key'}
                    </button>
                  </div>
                  
                  {showApiInput && (
                    <div className="space-y-3">
                      <input
                        type="password"
                        value={localApiKey}
                        onChange={(e) => setLocalApiKey(e.target.value)}
                        placeholder="Enter Gemini API key..."
                        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none border"
                        style={{ 
                          backgroundColor: COLORS.bgDark, 
                          color: COLORS.textPrimary,
                          borderColor: COLORS.border
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            onApiKeyChange?.(localApiKey);
                            setShowApiInput(false);
                          }}
                          className="px-3 py-2 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: COLORS.accent, color: COLORS.bgDark }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setLocalApiKey('');
                            onApiKeyChange?.('');
                          }}
                          className="px-3 py-2 rounded-lg text-xs"
                          style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="text-xs" style={{ color: COLORS.textSecondary }}>
                        Get your free API key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline" style={{ color: COLORS.accentBlue }}>Google AI Studio</a>
                      </p>
                    </div>
                  )}
                  
                  {!showApiInput && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {['Smart line breaks', 'Q/A positioning', 'Fraction rendering', 'Human-like margins'].map((feature, i) => (
                        <span key={i} className="px-2 py-1 rounded-full" 
                          style={{ backgroundColor: COLORS.bgDark, color: localApiKey ? COLORS.primaryGreen : COLORS.textSecondary }}>
                          {localApiKey ? '✓' : '○'} {feature}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => onConvert(previewData)}
                  className="w-full py-3 sm:py-4 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base font-medium transition-all hover:opacity-90 active:scale-[0.99]"
                  style={{ 
                    backgroundColor: COLORS.accent,
                    color: COLORS.bgDark
                  }}
                >
                  <Wand size={18} strokeWidth={1.5} />
                  Convert to Handwriting
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const ProcessingScreen: React.FC<{ 
  previewData: PreviewData | null;
  fileName: string;
  apiKey?: string;
  onComplete: (solutions: QuestionSolution[], writingPlan?: WritingPlan) => void 
}> = ({ previewData, fileName, apiKey, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [currentStatus, setCurrentStatus] = useState('Initializing');
  const [currentPhase, setCurrentPhase] = useState<'scanning' | 'planning' | 'writing'>('scanning');
  const [currentScanPage, setCurrentScanPage] = useState(1);
  const [stats, setStats] = useState({ letters: 0, speed: 0, pages: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiPlanStatus, setAiPlanStatus] = useState('');
  const [writingPlan, setWritingPlan] = useState<WritingPlan | null>(null);

  useEffect(() => {
    if (!previewData) return;

    const processData = async () => {
      const totalChars = previewData.stats.totalCharacters;
      const totalPages = previewData.stats.totalPages;
      
      setCurrentPhase('scanning');
      setProgress(5);
      setCurrentStatus('Scanning document pages');
      
      for (let page = 1; page <= Math.min(totalPages, 20); page++) {
        setCurrentScanPage(page);
        setProgress(5 + Math.floor((page / totalPages) * 20));
        await new Promise(r => setTimeout(r, 300 + Math.random() * 200));
      }
      
      setCurrentPhase('planning');
      setProgress(30);
      setCurrentStatus('AI analyzing document structure');
      setAiPlanStatus('Connecting to AI...');
      
      let plan: WritingPlan | null = null;
      
      if (apiKey) {
        try {
          aiPlanningService.initialize(apiKey);
          plan = await aiPlanningService.planWriting(previewData.extractedText, (status) => {
            setAiPlanStatus(status);
          });
          setWritingPlan(plan);
          setAiPlanStatus('AI plan ready');
        } catch (e) {
          console.warn('AI planning failed, using fallback');
          setAiPlanStatus('Using smart fallback planning');
        }
      } else {
        setAiPlanStatus('Using smart layout algorithm');
        await new Promise(r => setTimeout(r, 800));
      }
      
      setProgress(45);
      setCurrentPhase('writing');
      setCurrentStatus('Rendering handwriting');
      
      let currentLetters = 0;
      const charsPerTick = Math.max(50, Math.floor(totalChars / 30));
      
      const interval = setInterval(() => {
        currentLetters = Math.min(currentLetters + charsPerTick, totalChars);
        const speed = 150 + Math.floor(Math.random() * 100);
        setStats({ 
          letters: currentLetters, 
          speed, 
          pages: Math.ceil(currentLetters / 3000) 
        });
      }, 100);
      
      try {
        setProgress(50);
        setCurrentStatus('Converting to handwriting');
        
        const solutions = await processPreviewToSolutions(previewData, (p) => {
          setProgress(50 + Math.floor(p.progress * 0.35));
          setCurrentStatus(p.status);
        });
        
        if (plan) {
          solutions.forEach((sol, idx) => {
            if (plan.pages[idx]) {
              sol.linePlans = plan.pages[idx].lines;
              sol.pagePlan = plan.pages[idx];
            }
          });
        }
        
        setStats(prev => ({ ...prev, pages: solutions.length }));
        clearInterval(interval);
        setStats(prev => ({ ...prev, letters: totalChars, pages: solutions.length }));
        
        setProgress(90);
        setCurrentStatus('Applying micro-variations');
        await new Promise(r => setTimeout(r, 400));
        
        setProgress(95);
        setCurrentStatus('Adding ink effects');
        await new Promise(r => setTimeout(r, 300));
        
        setProgress(100);
        setCurrentStatus('Complete');
        
        setTimeout(() => onComplete(solutions, plan || undefined), 500);
      } catch (e) {
        clearInterval(interval);
        setCurrentStatus('Using fallback mode');
        setTimeout(() => onComplete(FALLBACK_SOLUTIONS), 1000);
      }
    };
    
    const t = setTimeout(processData, 300);
    return () => clearTimeout(t);
  }, [previewData, apiKey, onComplete]);

  const stages = [
    { label: 'Scanning', icon: Scan, done: currentPhase !== 'scanning', active: currentPhase === 'scanning' },
    { label: 'Planning', icon: BrainCircuit, done: currentPhase === 'writing', active: currentPhase === 'planning' },
    { label: 'Writing', icon: Pencil, done: progress >= 100, active: currentPhase === 'writing' },
  ];

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: COLORS.bgDark }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} currentTool="handwriting" onToolChange={() => {}} />
      
      <div className="flex-1 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} title="Processing Document" />
        
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6" style={{ backgroundColor: COLORS.bgCard }}>
                {currentPhase === 'scanning' && previewData && (
                  <ScanningAnimation
                    totalPages={previewData.stats.totalPages}
                    currentPage={currentScanPage}
                    extractedText={previewData.extractedText}
                    pageImages={previewData.stats.extractedImages.map(img => img.dataUrl)}
                  />
                )}
                
                {currentPhase === 'planning' && (
                  <div className="text-center py-8 sm:py-12">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl mx-auto mb-4 sm:mb-6 flex items-center justify-center" 
                      style={{ backgroundColor: COLORS.bgDark }}>
                      <BrainCircuit className="animate-pulse" size={32} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Planning Layout</h3>
                    <p className="text-xs mb-4" style={{ color: COLORS.textSecondary }}>{aiPlanStatus}</p>
                    <div className="flex flex-wrap gap-2 justify-center text-[10px]">
                      {['Line breaks', 'Spacing', 'Fractions', 'Margins'].map((item, i) => (
                        <span key={i} className="px-2 py-1 rounded-md" 
                          style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {currentPhase === 'writing' && (
                  <div className="text-center py-6 sm:py-8">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl mx-auto mb-4 flex items-center justify-center" 
                      style={{ backgroundColor: COLORS.bgDark }}>
                      <Pen size={24} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Writing</h3>
                    <p className="text-xs" style={{ color: COLORS.textSecondary }}>
                      Generating handwriting...
                    </p>
                    
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Letters', value: stats.letters },
                        { label: 'Speed', value: `${stats.speed}/s` },
                        { label: 'Pages', value: stats.pages },
                      ].map((stat, i) => (
                        <div key={i} className="p-2 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
                          <p className="text-base font-medium" style={{ color: COLORS.textPrimary }}>{stat.value}</p>
                          <p className="text-[10px]" style={{ color: COLORS.textSecondary }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl sm:rounded-2xl p-4 sm:p-6" style={{ backgroundColor: COLORS.bgCard }}>
                <h4 className="text-xs font-medium mb-4" style={{ color: COLORS.textSecondary }}>Progress</h4>
                
                <div className="space-y-3 mb-5">
                  <div className="flex justify-between text-xs">
                    <span style={{ color: COLORS.textSecondary }}>{currentStatus}</span>
                    <span className="font-medium" style={{ color: COLORS.textPrimary }}>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                    <div 
                      className="h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%`, backgroundColor: COLORS.accent }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  {stages.map((stage, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg transition-all"
                      style={{ backgroundColor: stage.active ? COLORS.bgDark : 'transparent' }}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all`}
                        style={{ 
                          backgroundColor: stage.done ? COLORS.accent : COLORS.bgDark,
                        }}>
                        {stage.done ? (
                          <CheckCircle2 size={16} style={{ color: COLORS.bgDark }} strokeWidth={1.5} />
                        ) : stage.active ? (
                          <Loader2 size={16} className="animate-spin" style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                        ) : (
                          <stage.icon size={16} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: stage.done || stage.active ? COLORS.textPrimary : COLORS.textSecondary }}>
                          {stage.label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
                  <p className="text-xs mb-1 truncate" style={{ color: COLORS.textSecondary }}>{fileName}</p>
                  <div className="flex gap-3 text-[10px]">
                    <span style={{ color: COLORS.textSecondary }}>
                      {previewData?.stats.totalPages || 0} pages
                    </span>
                    <span style={{ color: COLORS.textSecondary }}>
                      {previewData?.stats.totalCharacters.toLocaleString() || 0} chars
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

interface PageContentProps {
  solution: QuestionSolution;
  index: number;
  globalSeed: number;
  penThickness: number;
  isScannerMode: boolean;
}

const PageContent = memo(({ solution, index, globalSeed, penThickness, isScannerMode }: PageContentProps) => {
  const solutionSeed = globalSeed + (index * 9999);
  let charAccumulator = 0;
  const linePlans = solution.linePlans || [];
  const pagePlan = solution.pagePlan;
  const hasAIPlan = linePlans.length > 0 || !!pagePlan;

  const pageMarginLeft = pagePlan?.marginLeft ?? 20;
  const pageMarginRight = pagePlan?.marginRight ?? 15;
  const pageMarginTop = pagePlan?.marginTop ?? 20;
  const pageLineSpacing = pagePlan?.lineSpacing ?? 28;
  const pageOverallSlant = pagePlan?.overallSlant ?? 0;
  const pageFatigue = pagePlan?.fatigueLevel ?? 0;

  const getLinePlan = (lineIdx: number) => linePlans[lineIdx] || null;

  const renderFraction = (numerator: string, denominator: string, seed: number) => (
    <span className="inline-flex flex-col items-center mx-1 align-middle" style={{ fontSize: '0.75em' }}>
      <span style={{ transform: `rotate(${randomRange(seed, -1, 1)}deg)` }}>{numerator}</span>
      <span className="w-full border-t border-current my-0.5" style={{ transform: `rotate(${randomRange(seed + 1, -0.5, 0.5)}deg)` }} />
      <span style={{ transform: `rotate(${randomRange(seed + 2, -1, 1)}deg)` }}>{denominator}</span>
    </span>
  );

  const processLineWithFractions = (text: string, seed: number): React.ReactNode => {
    const fractionRegex = /(\d+)\/(\d+)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let fractionIdx = 0;

    while ((match = fractionRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <HandwrittenLineParser 
            key={`t-${lastIndex}`}
            text={text.slice(lastIndex, match.index)} 
            seed={seed + lastIndex} 
            thickness={penThickness} 
            globalDelayOffset={charAccumulator + lastIndex}
            lineIndex={0}
          />
        );
      }
      parts.push(
        <span key={`f-${fractionIdx}`} className="inline-block">
          {renderFraction(match[1], match[2], seed + match.index)}
        </span>
      );
      lastIndex = match.index + match[0].length;
      fractionIdx++;
    }

    if (lastIndex < text.length) {
      parts.push(
        <HandwrittenLineParser 
          key={`t-${lastIndex}`}
          text={text.slice(lastIndex)} 
          seed={seed + lastIndex} 
          thickness={penThickness} 
          globalDelayOffset={charAccumulator + lastIndex}
          lineIndex={0}
        />
      );
    }

    return parts.length > 0 ? parts : (
      <HandwrittenLineParser 
        text={text} 
        seed={seed} 
        thickness={penThickness} 
        globalDelayOffset={charAccumulator}
        lineIndex={0}
      />
    );
  };

  const fatigueAdjustedThickness = penThickness * (1 - pageFatigue * 0.15);

  return (
    <PaperSheet isScannerMode={isScannerMode}>
      <div 
        className="ballpoint-ink flex flex-col items-start w-full text-xl paper-content" 
        style={{ 
          fontWeight: penThickness > 0.7 ? 600 : 400,
          paddingLeft: `${pageMarginLeft}px`,
          paddingRight: `${pageMarginRight}px`,
          paddingTop: `${pageMarginTop}px`,
          transform: `skewX(${pageOverallSlant}deg)`,
          gap: `${pageLineSpacing - 24}px`,
        }}
      >
        <div className="flex items-baseline mb-6 -ml-4">
          <span className="text-3xl font-bold font-[Caveat] text-[#0a2472] mr-4 relative">
            {solution.questionNumber}
            <div className="absolute -bottom-1 left-0 w-full">
              <HandwrittenLineSVG width="100%" seed={solutionSeed} thickness={penThickness} />
            </div>
          </span>
          <div className="opacity-95 font-semibold">
            <HandwrittenLineParser 
              text={solution.questionText} 
              seed={solutionSeed} 
              thickness={penThickness} 
              globalDelayOffset={charAccumulator}
              lineIndex={0}
            />
            <span className="hidden">{charAccumulator += solution.questionText.length}</span>
          </div>
        </div>

        <div className="w-full flex flex-col gap-1">
          {(solution.linePlans?.length ? solution.linePlans.map((p, i) => p?.content || solution.steps[i] || '') : solution.steps).map((line, lineIdx) => {
            const plan = getLinePlan(lineIdx);
            const displayText = plan?.content || line;
            const isStepLabel = plan?.isQuestionNumber || displayText.trim().startsWith('Step') || displayText.trim().startsWith('Sol:') || displayText.trim().startsWith('Given') || displayText.trim().startsWith('Ans');
            const isMath = displayText.includes('=') || displayText.includes('∝');
            const isHeading = plan?.isHeading || false;
            const hasFraction = plan?.isFraction || /\d+\/\d+/.test(displayText);
            
            if (displayText === "" || line === "") return <div key={lineIdx} className="h-[1.5rem]"></div>;
            
            let indentPx = 0;
            if (plan) {
              indentPx = plan.indent;
            } else {
              if (displayText.trim().startsWith('(') || displayText.trim().startsWith('1.') || displayText.trim().startsWith('2.')) indentPx = 24;
              else if (isMath && !isStepLabel) indentPx = 48;
            }
            
            const baselineVar = plan?.baselineVariation ?? randomRange(solutionSeed + lineIdx * 100, 0, 0.5);
            const slant = plan?.slantAngle ?? randomRange(solutionSeed + lineIdx * 101, -2, 0);
            const pressure = plan?.pressureLevel ?? 0.8;
            const adjustedThickness = fatigueAdjustedThickness * pressure;
            
            const alignment = plan?.alignment || 'left';
            const wordSpacing = plan?.wordSpacing || 'normal';
            const emphasis = plan?.emphasis || 'normal';
            
            const wordSpacingPx = wordSpacing === 'tight' ? '-0.5px' : wordSpacing === 'loose' ? '2px' : '0px';
            const justifyClass = alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start';
            
            const fractionContent = plan?.isFraction && plan?.fractionParts 
              ? renderFraction(plan.fractionParts.numerator, plan.fractionParts.denominator, solutionSeed + lineIdx * 50)
              : null;
            
            const textAfterFraction = plan?.isFraction && plan?.fractionParts 
              ? (plan.fractionParts.remainingText ?? displayText.replace(new RegExp(`${plan.fractionParts.numerator}\\s*/\\s*${plan.fractionParts.denominator}`), '').trim())
              : '';
            
            const lineComponent = (
              <div 
                key={lineIdx} 
                className={`relative min-h-[2.6rem] flex items-center ${justifyClass}`}
                style={{ 
                  paddingLeft: `${indentPx}px`,
                  transform: `translateY(${baselineVar}px) skewX(${slant}deg)`,
                  wordSpacing: wordSpacingPx,
                  textDecoration: emphasis === 'underline' ? 'underline' : 'none',
                  fontWeight: emphasis === 'bold' || isHeading ? 600 : 'inherit',
                }}
              >
                {isStepLabel && (
                  <div className="absolute left-0 bottom-2 w-12">
                    <HandwrittenLineSVG width="100%" seed={solutionSeed + lineIdx} thickness={adjustedThickness} />
                  </div>
                )}
                {fractionContent ? (
                  <span className="flex items-center">
                    {fractionContent}
                    {textAfterFraction && (
                      <HandwrittenLineParser 
                        text={textAfterFraction} 
                        seed={solutionSeed + 500 + (lineIdx * 77)} 
                        thickness={adjustedThickness} 
                        globalDelayOffset={charAccumulator}
                        lineIndex={lineIdx + 1}
                      />
                    )}
                  </span>
                ) : hasFraction ? (
                  processLineWithFractions(displayText, solutionSeed + 500 + (lineIdx * 77))
                ) : (
                  <HandwrittenLineParser 
                    text={displayText} 
                    seed={solutionSeed + 500 + (lineIdx * 77)} 
                    thickness={adjustedThickness} 
                    globalDelayOffset={charAccumulator}
                    lineIndex={lineIdx + 1}
                  />
                )}
              </div>
            );
            
            charAccumulator += displayText.length + 5;
            return lineComponent;
          })}
        </div>
        
        {hasAIPlan && (
          <div className="mt-4 flex items-center gap-1.5 text-xs opacity-30">
            <BrainCircuit size={12} strokeWidth={1.5} />
            <span>AI layout</span>
          </div>
        )}
      </div>
    </PaperSheet>
  );
});

PageContent.displayName = 'PageContent';

interface VirtualizedRowCustomProps {
  filteredSolutions: QuestionSolution[];
  globalSeed: number;
  penThickness: number;
  isScannerMode: boolean;
}

const VirtualizedRow = ({ 
  index, style, filteredSolutions, globalSeed, penThickness, isScannerMode 
}: { index: number; style: CSSProperties; ariaAttributes?: Record<string, unknown>; } & VirtualizedRowCustomProps): React.ReactElement => {
  const sol = filteredSolutions[index];
  if (!sol) return <div style={style} className="paper-sheet-container" />;
  
  return (
    <div style={{ ...style, paddingTop: '32px', paddingBottom: '32px' }} className="paper-sheet-container">
      <PageContent solution={sol} index={index} globalSeed={globalSeed} penThickness={penThickness} isScannerMode={isScannerMode} />
    </div>
  );
};

const ITEM_HEIGHT = 1200;

const ResultsScreen: React.FC<{ solutions: QuestionSolution[], onReset: () => void }> = ({ solutions, onReset }) => {
  const [globalSeed, setGlobalSeed] = useState(Date.now()); 
  const [penThickness, setPenThickness] = useState(0.5);
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(100);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const listRef = useListRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(800);

  const hasAIPlan = useMemo(() => solutions.some(sol => sol.linePlans?.length || sol.pagePlan), [solutions]);
  const aiPlannedPages = useMemo(() => solutions.filter(sol => sol.linePlans?.length || sol.pagePlan).length, [solutions]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) setContainerHeight(window.innerHeight - 80);
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const regenerate = () => setGlobalSeed(prev => prev + 1);
  const toggleScanner = () => setIsScannerMode(prev => !prev);

  const goToPage = useCallback((page: number) => {
    const targetPage = Math.max(0, Math.min(page, solutions.length - 1));
    setCurrentPage(targetPage);
    try { listRef.current?.scrollToRow({ index: targetPage, align: 'start' }); } catch (e) {}
  }, [solutions.length]);

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

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: '#f4f4f5' }}>
      <div className="fixed left-0 top-0 h-full w-64 z-50 hidden lg:block" style={{ backgroundColor: COLORS.bgCard }}>
        <Sidebar isOpen={true} onClose={() => {}} currentTool="handwriting" onToolChange={() => {}} />
      </div>

      <div className="flex-1 lg:ml-64 relative">
        <div className="sticky top-0 z-40 h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 border-b no-print" 
             style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg transition-colors" style={{ color: COLORS.textSecondary }}>
              <PanelLeft size={20} strokeWidth={1.5} />
            </button>
            <button onClick={onReset} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-zinc-800/50" 
                    style={{ color: COLORS.textSecondary }}>
              <ArrowLeft size={16} strokeWidth={1.5} /> <span className="hidden sm:inline">Back</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} 
                    className="p-1.5 sm:p-2 rounded-md disabled:opacity-30 transition-colors hover:bg-zinc-700/50" style={{ color: COLORS.textSecondary }}>
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <div className="px-2 sm:px-3 py-1 flex items-center gap-1.5">
              <span className="text-sm font-medium" style={{ color: COLORS.textPrimary }}>{currentPage + 1}</span>
              <span className="text-xs" style={{ color: COLORS.textSecondary }}>/ {solutions.length}</span>
            </div>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === solutions.length - 1} 
                    className="p-1.5 sm:p-2 rounded-md disabled:opacity-30 transition-colors hover:bg-zinc-700/50" style={{ color: COLORS.textSecondary }}>
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {hasAIPlan && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ backgroundColor: COLORS.bgDark }}>
                <BrainCircuit size={12} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
                <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>
                  AI ({aiPlannedPages})
                </span>
              </div>
            )}
            
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ backgroundColor: COLORS.bgDark }}>
              <Search size={14} style={{ color: COLORS.textSecondary }} strokeWidth={1.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-transparent outline-none w-24 text-xs"
                style={{ color: COLORS.textPrimary }}
              />
            </div>

            <div className="hidden sm:flex items-center gap-0.5 px-1.5 py-1 rounded-md" style={{ backgroundColor: COLORS.bgDark }}>
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1 rounded transition-colors hover:bg-zinc-700/50" style={{ color: COLORS.textSecondary }}>
                <ZoomOut size={14} strokeWidth={1.5} />
              </button>
              <span className="text-[10px] w-8 text-center" style={{ color: COLORS.textSecondary }}>{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1 rounded transition-colors hover:bg-zinc-700/50" style={{ color: COLORS.textSecondary }}>
                <ZoomIn size={14} strokeWidth={1.5} />
              </button>
            </div>

            <button onClick={() => handleDownload('clean')} className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-zinc-700/50" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
              <FileText size={14} strokeWidth={1.5} /> Clean
            </button>
            
            <button onClick={() => handleDownload('scan')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: COLORS.accent, color: COLORS.bgDark }}>
              <Scan size={14} strokeWidth={1.5} /> <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 flex flex-col items-end gap-3 no-print">
          <AnimatePresence>
            {showTools && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="p-4 rounded-xl shadow-lg mb-2 border" 
                style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}
              >
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-medium mb-2 flex items-center gap-1.5" style={{ color: COLORS.textSecondary }}>
                      <Pen size={10} strokeWidth={1.5} /> Ink
                    </label>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setPenThickness(p => Math.max(0.3, p - 0.1))} className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/50" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
                        <Minus size={12} strokeWidth={1.5} />
                      </button>
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                        <motion.div 
                          className="h-full rounded-full" 
                          animate={{ width: `${((penThickness - 0.3) / 0.7) * 100}%` }}
                          style={{ backgroundColor: COLORS.accent }} 
                        />
                      </div>
                      <button onClick={() => setPenThickness(p => Math.min(1.0, p + 0.1))} className="p-1.5 rounded-md transition-colors hover:bg-zinc-700/50" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
                        <Plus size={12} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-medium mb-2 block" style={{ color: COLORS.textSecondary }}>
                       Style
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { name: 'Neat', thickness: 0.45 },
                        { name: 'Natural', thickness: 0.6 },
                        { name: 'Heavy', thickness: 0.8 },
                        { name: 'Fine', thickness: 0.35 }
                      ].map(style => (
                        <button 
                          key={style.name}
                          onClick={() => setPenThickness(style.thickness)}
                          className="px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors"
                          style={{ 
                            backgroundColor: Math.abs(penThickness - style.thickness) < 0.05 ? COLORS.accent : COLORS.bgDark,
                            color: Math.abs(penThickness - style.thickness) < 0.05 ? COLORS.bgDark : COLORS.textSecondary,
                          }}
                        >
                          {style.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2">
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowTools(!showTools)} 
              className="p-3 sm:p-4 rounded-xl shadow-lg transition-all" 
              style={{ backgroundColor: showTools ? COLORS.accent : COLORS.bgCard, color: showTools ? COLORS.bgDark : COLORS.textSecondary }}
            >
              <Sliders size={18} strokeWidth={1.5} />
            </motion.button>
            
            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={toggleScanner} 
              className="p-3 sm:p-4 rounded-xl shadow-lg transition-all" 
              style={{ backgroundColor: isScannerMode ? COLORS.accent : COLORS.bgCard, color: isScannerMode ? COLORS.bgDark : COLORS.textSecondary }}
            >
              {isScannerMode ? <Eye size={18} strokeWidth={1.5} /> : <Sparkles size={18} strokeWidth={1.5} />}
            </motion.button>
            
            <motion.button 
              whileTap={{ scale: 0.95, rotate: 180 }}
              onClick={regenerate} 
              className="p-3 sm:p-4 rounded-xl shadow-lg transition-all" 
              style={{ backgroundColor: COLORS.accent, color: COLORS.bgDark }}
            >
              <RotateCcw size={18} strokeWidth={1.5} />
            </motion.button>
          </div>
        </div>

        <div ref={containerRef} className="w-full flex flex-col items-center pt-4 sm:pt-8 pb-20 sm:pb-24 px-2 sm:px-4">
          <div className="transition-transform origin-top" style={{ transform: `scale(${zoom / 100})` }}>
            <List<VirtualizedRowCustomProps>
              listRef={listRef}
              defaultHeight={containerHeight}
              rowCount={filteredSolutions.length}
              rowHeight={ITEM_HEIGHT}
              overscanCount={3}
              onRowsRendered={({ startIndex }) => {
                if (startIndex !== currentPage) setCurrentPage(startIndex);
              }}
              style={{ maxWidth: '21cm', margin: '0 auto', height: containerHeight }}
              rowComponent={VirtualizedRow}
              rowProps={{ filteredSolutions, globalSeed, penThickness, isScannerMode }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    const envKey = import.meta.env.VITE_API_KEY || import.meta.env.GOOGLE_API_KEY;
    if (envKey) {
      aiPlanningService.initialize(envKey);
      setApiKey(envKey);
    } else {
      const storedKey = localStorage.getItem('assignify_api_key');
      if (storedKey) aiPlanningService.initialize(storedKey);
    }
  }, []);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [appState, setAppState] = useState<AppState>('upload');
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [solutions, setSolutions] = useState<QuestionSolution[]>([]);
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('gemini_api_key') || '';
    }
    return '';
  });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    return () => { terminateWorker(); };
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  if (!isClient) return null;

  return (
    <div className="min-h-screen">
      {appState === 'upload' && (
        <UploadScreen onUpload={(file) => {
          setUploadedFile(file);
          setAppState('preview');
        }} />
      )}
      {appState === 'preview' && uploadedFile && (
        <PreviewScreen 
          file={uploadedFile} 
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          onConvert={(preview) => {
            setPreviewData(preview);
            setAppState('processing');
            // Advanced History Feature
            try {
              const history = JSON.parse(localStorage.getItem('assignify_history') || '[]');
              const newEntry = {
                id: Date.now(),
                name: uploadedFile.name,
                date: new Date().toISOString(),
                stats: preview.stats,
                thumbnail: preview.thumbnail.slice(0, 500) // Small snippet for preview
              };
              localStorage.setItem('assignify_history', JSON.stringify([newEntry, ...history].slice(0, 10)));
            } catch (e) {
              console.error('Failed to save history', e);
            }
          }}
          onBack={() => {
            setUploadedFile(null);
            setAppState('upload');
          }}
        />
      )}
      {appState === 'processing' && (
        <ProcessingScreen 
          previewData={previewData} 
          fileName={uploadedFile?.name || 'Document'}
          apiKey={apiKey}
          onComplete={(sols) => {
            setSolutions(sols);
            setAppState('results');
          }} 
        />
      )}
      {appState === 'results' && (
        <ResultsScreen solutions={solutions} onReset={() => {
          setUploadedFile(null);
          setPreviewData(null);
          setSolutions([]);
          setAppState('upload');
        }} />
      )}
    </div>
  );
};

export default App;
