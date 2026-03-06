'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useSidebar } from '@/components/sidebar-context';

export function MainContent({ children }: { children: ReactNode }) {
    const { sidebarWidth } = useSidebar();

    return (
        <div
            className="min-h-dvh pt-14 transition-[padding] duration-200 ease-out md:pt-0 md:pl-[var(--sidebar-width)]"
            style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
        >
            {children}
        </div>
    );
}
