import React from 'react';

interface PaperSheetProps {
  children: React.ReactNode;
  isScannerMode?: boolean;
}

export const PaperSheet: React.FC<PaperSheetProps> = ({ children, isScannerMode = false }) => {
  return (
    <div className={`relative w-full h-full bg-white shadow-2xl overflow-hidden transition-all duration-500 ${isScannerMode ? 'scanner-effect' : ''}`}>
      {/* Paper Texture & Lines */}
      <div className="absolute inset-0 pointer-events-none z-0">
         {/* Base Paper Color - slightly warm off-white */}
         <div className="absolute inset-0 bg-[#fdfdfd]"></div>

         {/* Paper Grain / Noise */}
         <div className="absolute inset-0 opacity-[0.03]"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}>
         </div>

         {/* Vertical Margin Line */}
         <div className="absolute top-0 bottom-0 left-[3rem] w-[1px] bg-red-400/30"></div>

         {/* Horizontal Lines */}
         <div className="absolute inset-0"
              style={{
                  backgroundImage: 'linear-gradient(#0099ff33 1px, transparent 1px)',
                  backgroundSize: '100% 2.6rem',
                  marginTop: '4rem' // Top margin
              }}>
         </div>
      </div>

      {/* Content Layer */}
      <div className="relative z-10 w-full h-full p-12 pl-16 pt-16">
        {children}
      </div>

      {/* Lighting / Shadow Overlay for Realism */}
      <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-br from-black/0 via-black/[0.02] to-black/[0.05]"></div>

      {/* Scanner Effects (Optional) */}
      {isScannerMode && (
         <div className="absolute inset-0 pointer-events-none z-30 mix-blend-multiply opacity-20 bg-[#e0e0e0]"></div>
      )}
    </div>
  );
};
