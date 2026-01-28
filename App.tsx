import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { List, useListRef } from 'react-window';
import type { CSSProperties } from 'react';
import { PaperSheet } from './components/PaperSheet';
import { FALLBACK_SOLUTIONS } from './constants';
import { 
  RefreshCcw, Camera, Eye, PenTool, Minus, Plus, UploadCloud, FileText, Loader, 
  ArrowLeft, Sparkles, ChevronLeft, ChevronRight, Search, ZoomIn, ZoomOut, 
  Keyboard, X, Menu, User, Home, Settings, HelpCircle, FileUp, Type, 
  Layers, CheckCircle, Clock, Zap, BarChart3, Download, Wand2, Image, Hash, FileDigit, Brain
} from 'lucide-react';
import { AppState, UploadedFile, QuestionSolution, PreviewData, ExtractionStats, LinePlan, WritingPlan, PagePlan } from './types';
import { extractPreviewData, processPreviewToSolutions, terminateWorker, OCRProgress } from './services/ocrService';
import { aiPlanningService } from './services/aiPlanningService';
import { ScanningAnimation } from './components/ScanningAnimation';

const COLORS = {
  bgDark: '#2F313A',
  bgCard: '#3A3D47',
  border: '#4A4E5A',
  primaryGreen: '#6ED3B3',
  primaryGreenBright: '#7FD39A',
  accentBlue: '#2F6FE4',
  accentTeal: '#2E8CA4',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B5C0',
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
  
  const baselineDrift = gaussianRandom(seed + 100, 0, 0.8);
  const numericYDrift = numericStyle ? numericStyle.yDrift : 0;
  const yOffset = baselineWave + baselineDrift + numericYDrift + randomRange(seed + 1, -0.3, 0.3);
  
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
  const tools = [
    { id: 'handwriting', icon: Type, label: 'Handwriting Generator' },
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'history', icon: Clock, label: 'History' },
    { id: 'settings', icon: Settings, label: 'Settings' },
    { id: 'help', icon: HelpCircle, label: 'Help & Support' },
  ];

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed left-0 top-0 h-full w-64 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
        style={{ backgroundColor: COLORS.bgCard }}
      >
        <div className="p-6 border-b" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
              <Type size={24} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg" style={{ color: COLORS.textPrimary }}>Assignify</h1>
              <p className="text-xs" style={{ color: COLORS.textSecondary }}>Handwriting Generator</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {tools.map(tool => (
            <button
              key={tool.id}
              onClick={() => { onToolChange(tool.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentTool === tool.id ? 'text-white' : ''}`}
              style={{ 
                backgroundColor: currentTool === tool.id ? COLORS.primaryGreen : 'transparent',
                color: currentTool === tool.id ? '#fff' : COLORS.textSecondary,
              }}
            >
              <tool.icon size={20} />
              <span className="font-medium">{tool.label}</span>
            </button>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{ borderColor: COLORS.border }}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: COLORS.bgDark }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.accentTeal}, ${COLORS.accentBlue})` }}>
              <User size={20} className="text-white" />
            </div>
            <div>
              <p className="font-medium text-sm" style={{ color: COLORS.textPrimary }}>Guest User</p>
              <p className="text-xs" style={{ color: COLORS.textSecondary }}>Free Plan</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

const Header: React.FC<{ onMenuClick: () => void; title: string }> = ({ onMenuClick, title }) => (
  <header className="h-16 flex items-center justify-between px-6 border-b" style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}>
    <div className="flex items-center gap-4">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg transition-colors" style={{ color: COLORS.textSecondary }}>
        <Menu size={24} />
      </button>
      <h2 className="text-xl font-semibold" style={{ color: COLORS.textPrimary }}>{title}</h2>
    </div>
    <div className="flex items-center gap-3">
      <button className="p-2 rounded-lg transition-colors" style={{ color: COLORS.textSecondary }}>
        <Settings size={20} />
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
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="rounded-2xl p-6" style={{ backgroundColor: COLORS.bgCard }}>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
                  <FileUp size={24} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold" style={{ color: COLORS.textPrimary }}>Upload Document</h3>
                  <p className="text-sm" style={{ color: COLORS.textSecondary }}>Upload your assignment PDF or image to convert to handwriting</p>
                </div>
              </div>

              <div 
                onDragEnter={() => setDragActive(true)}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
                onClick={() => !isLoading && inputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl h-64 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden`}
                style={{ 
                  borderColor: dragActive ? COLORS.primaryGreen : COLORS.border,
                  backgroundColor: dragActive ? `${COLORS.primaryGreen}10` : COLORS.bgDark,
                }}
              >
                {isLoading ? (
                  <div className="text-center z-10">
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
                      <Loader className="animate-spin text-white" size={40} />
                    </div>
                    <p className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>Loading Document...</p>
                    <p className="text-sm" style={{ color: COLORS.textSecondary }}>Please wait</p>
                  </div>
                ) : (
                  <div className="text-center z-10">
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${COLORS.primaryGreen}15` }}>
                      <UploadCloud size={40} style={{ color: COLORS.primaryGreen }} />
                    </div>
                    <p className="text-lg font-medium mb-2" style={{ color: COLORS.textPrimary }}>
                      {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
                    </p>
                    <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>or click to browse</p>
                    <div className="flex gap-2 justify-center">
                      {['PDF', 'JPG', 'PNG', 'WEBP'].map(ext => (
                        <span key={ext} className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: COLORS.bgCard, color: COLORS.textSecondary }}>
                          {ext}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <input type="file" ref={inputRef} className="hidden" accept=".pdf,image/*" onChange={(e) => handleFiles(e.target.files)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: Zap, title: 'Fast Processing', desc: 'OCR powered text extraction' },
                { icon: Layers, title: 'Natural Handwriting', desc: 'Realistic pen stroke simulation' },
                { icon: Download, title: 'Export Ready', desc: 'Print or save as PDF' },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-5" style={{ backgroundColor: COLORS.bgCard }}>
                  <div className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center" style={{ backgroundColor: `${COLORS.primaryGreen}15` }}>
                    <item.icon size={20} style={{ color: COLORS.primaryGreen }} />
                  </div>
                  <h4 className="font-semibold mb-1" style={{ color: COLORS.textPrimary }}>{item.title}</h4>
                  <p className="text-sm" style={{ color: COLORS.textSecondary }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
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
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all" style={{ backgroundColor: COLORS.bgCard, color: COLORS.textSecondary }}>
              <ArrowLeft size={18} /> Back to Upload
            </button>

            {isExtracting ? (
              <div className="rounded-2xl p-8" style={{ backgroundColor: COLORS.bgCard }}>
                <div className="text-center">
                  <div className="w-24 h-24 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
                    <Loader className="animate-spin text-white" size={48} />
                  </div>
                  <h3 className="text-2xl font-bold mb-2" style={{ color: COLORS.textPrimary }}>Extracting Content</h3>
                  <p className="mb-6" style={{ color: COLORS.textSecondary }}>{extractStatus}</p>
                  
                  <div className="max-w-md mx-auto">
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: COLORS.textSecondary }}>Progress</span>
                      <span className="font-bold" style={{ color: COLORS.primaryGreen }}>{extractProgress}%</span>
                    </div>
                    <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                      <div 
                        className="h-full transition-all duration-300 rounded-full"
                        style={{ width: `${extractProgress}%`, background: `linear-gradient(90deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : previewData && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="rounded-2xl p-6 flex flex-col items-center" style={{ backgroundColor: COLORS.bgCard }}>
                    <h4 className="text-sm font-medium mb-4" style={{ color: COLORS.textSecondary }}>Document Preview</h4>
                    {previewData.thumbnail ? (
                      <img 
                        src={previewData.thumbnail} 
                        alt="Document preview" 
                        className="w-full max-w-[200px] rounded-xl border-2 shadow-lg"
                        style={{ borderColor: COLORS.border }}
                      />
                    ) : (
                      <div className="w-full max-w-[200px] h-[280px] rounded-xl flex items-center justify-center" style={{ backgroundColor: COLORS.bgDark }}>
                        <FileText size={48} style={{ color: COLORS.textSecondary }} />
                      </div>
                    )}
                    <p className="mt-4 text-sm font-medium truncate max-w-full" style={{ color: COLORS.textPrimary }}>{file.name}</p>
                  </div>

                  <div className="lg:col-span-2 rounded-2xl p-6" style={{ backgroundColor: COLORS.bgCard }}>
                    <h4 className="text-sm font-medium mb-4" style={{ color: COLORS.textSecondary }}>Extraction Statistics</h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {[
                        { icon: Type, label: 'Characters', value: formatNumber(previewData.stats.totalCharacters), color: COLORS.primaryGreen },
                        { icon: FileText, label: 'Words', value: formatNumber(previewData.stats.totalWords), color: COLORS.accentBlue },
                        { icon: Hash, label: 'Numbers', value: formatNumber(previewData.stats.totalNumbers), color: '#F59E0B' },
                        { icon: Layers, label: 'Pages', value: String(previewData.stats.totalPages), color: '#EC4899' },
                      ].map((stat, i) => (
                        <div key={i} className="p-4 rounded-xl text-center" style={{ backgroundColor: COLORS.bgDark }}>
                          <stat.icon size={20} className="mx-auto mb-2" style={{ color: stat.color }} />
                          <p className="text-2xl font-bold" style={{ color: COLORS.textPrimary }}>{stat.value}</p>
                          <p className="text-xs" style={{ color: COLORS.textSecondary }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {previewData.stats.extractedImages.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Image size={16} style={{ color: COLORS.primaryGreen }} />
                          <span className="text-sm font-medium" style={{ color: COLORS.textSecondary }}>
                            {previewData.stats.extractedImages.length} Image{previewData.stats.extractedImages.length > 1 ? 's' : ''} Detected
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {previewData.stats.extractedImages.slice(0, 5).map((img, i) => (
                            <img 
                              key={i} 
                              src={img.dataUrl} 
                              alt={`Extracted ${i + 1}`}
                              className="h-16 w-16 object-cover rounded-lg border"
                              style={{ borderColor: COLORS.border }}
                            />
                          ))}
                          {previewData.stats.extractedImages.length > 5 && (
                            <div className="h-16 w-16 rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS.bgDark }}>
                              <span className="text-sm font-medium" style={{ color: COLORS.textSecondary }}>
                                +{previewData.stats.extractedImages.length - 5}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl p-6" style={{ backgroundColor: COLORS.bgCard }}>
                  <h4 className="text-sm font-medium mb-4" style={{ color: COLORS.textSecondary }}>Extracted Text Preview</h4>
                  <div 
                    className="p-4 rounded-xl max-h-48 overflow-y-auto text-sm leading-relaxed font-mono"
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

                <div className="rounded-2xl p-6 mb-4" style={{ backgroundColor: COLORS.bgCard }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: localApiKey ? `${COLORS.primaryGreen}20` : `${COLORS.accentBlue}20` }}>
                        <Brain size={20} style={{ color: localApiKey ? COLORS.primaryGreen : COLORS.accentBlue }} />
                      </div>
                      <div>
                        <h4 className="font-medium" style={{ color: COLORS.textPrimary }}>AI Layout Planning</h4>
                        <p className="text-xs" style={{ color: COLORS.textSecondary }}>
                          {localApiKey ? 'Gemini AI enabled' : 'Optional: Add API key for smarter layout'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowApiInput(!showApiInput)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
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
                        className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2"
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
                          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                          style={{ backgroundColor: COLORS.primaryGreen }}
                        >
                          Save Key
                        </button>
                        <button
                          onClick={() => {
                            setLocalApiKey('');
                            onApiKeyChange?.('');
                          }}
                          className="px-4 py-2 rounded-lg text-sm"
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
                  className="w-full py-5 rounded-2xl flex items-center justify-center gap-3 text-xl font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl"
                  style={{ 
                    background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})`,
                    boxShadow: `0 10px 40px ${COLORS.primaryGreen}40`
                  }}
                >
                  <Wand2 size={28} />
                  Magic Convert to Handwriting
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
    { label: 'Page Scanning', icon: FileText, done: currentPhase !== 'scanning', active: currentPhase === 'scanning' },
    { label: 'AI Planning', icon: Brain, done: currentPhase === 'writing', active: currentPhase === 'planning' },
    { label: 'Handwriting', icon: Type, done: progress >= 100, active: currentPhase === 'writing' },
  ];

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: COLORS.bgDark }}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} currentTool="handwriting" onToolChange={() => {}} />
      
      <div className="flex-1 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} title="Processing Document" />
        
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl p-6" style={{ backgroundColor: COLORS.bgCard }}>
                {currentPhase === 'scanning' && previewData && (
                  <ScanningAnimation
                    totalPages={previewData.stats.totalPages}
                    currentPage={currentScanPage}
                    extractedText={previewData.extractedText}
                    pageImages={previewData.stats.extractedImages.map(img => img.dataUrl)}
                  />
                )}
                
                {currentPhase === 'planning' && (
                  <div className="text-center py-12">
                    <div className="w-24 h-24 rounded-2xl mx-auto mb-6 flex items-center justify-center relative" 
                      style={{ background: `linear-gradient(135deg, ${COLORS.accentBlue}, ${COLORS.primaryGreen})` }}>
                      <Brain className="text-white animate-pulse" size={48} />
                      <div className="absolute inset-0 rounded-2xl animate-ping opacity-20"
                        style={{ backgroundColor: COLORS.accentBlue }} />
                    </div>
                    <h3 className="text-xl font-bold mb-2" style={{ color: COLORS.textPrimary }}>AI Planning Layout</h3>
                    <p className="text-sm mb-4" style={{ color: COLORS.textSecondary }}>{aiPlanStatus}</p>
                    <div className="flex flex-wrap gap-2 justify-center text-xs">
                      {['Line breaks', 'Word spacing', 'Fractions', 'Q/A positions', 'Margins'].map((item, i) => (
                        <span key={i} className="px-3 py-1 rounded-full" 
                          style={{ backgroundColor: COLORS.bgDark, color: COLORS.primaryGreen }}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {currentPhase === 'writing' && (
                  <div className="text-center py-8">
                    <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center" 
                      style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
                      <PenTool className="text-white" size={36} />
                    </div>
                    <h3 className="text-xl font-bold mb-2" style={{ color: COLORS.textPrimary }}>Writing Pages</h3>
                    <p className="text-sm" style={{ color: COLORS.textSecondary }}>
                      Generating human-like handwriting with micro-variations...
                    </p>
                    
                    <div className="mt-6 grid grid-cols-3 gap-3">
                      {[
                        { label: 'Letters', value: stats.letters },
                        { label: 'Speed', value: `${stats.speed}/s` },
                        { label: 'Pages', value: stats.pages },
                      ].map((stat, i) => (
                        <div key={i} className="p-3 rounded-xl" style={{ backgroundColor: COLORS.bgDark }}>
                          <p className="text-lg font-bold" style={{ color: COLORS.primaryGreen }}>{stat.value}</p>
                          <p className="text-xs" style={{ color: COLORS.textSecondary }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-6" style={{ backgroundColor: COLORS.bgCard }}>
                <h4 className="text-sm font-medium mb-4" style={{ color: COLORS.textSecondary }}>Processing Progress</h4>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: COLORS.textSecondary }}>{currentStatus}</span>
                    <span className="font-bold" style={{ color: COLORS.primaryGreen }}>{progress}%</span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                    <div 
                      className="h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {stages.map((stage, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-xl transition-all"
                      style={{ backgroundColor: stage.active ? `${COLORS.primaryGreen}10` : COLORS.bgDark }}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all`}
                        style={{ 
                          backgroundColor: stage.done ? COLORS.primaryGreen : stage.active ? COLORS.accentBlue : COLORS.border,
                        }}>
                        {stage.done ? (
                          <CheckCircle size={20} className="text-white" />
                        ) : stage.active ? (
                          <Loader size={20} className="text-white animate-spin" />
                        ) : (
                          <stage.icon size={20} style={{ color: COLORS.textSecondary }} />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium" style={{ color: stage.done || stage.active ? COLORS.textPrimary : COLORS.textSecondary }}>
                          {stage.label}
                        </p>
                        <p className="text-xs" style={{ color: COLORS.textSecondary }}>
                          {stage.done ? 'Completed' : stage.active ? 'In progress...' : 'Waiting'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-xl" style={{ backgroundColor: COLORS.bgDark }}>
                  <p className="text-xs font-medium mb-2" style={{ color: COLORS.textSecondary }}>Processing: {fileName}</p>
                  <div className="flex gap-4 text-xs">
                    <span style={{ color: COLORS.primaryGreen }}>
                      {previewData?.stats.totalPages || 0} pages
                    </span>
                    <span style={{ color: COLORS.accentBlue }}>
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
            <Brain size={12} />
            <span>AI-planned layout</span>
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
    <div className="flex min-h-screen" style={{ backgroundColor: '#e5e5e5' }}>
      <div className="fixed left-0 top-0 h-full w-64 z-50 hidden lg:block" style={{ backgroundColor: COLORS.bgCard }}>
        <Sidebar isOpen={true} onClose={() => {}} currentTool="handwriting" onToolChange={() => {}} />
      </div>

      <div className="flex-1 lg:ml-64">
        <div className="sticky top-0 z-40 h-16 flex items-center justify-between px-6 border-b no-print" style={{ backgroundColor: COLORS.bgCard, borderColor: COLORS.border }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2" style={{ color: COLORS.textSecondary }}>
              <Menu size={24} />
            </button>
            <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
              <ArrowLeft size={18} /> Back
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0} className="p-2 rounded-lg disabled:opacity-30" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textPrimary }}>
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
              <span style={{ color: COLORS.textSecondary }}>Page </span>
              <span className="font-bold" style={{ color: COLORS.textPrimary }}>{currentPage + 1}</span>
              <span style={{ color: COLORS.textSecondary }}> / {solutions.length}</span>
            </div>
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === solutions.length - 1} className="p-2 rounded-lg disabled:opacity-30" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textPrimary }}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {hasAIPlan && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${COLORS.primaryGreen}20` }}>
                <Brain size={14} style={{ color: COLORS.primaryGreen }} />
                <span className="text-xs font-medium" style={{ color: COLORS.primaryGreen }}>
                  AI Layout ({aiPlannedPages} pages)
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
              <Search size={16} style={{ color: COLORS.textSecondary }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="bg-transparent outline-none w-32 text-sm"
                style={{ color: COLORS.textPrimary }}
              />
            </div>

            <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ backgroundColor: COLORS.bgDark }}>
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1" style={{ color: COLORS.textSecondary }}>
                <ZoomOut size={16} />
              </button>
              <span className="text-xs w-10 text-center" style={{ color: COLORS.textSecondary }}>{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(150, z + 10))} className="p-1" style={{ color: COLORS.textSecondary }}>
                <ZoomIn size={16} />
              </button>
            </div>

            <button onClick={() => handleDownload('clean')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
              <FileText size={16} /> Clean
            </button>
            
            <button onClick={() => handleDownload('scan')} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
              <Camera size={16} /> Scanned
            </button>
          </div>
        </div>

        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4 no-print">
          {showTools && (
            <div className="p-4 rounded-2xl shadow-xl mb-2" style={{ backgroundColor: COLORS.bgCard }}>
              <label className="text-xs font-medium mb-3 flex items-center gap-2" style={{ color: COLORS.textSecondary }}>
                <PenTool size={12} /> Ink Flow
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => setPenThickness(p => Math.max(0.3, p - 0.1))} className="p-2 rounded-lg" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
                  <Minus size={14} />
                </button>
                <div className="w-24 h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.bgDark }}>
                  <div className="h-full transition-all" style={{ width: `${((penThickness - 0.3) / 0.7) * 100}%`, background: `linear-gradient(90deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }} />
                </div>
                <button onClick={() => setPenThickness(p => Math.min(1.0, p + 0.1))} className="p-2 rounded-lg" style={{ backgroundColor: COLORS.bgDark, color: COLORS.textSecondary }}>
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setShowTools(!showTools)} className="p-4 rounded-full shadow-xl transition-all text-white" style={{ background: showTools ? COLORS.primaryGreen : COLORS.bgCard }}>
              <PenTool size={22} />
            </button>
            <button onClick={toggleScanner} className="p-4 rounded-full shadow-xl transition-all text-white" style={{ background: isScannerMode ? COLORS.primaryGreen : COLORS.bgCard }}>
              {isScannerMode ? <Eye size={22} /> : <Sparkles size={22} />}
            </button>
            <button onClick={regenerate} className="p-4 rounded-full shadow-xl transition-all text-white" style={{ background: `linear-gradient(135deg, ${COLORS.primaryGreen}, ${COLORS.accentBlue})` }}>
              <RefreshCcw size={22} />
            </button>
          </div>
        </div>

        <div ref={containerRef} className="w-full flex flex-col items-center pt-8 pb-24">
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
