'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import PrimaryButton from '@/components/ui/PrimaryButton';
import Surface from '@/components/ui/Surface';
import { useAppState } from '@/lib/state/app-state';
import { resolveUiLocale, UI_TEXT } from '@/lib/i18n/ui';
import { RuntimeMode } from '@/lib/types';

interface ParsedError {
  code: string | number;
  message: string;
  isCustomProviderError: boolean;
}

const parseError = (error: any): ParsedError => {
  const msg = error?.message || String(error);
  
  // Try to find a JSON string within the error message
  let jsonStr = msg;
  const jsonMatch = msg.match(/(\{[\s\S]*\})/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }
  
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed?.error) {
      return {
        code: parsed.error.code || 'ERROR',
        message: parsed.error.message || JSON.stringify(parsed.error),
        isCustomProviderError: true,
      };
    }
    if (parsed?.code || parsed?.message) {
      return {
        code: parsed.code || 'ERROR',
        message: parsed.message || JSON.stringify(parsed),
        isCustomProviderError: true,
      };
    }
  } catch {
    // Treat as plain text
  }

  // Handle common HTTP error patterns in string
  if (msg.includes('503') || msg.includes('500') || msg.includes('429') || msg.includes('401') || msg.includes('403')) {
    const codeMatch = msg.match(/(503|500|429|401|403)/);
    return {
      code: codeMatch ? codeMatch[1] : 'ERROR',
      message: msg,
      isCustomProviderError: true,
    };
  }

  return {
    code: 'ERROR',
    message: msg,
    isCustomProviderError: false,
  };
};

export default function HomeClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    code?: string | number;
    message: string;
    raw?: string;
    isCustomProviderError?: boolean;
  } | null>(null);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);

  const {
    loading,
    analysisProgress,
    runtimeMode,
    settings,
    uploadImages,
  } = useAppState();

  const locale = resolveUiLocale(settings.systemLanguage);
  const text = UI_TEXT[locale];

  const handleFiles = async (files: File[], forceMode?: RuntimeMode) => {
    if (!files.length) return;
    setErrorDetails(null);
    try {
      await uploadImages(files, forceMode);
      router.push('/analysis');
    } catch (error: any) {
      setFailedFiles(files);
      const rawMsg = error?.message || String(error);
      if (rawMsg.includes('MISSING_API_KEY')) {
        setErrorDetails({
          code: 'MISSING_API_KEY',
          message: locale === 'zh' ? '未检测到 API Key，请在设置中填写配置后重试。' : 'API Key is missing. Please configure it in settings.',
          isCustomProviderError: false
        });
        setTimeout(() => {
          router.push('/settings');
        }, 1500);
        return;
      }
      
      const parsed = parseError(error);
      setErrorDetails({
        code: parsed.code,
        message: parsed.message,
        raw: rawMsg,
        isCustomProviderError: runtimeMode === 'api' || parsed.isCustomProviderError
      });
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
      <div className="flex-1 flex flex-col justify-center space-y-4 max-w-2xl mx-auto w-full">
        <motion.div variants={itemVariants} className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-ag-text leading-tight">
            {text.home.heroTitle}
          </h1>
          <p className="text-xs sm:text-sm text-ag-muted leading-relaxed max-w-xl mx-auto whitespace-pre-line">
            {text.home.heroDesc}
          </p>
        </motion.div>

        {errorDetails && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 sm:p-5 text-xs text-red-600 dark:text-red-400 space-y-3 relative w-full overflow-hidden"
          >
            <div className="flex items-start justify-between pr-4">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <p className="font-semibold text-sm">
                  {errorDetails.isCustomProviderError 
                    ? (locale === 'zh' ? '自定义大模型分析服务报错' : 'Custom AI Analysis Service Error')
                    : (locale === 'zh' ? '分析请求遇到问题' : 'Analysis Request Encountered an Issue')
                  }
                </p>
              </div>
              <button 
                onClick={() => setErrorDetails(null)} 
                className="absolute top-3.5 right-4 opacity-60 hover:opacity-100 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 bg-red-500/5 dark:bg-red-500/10 p-3 rounded-lg border border-red-500/10 break-all break-words">
              <p className="font-medium text-red-700 dark:text-red-300">
                {locale === 'zh' ? '错误代码 (Error Code): ' : 'Error Code: '}
                <span className="font-mono bg-red-500/10 px-1 py-0.5 rounded text-[11px] font-semibold">{errorDetails.code}</span>
              </p>
              <p className="leading-relaxed mt-1 text-red-600/90 dark:text-red-400/90">
                {locale === 'zh' ? '详细原因: ' : 'Reason: '}
                {errorDetails.message}
              </p>
              {errorDetails.raw && errorDetails.raw !== errorDetails.message && (
                <details className="mt-2 text-[10px] text-red-500/70">
                  <summary className="cursor-pointer hover:underline outline-none">
                    {locale === 'zh' ? '查看原始错误日志' : 'View raw error log'}
                  </summary>
                  <pre className="mt-1 p-2 bg-black/5 dark:bg-black/20 rounded overflow-x-auto whitespace-pre-wrap font-mono text-[9px] max-h-32">
                    {errorDetails.raw}
                  </pre>
                </details>
              )}
            </div>

            {errorDetails.isCustomProviderError ? (
              <>
                <p className="text-[11px] text-ag-muted/95 leading-normal">
                  {locale === 'zh' 
                    ? '提示：如果您使用的是第三方大模型代理服务，报错显示底层的 Gemini 额度超限（如 429 报错及 gemini-2.5-flash 提示），这通常说明代理商后端的 Gemini 免费额度已耗尽。您可以选择：' 
                    : 'Tip: If you are using a proxy service, it might be due to its backend official Gemini quota exhaustion. You can:'}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => router.push('/settings')}
                    className="rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 font-bold text-xs transition duration-200 shadow-sm"
                  >
                    {locale === 'zh' ? '⚙️ 前往设置检查配置' : '⚙️ Check Config in Settings'}
                  </button>
                  <button
                    onClick={() => handleFiles(failedFiles, 'demo')}
                    className="rounded-lg border border-red-500/30 hover:border-red-500/50 bg-white/5 hover:bg-red-500/5 text-red-700 dark:text-red-300 px-3 py-1.5 font-bold text-xs transition duration-200"
                  >
                    {locale === 'zh' ? '✨ 尝试使用 Gemini 免费额度运行' : '✨ Try Platform Gemini Free Quota'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {(String(errorDetails.code).includes('API_KEY') || String(errorDetails.code).includes('CONFIGURED') || errorDetails.message.includes('503')) ? (
                  <button
                    onClick={() => router.push('/settings')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300 hover:underline"
                  >
                    {locale === 'zh' ? '前往设置页面配置 API Key →' : 'Go to Settings to configure API Key →'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleFiles(failedFiles, 'demo')}
                    className="rounded-lg border border-red-500/30 hover:border-red-500/50 bg-white/5 hover:bg-red-500/5 text-red-700 dark:text-red-300 px-3 py-1.5 font-bold text-xs transition duration-200"
                  >
                    {locale === 'zh' ? '✨ 尝试使用 Gemini 免费额度运行' : '✨ Try Platform Gemini Free Quota'}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}

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
          className="text-xs sm:text-sm font-bold tracking-wider uppercase text-ag-muted text-center"
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

