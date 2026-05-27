'use client';

import React from 'react';

export default function ParticleBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1] opacity-45 dark:opacity-25 transition-opacity duration-1000">
      {/* Blob 1: Moss/Green Morandi */}
      <div 
        className="absolute top-[-5%] left-[-5%] w-[45vw] h-[45vw] rounded-full bg-gradient-to-tr from-[#6C7D70]/18 to-[#8FA393]/8 blur-[90px] animate-float-slow"
      />
      {/* Blob 2: Warm Clay/Oatmeal Morandi */}
      <div 
        className="absolute bottom-[5%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-gradient-to-br from-[#E2D5C3]/20 to-[#C6B3A0]/10 blur-[110px] animate-float-medium"
      />
      {/* Blob 3: Soft Slate/Mist Morandi */}
      <div 
        className="absolute top-[35%] right-[20%] w-[35vw] h-[35vw] rounded-full bg-gradient-to-tr from-[#B2C0B6]/15 to-[#D3DCD5]/10 blur-[80px] animate-float-fast"
      />
    </div>
  );
}
