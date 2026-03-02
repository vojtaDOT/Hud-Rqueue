'use client';

import type { ReactNode } from 'react';
import { useSidebar } from '@/components/sidebar-context';

export function MainContent({ children }: { children: ReactNode }) {
    const { sidebarWidth } = useSidebar();

    return (
        <div
            className="min-h-dvh transition-[padding] duration-200 ease-out"
            style={{ paddingLeft: sidebarWidth }}
        >
            {children}
        </div>
    );
}
