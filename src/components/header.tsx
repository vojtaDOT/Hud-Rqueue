'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/components/sidebar-context';
import { Home, ListTodo, Database, Globe, Workflow, Pin, PinOff, HardDrive, Menu, X } from 'lucide-react';

const NAV_LINKS = [
    { href: '/', label: 'Dashboard', icon: Home },
    { href: '/tasks', label: 'Tasks', icon: ListTodo },
    { href: '/sources', label: 'Sources', icon: Globe },
    { href: '/pipeline', label: 'Pipeline', icon: Workflow },
    { href: '/database', label: 'Database', icon: Database },
    { href: '/infra', label: 'Object Storage', icon: HardDrive },
] as const;

export function Header() {
    const pathname = usePathname();
    const { pinned, togglePin, mobileOpen, toggleMobile, closeMobile } = useSidebar();
    const [hovered, setHovered] = useState(false);

    const expanded = pinned || hovered;

    const renderNavLinks = (expandedNav: boolean, mobile = false) => (
        <ul className="space-y-0.5">
            {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                return (
                    <li key={link.href}>
                        <Link
                            href={link.href}
                            onClick={mobile ? closeMobile : undefined}
                            title={!expandedNav ? link.label : undefined}
                            className={cn(
                                'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
                                isActive
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                                !expandedNav && !mobile && 'justify-center px-0',
                            )}
                        >
                            <Icon className={cn(
                                'h-4 w-4 shrink-0 transition-colors',
                                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                            )} />
                            {(expandedNav || mobile) && <span className="whitespace-nowrap">{link.label}</span>}
                            {isActive && (expandedNav || mobile) && (
                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <>
            <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur md:hidden">
                <button
                    onClick={toggleMobile}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-card text-foreground"
                    aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                >
                    {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </button>
                <Link href="/" className="flex items-center gap-2 font-semibold text-foreground" onClick={closeMobile}>
                    <Image src="/tool.svg" alt="HUD" width={18} height={18} className="shrink-0" />
                    <span className="text-sm tracking-wide whitespace-nowrap">HUD</span>
                </Link>
                <ThemeToggle />
            </div>

            <div
                className={cn(
                    'fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-opacity md:hidden',
                    mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
                onClick={closeMobile}
            />

            <aside
                className={cn(
                    'fixed top-14 left-0 bottom-0 z-50 w-[280px] border-r border-border/60 bg-sidebar transition-transform duration-200 ease-out md:hidden',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <div className="flex h-full flex-col">
                    <nav className="flex-1 overflow-y-auto px-3 py-3">
                        {renderNavLinks(true, true)}
                    </nav>
                    <div className="flex items-center justify-between border-t border-border/60 px-3 py-3">
                        <span className="text-xs text-muted-foreground">Theme</span>
                        <ThemeToggle />
                    </div>
                </div>
            </aside>

            <aside
                onMouseEnter={() => { if (!pinned) setHovered(true); }}
                onMouseLeave={() => { if (!pinned) setHovered(false); }}
                className={cn(
                    'fixed top-0 left-0 z-50 hidden h-dvh flex-col border-r border-border/60 bg-sidebar transition-[width] duration-200 ease-out md:flex',
                    expanded ? `w-[${SIDEBAR_WIDTH}px]` : `w-[${SIDEBAR_COLLAPSED_WIDTH}px]`,
                )}
                style={{ width: expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH }}
            >
                <div className={cn(
                    'flex items-center gap-2.5 border-b border-border/60 shrink-0',
                    expanded ? 'h-12 px-4' : 'h-12 justify-center px-0',
                )}>
                    <Link href="/" className="flex items-center gap-2.5 font-semibold text-foreground">
                        <Image
                            src="/tool.svg"
                            alt="HUD"
                            width={18}
                            height={18}
                            className="shrink-0"
                        />
                        {expanded && <span className="text-sm tracking-wide whitespace-nowrap">HUD</span>}
                    </Link>
                </div>

                <nav className="flex-1 overflow-y-auto py-2 px-2">
                    {renderNavLinks(expanded)}
                </nav>

                <div className={cn(
                    'border-t border-border/60 px-2 py-2 shrink-0 flex items-center',
                    expanded ? 'justify-between' : 'justify-center',
                )}>
                    <button
                        onClick={togglePin}
                        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                        title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                    >
                        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    {expanded && <ThemeToggle />}
                </div>
            </aside>
        </>
    );
}
