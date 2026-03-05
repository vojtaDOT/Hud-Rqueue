import { ExternalLink, Loader2, Rss } from 'lucide-react';

export interface FeedPreview {
    title: string;
    itemCount: number;
    lastPublished: string | null;
    items: { title: string; link: string; pubDate: string | null }[];
}

interface RssPreviewPanelProps {
    preview: FeedPreview | null;
    loading: boolean;
    error: string | null;
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('cs-CZ', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

export function RssPreviewPanel({ preview, loading, error }: RssPreviewPanelProps) {
    if (loading) {
        return (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Nacitam nahled...
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-destructive">
                {error}
            </div>
        );
    }

    if (!preview) {
        return null;
    }

    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
                <Rss className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">{preview.title}</span>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                    Polozek: <span className="text-foreground">{preview.itemCount}</span>
                </span>
                {preview.lastPublished && (
                    <span>
                        Posledni: <span className="text-foreground">{formatDate(preview.lastPublished)}</span>
                    </span>
                )}
            </div>

            {preview.items.length > 0 && (
                <ul className="space-y-1 pt-1">
                    {preview.items.slice(0, 3).map((item, index) => (
                        <li key={index} className="flex items-start gap-1.5 text-xs">
                            <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                            <a
                                href={item.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate"
                                title={item.title}
                            >
                                {item.title}
                            </a>
                            {item.pubDate && (
                                <span className="shrink-0 text-muted-foreground">
                                    {formatDate(item.pubDate)}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
