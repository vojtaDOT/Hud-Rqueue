'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface SidebarContextValue {
    pinned: boolean;
    togglePin: () => void;
    sidebarWidth: number;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const SIDEBAR_WIDTH = 200;
export const SIDEBAR_COLLAPSED_WIDTH = 52;

export function SidebarProvider({ children }: { children: ReactNode }) {
    const [pinned, setPinned] = useState(false);

    return (
        <SidebarContext.Provider
            value={{
                pinned,
                togglePin: () => setPinned((prev) => !prev),
                sidebarWidth: pinned ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
            }}
        >
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
