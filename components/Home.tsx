import React, { useRef, useState, useEffect } from 'react';
import { getTranslation } from '../translations';
import BentoBox from './BentoBox';
import CrabProgressBar from './CrabProgressBar';
import AnimatedText from './AnimatedText';
import DocReader from './DocReader';
import { RuntimeMode } from '../types';

interface Props {
  onImageUpload: (files: File[]) => void;
  systemLanguage?: string;
  isAnalyzing?: boolean;
  analysisProgress?: number;
  onLanguageChange?: (lang: string) => void;
  runtimeMode?: RuntimeMode;
  onRuntimeModeChange?: (mode: RuntimeMode) => void;
  onOpenSettings: () => void;
}

const Home: React.FC<Props> = ({ onImageUpload, systemLanguage, isAnalyzing = false, analysisProgress = 0, onLanguageChange, runtimeMode = 'demo', onRuntimeModeChange, onOpenSettings }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const t = getTranslation(systemLanguage);

  useEffect(() => {
    // Reveal animation sequence
    const timer = setTimeout(() => setShowSubtitle(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Typing animation state
  const typingWords = ["close-up", "red", "horror", "two-shot"];
  const [typingText, setTypingText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentWord = typingWords[wordIndex];
    const typeSpeed = isDeleting ? 50 : 150;
    const holdTime = 1000;

    if (!isDeleting && typingText === currentWord) {
      const timeout = setTimeout(() => setIsDeleting(true), holdTime);
      return () => clearTimeout(timeout);
    } else if (isDeleting && typingText === "") {
      setIsDeleting(false);
      setWordIndex((prev) => (prev + 1) % typingWords.length);
      return;
    }

    const timer = setTimeout(() => {
      const nextText = currentWord.substring(0, typingText.length + (isDeleting ? -1 : 1));
      setTypingText(nextText);
    }, typeSpeed);

    return () => clearTimeout(timer);
  }, [typingText, isDeleting, wordIndex]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageUpload(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImageUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
    } catch (err) {
      console.error(err);
      alert(t.errCamera);
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            onImageUpload([new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" })]);
            stopCamera();
          }
        }, 'image/jpeg', 0.9);
      }
    }
  };

  // Tag list for Deep Visual Mining (Localized)
  const miningTags = t.miningTags || [
    "Subject", "Environment", "Composition", "Lighting", "Mood", "Style",
    "Inspiration Site", "Text & Font", "Material & Texture", "Camera & Lens"
  ];

  // Language list for Multilanguage Support
  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'zh', name: 'Chinese', native: '中文' },
    { code: 'es', name: 'Spanish', native: 'Español' },
    { code: 'ja', name: 'Japanese', native: '日本語' },
    { code: 'fr', name: 'French', native: 'Français' },
    { code: 'de', name: 'German', native: 'Deutsch' },
    { code: 'kr', name: 'Korean', native: '한국어' },
  ];

  // Search keywords
  const searchKeywords = t.searchKeywords || ["Horror", "Close-up", "Red", "Cover Design"];

  // Helper to check if a language is active
  const isLangActive = (langName: string) => {
    // Basic check: if systemLanguage contains language name or starts with it
    const current = systemLanguage || 'English';
    return current.toLowerCase().includes(langName.toLowerCase());
  };

  // Helper for dynamic title size based on language
  const getHomeMainTitleSize = (lang: string) => {
    // English defaults
    // Chinese: Larger (User request)
    // Others (ES, DE, FR, JA, KR): Smaller to prevent wrap
    if (!lang) return "text-7xl xl:text-7xl"; // Default fallback
    if (lang.includes('Chinese')) return "text-7xl xl:text-8xl";
    if (lang.includes('English')) return "text-7xl xl:text-7xl";
    return "text-5xl xl:text-6xl";
  };

  const getHomeSubtitleSize = (lang: string) => {
    if (!lang) return "text-4xl xl:text-5xl"; // Default fallback
    if (lang.includes('Chinese')) return "text-5xl xl:text-6xl";
    if (lang.includes('English')) return "text-4xl xl:text-5xl";
    return "text-3xl xl:text-4xl";
  };

  return (
    <>
      {/* Camera Overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-[fadeIn_0.3s_ease-out]">
          <div className="relative flex-1 bg-black overflow-hidden">
            <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <div className="h-32 bg-black/80 backdrop-blur-sm flex items-center justify-center gap-12 pb-safe">
            <button onClick={stopCamera} className="p-4 bg-stone-800/50 rounded-full text-white hover:bg-stone-700/50 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-4 border-stone-300 shadow-[0_0_0_4px_rgba(255,255,255,0.3)] active:scale-95 transition-transform" />
            <div className="w-14" />
          </div>
        </div>
      )}

      {/* ===================== MOBILE LAYOUT (Default) ===================== */}
      <div className="md:hidden p-6 flex flex-col items-center justify-center min-h-[90vh] text-center pt-32 bg-cream">
        <h2 className="text-4xl font-black text-stone-800 mb-2 tracking-tight animate-[fadeInUp_0.8s_ease-out]">{t.homeMainTitle || 'Vision to Prompt'}</h2>
        <p className={`text-2xl font-bold text-stone-500 mb-12 transition-opacity duration-1000 ${showSubtitle ? 'opacity-100' : 'opacity-0'}`}>
          {t.homeSubtitle1 || 'Turn Visual Inspiration'} {t.homeSubtitle2 || 'into Prompt Library'}
        </p>
        <div className="w-full max-w-sm mb-6 grid grid-cols-2 gap-2">
          <button
            onClick={() => onRuntimeModeChange?.('demo')}
            className={`rounded-xl px-3 py-2 text-sm font-bold border transition-all ${runtimeMode === 'demo' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-700 border-stone-200'}`}
          >
            免费试用
          </button>
          <button
            onClick={() => onRuntimeModeChange?.('api')}
            className={`rounded-xl px-3 py-2 text-sm font-bold border transition-all ${runtimeMode === 'api' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-700 border-stone-200'}`}
          >
            自定义API
          </button>
        </div>

        {isAnalyzing ? (
          <div className="w-full max-w-sm px-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="bg-white p-6 rounded-3xl border-2 border-stone-100 shadow-sm flex flex-col items-center gap-4">
              <CrabProgressBar
                progress={analysisProgress}
                isComplete={analysisProgress >= 100}
                trackColor="bg-stone-200"
                fillColor="bg-stone-800"
              />
              <p className="text-stone-500 font-bold text-sm animate-pulse">{t.analyzing || 'Analyzing...'}</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-5 w-full max-w-sm px-4 animate-[fadeIn_0.3s_ease-out]">
            <button
              onClick={startCamera}
              className="flex-1 aspect-square bg-stone-800 text-white rounded-3xl shadow-pop-sm active:scale-95 transition-all flex flex-col items-center justify-center gap-2 hover:bg-stone-700 hover:-translate-y-1"
              aria-label={t.btnCamera}
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 aspect-square bg-white text-stone-800 border-2 border-stone-100 rounded-3xl shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center gap-2 hover:border-softblue hover:text-softblue hover:-translate-y-1"
              aria-label={t.btnUpload}
            >
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </button>
          </div>
        )}

        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
      </div>

      {/* ===================== DESKTOP GRID LAYOUT ===================== */}
      <div className="hidden md:grid grid-cols-12 gap-6 px-10 py-8 pt-40 min-h-screen bg-[#FDFBF7] max-w-[1600px] mx-auto overflow-auto pb-24">

        {/* 1. TOP SECTION: Title (Left 6) + Upload (Right 6) */}
        {/* ROW 1 */}
        <div className="col-span-12 grid grid-cols-12 gap-6 min-h-[300px]">
          {/* TITLE AREA (Col 6) */}
          <div className="col-span-6 flex flex-col justify-center px-4 items-end text-right">
            <AnimatedText
              key={`main-title-${systemLanguage}`}
              text={t.homeMainTitle || 'Vision to Prompt'}
              as="h1"
              className={`${getHomeMainTitleSize(systemLanguage)} font-black text-stone-900 tracking-tight leading-none mb-4`}
              baseDelay={0.2}
              staggerDelay={0.04}
            />
            <AnimatedText
              key={`subtitle1-${systemLanguage}`}
              text={t.homeSubtitle1 || 'Turn Visual Inspiration'}
              as="h2"
              className={`${getHomeSubtitleSize(systemLanguage)} font-black text-stone-400 tracking-tight leading-snug mb-2`}
              baseDelay={0.6}
              staggerDelay={0.03}
            />
            <AnimatedText
              key={`subtitle2-${systemLanguage}`}
              text={t.homeSubtitle2 || 'into Prompt Library'}
              as="h2"
              className={`${getHomeSubtitleSize(systemLanguage)} font-black text-stone-400 tracking-tight leading-snug`}
              baseDelay={1.0}
              staggerDelay={0.03}
            />
            <div className="mt-8 inline-flex items-center gap-2 bg-white border-2 border-stone-200 rounded-full p-1">
              <button
                onClick={() => onRuntimeModeChange?.('demo')}
                className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wider transition-all ${runtimeMode === 'demo' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              >
                免费试用
              </button>
              <button
                onClick={() => onRuntimeModeChange?.('api')}
                className={`px-4 py-1.5 rounded-full text-xs font-black tracking-wider transition-all ${runtimeMode === 'api' ? 'bg-stone-800 text-white' : 'text-stone-600 hover:text-stone-800'}`}
              >
                自定义API
              </button>
            </div>
          </div>

          {/* UPLOAD BOX (Col 6) */}
          <div className="col-span-6">
            <BentoBox
              bgColor={isDragOver ? 'bg-[#FDE68A]' : 'bg-[#FCD34D]'} // lighter yellow
              className={`h-full border-none flex flex-col items-center justify-center cursor-pointer relative group transition-all duration-300 shadow-[8px_8px_0px_0px_#B45309] hover:shadow-[12px_12px_0px_0px_#B45309] hover:-translate-y-1 ${isDragOver ? 'scale-[1.02]' : ''}`}
              onClick={() => !isAnalyzing && fileInputRef.current?.click()}
            >
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center gap-6 w-full max-w-md px-8 animate-in fade-in zoom-in duration-300">
                  <div className="w-full">
                    <CrabProgressBar
                      progress={analysisProgress}
                      isComplete={analysisProgress >= 100}
                      trackColor="bg-stone-900/10"
                      fillColor="bg-stone-900"
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-8"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-10 h-10 text-stone-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  </div>
                  <p className="text-3xl font-bold text-stone-900 mb-2">{isDragOver ? t.uploadDropIt : t.uploadDropHere}</p>
                  <p className="text-stone-700/60 font-medium text-lg mb-8">{t.uploadClickBrowse}</p>

                </div>
              )}
            </BentoBox>
          </div>
        </div>

        {/* 2. FEATURE AREA - ROW 1 (3 items, 4 cols each) */}
        {/* Features: Structured, Insight, Library */}
        <div className="col-span-12 xl:col-span-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1 h-full min-h-[200px]">
            <BentoBox bgColor="bg-[#3D5A3D]" className="h-full border-none shadow-[8px_8px_0px_0px_#6B8E6B] hover:shadow-[12px_12px_0px_0px_#6B8E6B] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <div>
                <h3 className="text-2xl font-black text-white mb-3 leading-none">{t.featureStructuredTitle}</h3>
                <p className="text-sm font-bold text-white/80 mb-3 leading-tight max-w-[90%]">{t.featureStructuredSubtitle}</p>
              </div>
              <div className="flex-1 flex flex-col justify-center relative z-10">
                <div className="flex flex-wrap gap-2">
                  {[t.lblSubject, t.lblEnvironment, t.lblComposition, t.lblLighting, t.lblMood, t.lblStyle].map((tag, i) => (
                    <span key={i} className="px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-lg text-xs font-black text-white border border-white/30 shadow-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="absolute top-4 right-4 text-4xl opacity-70 group-hover:opacity-100 transition-opacity z-20">🏗️</div>
            </BentoBox>
          </div>

          <div className="col-span-1 h-full min-h-[200px]">
            <BentoBox bgColor="bg-[#1e3a8a]" className="h-full border-none shadow-[8px_8px_0px_0px_#93C5FD] hover:shadow-[12px_12px_0px_0px_#93C5FD] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <div>
                <h3 className="text-2xl font-black text-[#F6E05E] mb-3 leading-none">{t.featureInsightTitle}</h3>
                <p className="text-sm font-bold text-[#F6E05E]/80 mb-3 leading-tight max-w-[90%]">{t.featureInsightSubtitle}</p>
              </div>
              <div className="flex-1 flex flex-col justify-center relative z-10">
                <div className="flex flex-wrap gap-2">
                  {t.chatChips?.slice(0, 5).map((chip, i) => (
                    <span key={i} className="px-3 py-1.5 bg-[#F6E05E]/20 backdrop-blur-sm rounded-lg text-xs font-black text-[#F6E05E] border border-[#F6E05E]/30 shadow-sm">
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="absolute top-4 right-4 text-4xl opacity-70 group-hover:opacity-100 transition-opacity z-20">💡</div>
            </BentoBox>
          </div>

          <div className="col-span-1 h-full min-h-[200px]">
            <BentoBox bgColor="bg-[#6B5B95]" className="h-full border-none shadow-[8px_8px_0px_0px_#F5B7B1] hover:shadow-[12px_12px_0px_0px_#F5B7B1] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <div className="flex justify-between items-start mb-3 relative z-10">
                <div>
                  <h3 className="text-2xl font-black text-[#F5B7B1] mb-3 leading-none">{t.featureLangTitle}</h3>
                  <p className="text-sm font-bold text-[#F5B7B1]/80 leading-tight">{t.featureLangSubtitle}</p>
                </div>
                <span className="text-3xl z-20 opacity-70 group-hover:opacity-100 transition-opacity">🌍</span>
              </div>

              <div className="flex-1 flex flex-col justify-center relative z-10">
                <div className="flex items-center justify-between px-1 w-full">
                  {languages.map((lang, i) => (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-1 group cursor-pointer transition-transform duration-300 ${isLangActive(lang.name) ? 'scale-110' : 'hover:scale-110'}`}
                      onClick={(e) => { e.stopPropagation(); onLanguageChange && onLanguageChange(lang.name); }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${isLangActive(lang.name) ? 'bg-[#F5B7B1] text-[#6B5B95] shadow-sm' : 'bg-[#F5B7B1]/30 text-[#F5B7B1] group-hover:bg-[#F5B7B1]'}`}>
                        {lang.code.toUpperCase()}
                      </div>
                      <span className={`text-[9px] font-bold text-[#F5B7B1] transition-opacity ${isLangActive(lang.name) ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>{lang.native}</span>
                    </div>
                  ))}
                </div>
              </div>
            </BentoBox>
          </div>
        </div>
        {/* 3. FEATURE AREA - ROW 2 (4 items, 3 cols each) - Using grid-cols-4 for this row */}
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="h-full min-h-[160px]">
            <BentoBox bgColor="bg-[#A4B4C4]" className="h-full border-none shadow-[8px_8px_0px_0px_#7A8A9A] hover:shadow-[12px_12px_0px_0px_#7A8A9A] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <h3 className="text-xl font-black text-[#E8E03C] mb-1 leading-none">{t.featureBatchTitle}</h3>
              <p className="text-xs font-bold text-[#E8E03C]/80 mt-2 mb-4 leading-relaxed">{t.featureBatchSubtitle}</p>
              <div className="flex -space-x-4 mt-auto relative z-10 pl-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-10 h-10 rounded-lg bg-[#E8E03C]/20 border-2 border-[#E8E03C] shadow-sm transform hover:-translate-y-2 transition-transform duration-300"></div>
                ))}
              </div>
              <div className="absolute top-4 right-4 text-3xl opacity-70 group-hover:opacity-100 transition-opacity z-20">📦</div>
            </BentoBox>
          </div>

          <div className="h-full min-h-[160px]">
            <BentoBox bgColor="bg-[#F5CCC3]" className="h-full border-none shadow-[8px_8px_0px_0px_#E8ADA0] hover:shadow-[12px_12px_0px_0px_#E8ADA0] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <h3 className="text-xl font-black text-[#C53030] mb-1 leading-none">{t.featurePrinterTitle}</h3>
              <p className="text-xs font-bold text-[#C53030]/80 mt-2 mb-4 leading-relaxed">{t.featurePrinterSubtitle}</p>
              <div className="mt-auto self-start bg-white border-2 border-[#C53030] rounded-lg px-3 py-2 relative z-10 w-full max-w-[120px] animate-[pulse_3s_infinite]">
                <div className="w-full h-1.5 bg-[#C53030]/30 mb-1.5 rounded-full"></div>
                <div className="w-2/3 h-1.5 bg-[#C53030]/30 rounded-full"></div>
              </div>
              <div className="absolute top-4 right-4 text-3xl opacity-70 group-hover:opacity-100 transition-opacity z-20">🖨️</div>
            </BentoBox>
          </div>

          <div className="h-full min-h-[160px]">
            <BentoBox bgColor="bg-[#FDF5E6]" className="h-full border-none shadow-[8px_8px_0px_0px_#C4A77D] hover:shadow-[12px_12px_0px_0px_#C4A77D] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <h3 className="text-xl font-black text-[#6B4423] mb-1 leading-none">{t.featureLibraryTitle}</h3>
              <p className="text-xs font-bold text-[#6B4423]/80 mt-2 mb-4 leading-relaxed">{t.featureLibrarySubtitle}</p>
              {/* Compact Search Bar */}
              <div className="mt-auto bg-white border-2 border-[#6B4423] rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm relative z-10">
                <svg className="w-3 h-3 text-[#6B4423]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <div className="h-4 flex items-center overflow-hidden">
                  <span className="font-bold text-[#6B4423]/60 font-mono text-xs whitespace-nowrap">{typingText}</span>
                  <span className="w-1 h-3 bg-[#6B4423] ml-0.5 animate-pulse"></span>
                </div>
              </div>
              <div className="absolute top-4 right-4 text-3xl opacity-70 group-hover:opacity-100 transition-opacity z-20">📚</div>
            </BentoBox>
          </div>

          <div className="h-full min-h-[160px]">
            <BentoBox bgColor="bg-[#E5E7EB]" className="h-full border-none shadow-[8px_8px_0px_0px_#6B8E23] hover:shadow-[12px_12px_0px_0px_#6B8E23] hover:-translate-y-1 p-6 relative overflow-hidden group flex flex-col">
              <h3 className="text-xl font-black text-[#556B2F] mb-1 leading-none">{t.featureHistoryTitle}</h3>
              <p className="text-xs font-bold text-[#556B2F]/80 mt-2 mb-4 leading-relaxed">{t.featureHistorySubtitle}</p>
              <div className="absolute bottom-4 right-4 text-5xl opacity-70 group-hover:opacity-100 transition-opacity z-20">💾</div>
            </BentoBox>
          </div>
        </div >


        {/* FOOTER (Full Width) */}
        <div className="col-span-12 flex flex-col gap-2 mt-6">
          <button
            onClick={() => setIsDocOpen(true)}
            className="mx-auto flex items-center gap-2 px-4 py-1.5 rounded-full bg-stone-200/50 hover:bg-stone-200 text-stone-500 hover:text-stone-800 transition-all font-bold text-xs tracking-wide group mb-2"
          >
            <svg className="w-4 h-4 text-stone-400 group-hover:text-softblue transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            <span>{systemLanguage?.includes('Chinese') ? 'Prompix 使用指南' : 'Prompix User Guide'}</span>
          </button>
          <div className="w-full h-14 bg-stone-900 rounded-xl flex items-center justify-between px-6 text-cream shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)]">
            <span className="font-mono text-sm tracking-wide opacity-80">PROMPIX</span>
            <a href="mailto:Conradgui@gmail.com" className="text-stone-300 hover:text-white transition-colors text-sm font-medium">
              Conradgui@gmail.com
            </a>
          </div>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />

      <DocReader
        isOpen={isDocOpen}
        onClose={() => setIsDocOpen(false)}
        systemLanguage={systemLanguage}
        onOpenSettings={onOpenSettings}
      />
    </>
  );
};

export default Home;
