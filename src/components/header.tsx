'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

export function Header() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Queue' },
        { href: '/sources', label: 'Sources' },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center mx-auto px-4 md:px-8">
                <div className="mr-4 hidden md:flex">
                    <Link href="/" className="mr-6 flex items-center space-x-2">
                        <span className="hidden font-bold sm:inline-block">
                            Redis Queue
                        </span>
                    </Link>
                    <nav className="flex items-center space-x-6 text-sm font-medium">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    'transition-colors hover:text-foreground/80',
                                    pathname === link.href ? 'text-foreground' : 'text-foreground/60'
                                )}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>
                {/* Mobile View - Simplified for now, just main links in a flex row */}
                <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
                    <div className="flex md:hidden items-center space-x-4">
                        {links.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    'text-sm font-medium transition-colors hover:text-foreground/80',
                                    pathname === link.href ? 'text-foreground' : 'text-foreground/60'
                                )}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                    <div className="w-full flex-1 md:w-auto md:flex-none">
                        {/* Add search or other interactions here if needed */}
                    </div>
                    <nav className="flex items-center">
                        {/* Theme Toggle can go here if we have one. I'll check if ThemeToggle exists, if not I'll just omit it for now or implement it. 
                 The plan didn't explicitly say I MUST implement ThemeToggle, but "Theme Toggle" was mentioned as 'sleek'.
                 I will assume ThemeToggle might not exist yet based on previous file list. I'll comment it out or create it.
                 Actually, let's create a simple placeholders for now to not break build. 
             */}
                        <ThemeToggle />
                    </nav>
                </div>
            </div>
        </header>
    );
}
