'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Database, Server, HardDrive } from 'lucide-react';
import { DashboardOverview } from './dashboard-overview';
import { DashboardRedis } from './dashboard-redis';
import { DashboardDatabase } from './dashboard-database';
import { DashboardInfra } from './dashboard-infra';

const TABS = [
    { value: 'overview', label: 'Overview', icon: LayoutDashboard },
    { value: 'redis', label: 'Redis', icon: Server },
    { value: 'database', label: 'Database', icon: Database },
    { value: 'infra', label: 'Infra', icon: HardDrive },
] as const;

export function Dashboard() {
    const [activeTab, setActiveTab] = React.useState('overview');

    return (
        <div className="w-full space-y-6">
            <div className="flex justify-center overflow-x-auto">
                <nav
                    className={cn(
                        'inline-flex min-w-max items-center gap-1 px-1.5 py-1.5 rounded-xl',
                        'bg-card/80 backdrop-blur-sm',
                        'border border-border/60',
                        'shadow-sm',
                    )}
                >
                    {TABS.map(({ value, label, icon: Icon }) => (
                        <button
                            key={value}
                            onClick={() => setActiveTab(value)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 sm:px-4',
                                activeTab === value
                                    ? 'text-primary bg-primary/10 shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            {activeTab === 'overview' && <DashboardOverview />}
            {activeTab === 'redis' && <DashboardRedis />}
            {activeTab === 'database' && <DashboardDatabase />}
            {activeTab === 'infra' && <DashboardInfra />}
        </div>
    );
}
