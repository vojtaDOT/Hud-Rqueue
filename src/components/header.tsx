'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

export function Header() {
    const pathname = usePathname();

    const links = [
        { href: '/tasks', label: 'Tasks' },
        { href: '/sources', label: 'Sources' },
    ];

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 items-center justify-between mx-auto px-4 md:px-8">
                {/* Logo Section */}
                <div className="flex items-center gap-6">
                    <Link href="/" className="flex items-center gap-2 font-bold transition-opacity hover:opacity-90">
                        <span>HUD</span>
                        <Image
                            src="/tool.svg"
                            alt="HUD Tool"
                            width={24}
                            height={24}
                            className="inline-block"
                        />
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
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

                {/* Right Side Actions */}
                <div className="flex items-center gap-4">
                    {/* Mobile Navigation (simplified for now) */}
                    <nav className="flex md:hidden items-center space-x-4 text-sm font-medium">
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

                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
