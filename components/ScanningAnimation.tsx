import React, { useState, useEffect, useRef } from 'react';

interface ScanningAnimationProps {
  totalPages: number;
  currentPage: number;
  pageImages?: string[];
  extractedText?: string[];
  onComplete?: () => void;
}

const COLORS = {
  bgDark: '#2F313A',
  bgCard: '#3A3D47',
  border: '#4A4E5A',
  primaryGreen: '#6ED3B3',
  accentBlue: '#2F6FE4',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B5C0',
  scanLine: '#6ED3B3',
};

export const ScanningAnimation: React.FC<ScanningAnimationProps> = ({
  totalPages,
  currentPage,
  pageImages,
  extractedText,
  onComplete
}) => {
  const [scanPosition, setScanPosition] = useState(0);
  const [extractedChars, setExtractedChars] = useState<string[]>([]);
  const [glowIntensity, setGlowIntensity] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scanInterval = setInterval(() => {
      setScanPosition(prev => {
        if (prev >= 100) {
          return 0;
        }
        return prev + 2;
      });
    }, 30);

    return () => clearInterval(scanInterval);
  }, [currentPage]);

  useEffect(() => {
    setGlowIntensity(0.3 + Math.sin(Date.now() / 200) * 0.2);
    const glowInterval = setInterval(() => {
      setGlowIntensity(0.3 + Math.sin(Date.now() / 200) * 0.2);
    }, 50);
    return () => clearInterval(glowInterval);
  }, []);

  useEffect(() => {
    if (!extractedText || !extractedText[currentPage - 1]) return;
    
    const text = extractedText[currentPage - 1];
    const charInterval = setInterval(() => {
      setExtractedChars(prev => {
        if (prev.length >= Math.min(text.length, 100)) {
          return prev;
        }
        const nextChars = text.slice(0, prev.length + 3).split('');
        return nextChars;
      });
    }, 20);

    return () => {
      clearInterval(charInterval);
      setExtractedChars([]);
    };
  }, [currentPage, extractedText]);

  const currentImage = pageImages?.[currentPage - 1];

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div 
        className="relative rounded-2xl overflow-hidden shadow-2xl"
        style={{ 
          backgroundColor: COLORS.bgCard,
          boxShadow: `0 0 60px ${COLORS.primaryGreen}${Math.floor(glowIntensity * 100).toString(16).padStart(2, '0')}`
        }}
        ref={containerRef}
      >
        <div className="aspect-[3/4] relative bg-white">
          {currentImage ? (
            <img 
              src={currentImage} 
              alt={`Page ${currentPage}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#f5f5f5' }}>
              <div className="text-center p-8">
                <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" 
                  style={{ backgroundColor: COLORS.bgCard }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={COLORS.textSecondary}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: COLORS.textSecondary }}>
                  Page {currentPage}
                </p>
              </div>
            </div>
          )}

          <div 
            className="absolute left-0 right-0 h-1 z-10 transition-all"
            style={{ 
              top: `${scanPosition}%`,
              background: `linear-gradient(90deg, transparent, ${COLORS.scanLine}, transparent)`,
              boxShadow: `0 0 20px ${COLORS.scanLine}, 0 0 40px ${COLORS.scanLine}50`
            }}
          />

          <div 
            className="absolute left-0 right-0 z-5 pointer-events-none"
            style={{ 
              top: 0,
              height: `${scanPosition}%`,
              background: `linear-gradient(180deg, ${COLORS.primaryGreen}10, ${COLORS.primaryGreen}05)`,
            }}
          />

          <div className="absolute inset-0 pointer-events-none">
            <div 
              className="absolute top-2 left-2 w-8 h-8 border-l-2 border-t-2"
              style={{ borderColor: COLORS.primaryGreen }}
            />
            <div 
              className="absolute top-2 right-2 w-8 h-8 border-r-2 border-t-2"
              style={{ borderColor: COLORS.primaryGreen }}
            />
            <div 
              className="absolute bottom-2 left-2 w-8 h-8 border-l-2 border-b-2"
              style={{ borderColor: COLORS.primaryGreen }}
            />
            <div 
              className="absolute bottom-2 right-2 w-8 h-8 border-r-2 border-b-2"
              style={{ borderColor: COLORS.primaryGreen }}
            />
          </div>
        </div>

        <div className="p-4" style={{ backgroundColor: COLORS.bgDark }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: COLORS.primaryGreen }}
              />
              <span className="text-sm font-medium" style={{ color: COLORS.primaryGreen }}>
                Scanning
              </span>
            </div>
            <span className="text-sm font-bold" style={{ color: COLORS.textPrimary }}>
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <div 
            className="h-12 rounded-lg overflow-hidden font-mono text-xs p-2 leading-tight"
            style={{ backgroundColor: COLORS.bgCard, color: COLORS.textSecondary }}
          >
            <div className="flex flex-wrap">
              {extractedChars.map((char, i) => (
                <span 
                  key={i}
                  className="inline-block animate-fadeIn"
                  style={{ 
                    color: /[0-9]/.test(char) ? '#F59E0B' : 
                           /[A-Z]/.test(char) ? COLORS.primaryGreen : 
                           COLORS.textSecondary,
                    animationDelay: `${i * 10}ms`
                  }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
              <span className="animate-blink" style={{ color: COLORS.primaryGreen }}>|</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-2 mt-6">
        {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              i + 1 === currentPage ? 'scale-150' : 'opacity-50'
            }`}
            style={{ 
              backgroundColor: i + 1 <= currentPage ? COLORS.primaryGreen : COLORS.border 
            }}
          />
        ))}
        {totalPages > 10 && (
          <span className="text-xs ml-2" style={{ color: COLORS.textSecondary }}>
            +{totalPages - 10} more
          </span>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
      `}</style>
    </div>
  );
};

export default ScanningAnimation;
