'use client';

import { Rss } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface RssDetectionPanelProps {
    rssFeedOptions: string[];
    selectedRssFeed: string;
    onSelectedRssFeedChange: (value: string) => void;
    onApplySelectedRssFeed: () => void;
}

export function RssDetectionPanel({
    rssFeedOptions,
    selectedRssFeed,
    onSelectedRssFeedChange,
    onApplySelectedRssFeed,
}: RssDetectionPanelProps) {
    if (rssFeedOptions.length < 1) {
        return null;
    }

    return (
        <div className="rounded-md border border-white/15 bg-white/5 p-3">
            <Label className="mb-1.5 block text-sm text-white/70">Nalezene RSS/Atom feedy</Label>
            <div className="flex items-center gap-2">
                <Select value={selectedRssFeed} onValueChange={onSelectedRssFeedChange}>
                    <SelectTrigger className="border-white/20 bg-black/20 text-white">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {rssFeedOptions.map((feedUrl) => (
                            <SelectItem key={feedUrl} value={feedUrl}>
                                {feedUrl}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="outline"
                    onClick={onApplySelectedRssFeed}
                    disabled={!selectedRssFeed}
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                    <Rss className="mr-2 h-4 w-4" />
                    Pouzit vybrany RSS feed
                </Button>
            </div>
        </div>
    );
}
