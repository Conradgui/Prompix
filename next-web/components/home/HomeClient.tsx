'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Surface from '@/components/ui/Surface';
import { useAppState } from '@/lib/state/app-state';
import { resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { canUseApiMode } from '@/lib/runtime/policy';

export default function HomeClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const {
    loading,
    analysisProgress,
    runtimeMode,
    settings,
    setRuntimeModeAction,
    uploadImages,
  } = useAppState();

  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];
  const apiModeEnabled = canUseApiMode();

  const modeTip = useMemo(() => {
    if (!apiModeEnabled) return text.home.publicDemoLocked;
    if (runtimeMode === 'demo') return text.home.modeTipDemo;
    return text.home.modeTipApi;
  }, [apiModeEnabled, runtimeMode, text.home.modeTipApi, text.home.modeTipDemo, text.home.publicDemoLocked]);

  const handleFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      await uploadImages(files);
      router.push('/analysis');
    } catch (error: any) {
      const msg = error?.message || String(error);
      if (msg.includes('MISSING_API_KEY')) {
        alert(text.home.missingApiKey);
        router.push('/settings');
        return;
      }
      alert(`${text.home.analyzeFailed}${msg}`);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 100, damping: 15 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto h-full w-full flex flex-col justify-between py-2 sm:py-4 px-2 overflow-hidden"
    >
      <div className="flex-1 flex flex-col justify-center space-y-6 max-w-2xl mx-auto w-full">
        <motion.div variants={itemVariants} className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-ag-text leading-tight">
            {text.home.heroTitle}
          </h1>
          <p className="text-xs sm:text-sm text-ag-muted leading-relaxed max-w-xl mx-auto">
            {text.home.heroDesc}
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="w-full">
          <Surface
            className="relative min-h-[220px] p-4 shadow-xl bg-white/40 backdrop-blur-xl border border-white/20 rounded-2xl"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(Array.from(e.dataTransfer.files || []));
              }}
              className={`flex h-full min-h-[190px] flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300 ${
                dragOver
                  ? 'border-ag-accent bg-ag-accent/8 scale-[0.99] shadow-inner'
                  : 'border-ag-border hover:border-ag-accent/40 bg-ag-surface/20'
              }`}
            >
              {loading ? (
                <div className="w-full max-w-xs space-y-4 px-4 text-center">
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-ag-border">
                    <motion.div
                      className="absolute left-0 top-0 h-full rounded-full bg-ag-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(4, analysisProgress))}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-xs font-medium text-ag-text animate-pulse">{text.home.parsing}</p>
                </div>
              ) : (
                <div className="space-y-3 text-center p-4">
                  <p className="text-base font-semibold text-ag-text tracking-tight">{text.home.dropTitle}</p>
                  <p className="text-xs text-ag-muted/80">{text.home.dropSub}</p>
                  <div className="pt-1">
                    <PrimaryButton onClick={() => fileInputRef.current?.click()}>{text.home.selectImage}</PrimaryButton>
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(Array.from(e.target.files || []))}
              />
            </div>
          </Surface>
        </motion.div>
      </div>

      <section className="space-y-3 max-w-4xl mx-auto w-full pt-4 border-t border-ag-border/20">
        <motion.h2 
          variants={itemVariants} 
          className="text-[10px] font-bold tracking-wider uppercase text-ag-muted text-center"
        >
          {text.home.coreCapabilities}
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {text.home.features.map((item) => (
            <motion.div key={item.title} variants={itemVariants}>
              <Surface interactive className="p-3.5 h-full rounded-xl bg-white/30 backdrop-blur-md border border-white/10 hover:shadow-md transition duration-300 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-ag-text tracking-tight">{item.title}</h3>
                  <p className="mt-1 text-[11px] leading-normal text-ag-muted/90">{item.desc}</p>
                </div>
              </Surface>
            </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}

