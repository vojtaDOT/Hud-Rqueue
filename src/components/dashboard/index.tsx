'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Database, Server } from 'lucide-react';
import { DashboardOverview } from './dashboard-overview';
import { DashboardRedis } from './dashboard-redis';
import { DashboardDatabase } from './dashboard-database';

const TABS = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'redis', label: 'Redis', icon: Server },
    { value: 'database', label: 'Database', icon: Database },
] as const;

export function Dashboard() {
    const [activeTab, setActiveTab] = React.useState('overview');

    return (
        <div className="w-full space-y-6">
            {/* Glass tab bar — centered, not full width */}
            <div className="flex justify-center">
                <nav
                    className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-1.5 rounded-2xl',
                        'bg-background/60 dark:bg-zinc-900/50',
                        'backdrop-blur-xl backdrop-saturate-150',
                        'border border-white/8 dark:border-white/6',
                        'shadow-lg shadow-black/4 dark:shadow-black/30',
                        'ring-1 ring-black/3 dark:ring-white/4'
                    )}
                >
                    {TABS.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => setActiveTab(value)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                                activeTab === value
                                    ? 'text-foreground bg-white/12 dark:bg-white/8 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/6'
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span className="hidden sm:inline">{label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && <DashboardOverview />}
            {activeTab === 'redis' && <DashboardRedis />}
            {activeTab === 'database' && <DashboardDatabase />}
        </div>
    );
}
