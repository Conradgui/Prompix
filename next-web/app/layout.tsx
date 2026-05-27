import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/layout/Providers';
import Header from '@/components/layout/Header';
import ParticleBackground from '@/components/ui/ParticleBackground';

export const metadata: Metadata = {
  title: 'Prompix Antigravity',
  description: '从视觉到提示词的 AI 工作台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-screen overflow-hidden">
      <body className="bg-ag-bg text-ag-text antialiased h-screen overflow-hidden flex flex-col">
        <Providers>
          <ParticleBackground />
          <Header />
          <main className="mx-auto w-full max-w-[1400px] flex-1 min-h-0 px-4 py-3 sm:px-6 lg:px-10 flex flex-col overflow-hidden">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

