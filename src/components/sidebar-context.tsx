'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface SidebarContextValue {
    pinned: boolean;
    togglePin: () => void;
    sidebarWidth: number;
    mobileOpen: boolean;
    openMobile: () => void;
    closeMobile: () => void;
    toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SIDEBAR_WIDTH = 200;
export const SIDEBAR_COLLAPSED_WIDTH = 52;

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [pinned, setPinned] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const value = useMemo<SidebarContextValue>(() => ({
        pinned,
        togglePin: () => setPinned((prev) => !prev),
        sidebarWidth: pinned ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
        mobileOpen,
        openMobile: () => setMobileOpen(true),
        closeMobile: () => setMobileOpen(false),
        toggleMobile: () => setMobileOpen((prev) => !prev),
    }), [mobileOpen, pinned]);

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
