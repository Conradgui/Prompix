'use client';

import React from 'react';
import { AppStateProvider } from '@/lib/state/app-state';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}
