'use client';

import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';
import { Menu, X, Home, ListTodo, Database, Globe, Workflow } from 'lucide-react';

export function Header() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = React.useState(false);

    const links = [
        { href: '/', label: 'Dashboard', icon: Home },
        { href: '/tasks', label: 'Tasks', icon: ListTodo },
        { href: '/sources', label: 'Sources', icon: Globe },
        { href: '/pipeline', label: 'Pipeline', icon: Workflow },
        { href: '/database', label: 'Database', icon: Database },
    ];

    return (
        <>
            {/* Burger Button - Fixed Top Right */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed top-4 right-4 z-[100] p-2 rounded-lg bg-zinc-900/80 backdrop-blur-sm border border-white/10 hover:bg-zinc-800 transition-colors"
                aria-label="Toggle menu"
            >
                {isOpen ? (
                    <X className="w-5 h-5 text-white" />
                ) : (
                    <Menu className="w-5 h-5 text-white" />
                )}
            </button>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-[90] backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Slide-out Navigation Panel */}
            <nav
                className={cn(
                    "fixed top-0 right-0 h-full w-64 bg-zinc-900/95 backdrop-blur-md border-l border-white/10 z-[95] transform transition-transform duration-300 ease-in-out",
                    isOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                <div className="flex flex-col h-full">
                    {/* Logo Section */}
                    <div className="p-6 pt-16 border-b border-white/10">
                        <Link
                            href="/"
                            className="flex items-center gap-2 font-bold text-white"
                            onClick={() => setIsOpen(false)}
                        >
                            <span className="text-lg">HUD</span>
                            <Image
                                src="/tool.svg"
                                alt="HUD Tool"
                                width={20}
                                height={20}
                                className="inline-block"
                            />
                        </Link>
                    </div>

                    {/* Navigation Links */}
                    <div className="flex-1 p-4">
                        <ul className="space-y-2">
                            {links.map((link) => {
                                const Icon = link.icon;
                                return (
                                    <li key={link.href}>
                                        <Link
                                            href={link.href}
                                            onClick={() => setIsOpen(false)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                                                pathname === link.href
                                                    ? "bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-white border border-purple-500/30"
                                                    : "text-white/60 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            <Icon className="w-5 h-5" />
                                            <span className="font-medium">{link.label}</span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    {/* Theme Toggle at Bottom */}
                    <div className="p-4 border-t border-white/10">
                        <div className="flex items-center justify-between px-4 py-2">
                            <span className="text-sm text-white/60">Téma</span>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>
            </nav>
        </>
    );
}
