import React from 'react';

interface PaperSheetProps {
  children: React.ReactNode;
  className?: string;
  isScannerMode?: boolean;
}

export const PaperSheet: React.FC<PaperSheetProps> = ({ children, className = '', isScannerMode = false }) => {
  return (
    <div className={`relative transition-all duration-500 ease-in-out ${isScannerMode ? 'p-4' : 'p-0'}`}>
      <div 
        className={`relative w-full max-w-[21cm] mx-auto overflow-hidden bg-white ${className} ${isScannerMode ? 'scanner-mode' : 'shadow-2xl'}`}
        style={{
          minHeight: '29.7cm', // A4 height
          // Base texture
          backgroundColor: isScannerMode ? '#f0f0f0' : '#ffffff',
          filter: isScannerMode ? 'contrast(1.3) brightness(1.05) grayscale(0.1)' : 'none',
          transform: isScannerMode ? 'rotate(-0.5deg) scale(0.98)' : 'none',
          boxShadow: isScannerMode ? '5px 10px 15px rgba(0,0,0,0.3)' : '0 10px 30px rgba(0,0,0,0.5)',
        }}
      >
        {/* --- PAPER TEXTURE (Cleaner for Topper look, Grainy for Scanner) --- */}
        {!isScannerMode && (
           <div className="absolute inset-0 opacity-20 pointer-events-none z-0"
              style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.1'/%3E%3C/svg%3E")`,
              }}
           />
        )}
        
        {/* Scanner Dust/Noise Overlay */}
        {isScannerMode && (
            <div className="absolute inset-0 pointer-events-none z-50 opacity-40 mix-blend-multiply"
                 style={{
                     backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                     filter: 'contrast(150%)'
                 }}
            />
        )}

        {/* --- NOTEBOOK LINES LAYER --- */}
        <div className="absolute inset-0 pointer-events-none z-0"
             style={{
               // Sharper lines for topper look
               backgroundImage: 'linear-gradient(to bottom, transparent 2.35rem, #a1aebf 2.35rem, #a1aebf 2.4rem, transparent 2.4rem)',
               backgroundSize: '100% 2.4rem', 
               backgroundPosition: '0 4rem', 
               opacity: isScannerMode ? 0.8 : 0.5
             }}>
        </div>

        {/* --- MARGIN LINES (Red/Pink) --- */}
        <div className={`absolute top-0 bottom-0 left-[3.5rem] w-[4px] border-l border-r border-red-500/40 z-0 h-full ${isScannerMode ? 'contrast-125' : ''}`}></div>
        
        {/* Top Header Margin */}
        <div className="absolute top-0 w-full h-[4rem] border-b-[1.5px] border-red-500/40 z-0 bg-transparent"></div>

        {/* Page Info Header */}
        <div className="absolute top-4 right-8 z-10 opacity-70">
          <div className="flex flex-col gap-1 items-end">
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-sans font-bold text-gray-500 uppercase tracking-widest">Page No.</span>
               <div className="w-12 border-b border-gray-400"></div>
             </div>
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-sans font-bold text-gray-500 uppercase tracking-widest">Date</span>
               <div className="w-16 border-b border-gray-400"></div>
             </div>
          </div>
        </div>

        {/* --- CONTENT CONTAINER --- */}
        <div className={`relative z-10 pl-[5rem] pr-8 pt-[4.2rem] pb-10 ${isScannerMode ? 'contrast-125' : ''}`}>
          {children}
        </div>

        {/* --- SHADOW OVERLAY (Spine) - Only in clean mode --- */}
        {!isScannerMode && (
             <div className="absolute top-0 left-0 bottom-0 w-12 bg-gradient-to-r from-gray-500/10 to-transparent pointer-events-none z-20"></div>
        )}
        
        {/* --- VIGNETTE (Scanner Effect) --- */}
        {isScannerMode && (
           <div className="absolute inset-0 pointer-events-none z-40"
             style={{
               background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.1) 90%, rgba(0,0,0,0.2) 100%)'
             }}
           ></div>
        )}
      </div>
    </div>
  );
};