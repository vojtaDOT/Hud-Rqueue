'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
    Bug,
    ScanText,
    Search,
    RefreshCw,
    Globe,
    ChevronDown,
    Loader2,
} from 'lucide-react';
import { SourceCombobox } from './source-combobox';
import { SourceUrlCombobox } from './source-url-combobox';
import { DocumentCombobox } from './document-combobox';
import { CronPicker } from './cron-picker';
import {
    defaultWizardData,
    type JobType,
    type ScrapyMethod,
    type ScrapyTarget,
    type OcrTarget,
    type WizardData,
} from './types';
import type { Source } from '@/hooks/use-sources';
import type { SourceUrl } from '@/hooks/use-source-urls';
import type { Document } from '@/hooks/use-documents';

/* ── Constants ── */

const METHODS: { value: ScrapyMethod; label: string; desc: string; icon: typeof Search }[] = [
    { value: 'discover', label: 'Discover', desc: 'Find new URLs on the source', icon: Search },
    { value: 'redownload', label: 'Redownload', desc: 'Re-crawl already known URLs', icon: RefreshCw },
    { value: 'discover_source_url', label: 'Discover URL', desc: 'Discover on a specific source URL', icon: Globe },
];

const LANGUAGES = [
    { value: 'eng', label: 'English' },
    { value: 'ces', label: 'Czech' },
    { value: 'deu', label: 'German' },
    { value: 'fra', label: 'French' },
    { value: 'spa', label: 'Spanish' },
    { value: 'pol', label: 'Polish' },
    { value: 'slk', label: 'Slovak' },
    { value: 'ita', label: 'Italian' },
    { value: 'por', label: 'Portuguese' },
    { value: 'rus', label: 'Russian' },
];

const PSM_MODES = [
    { value: 0, label: '0 — OSD only' },
    { value: 1, label: '1 — Auto with OSD' },
    { value: 3, label: '3 — Fully automatic' },
    { value: 4, label: '4 — Single column' },
    { value: 6, label: '6 — Single block' },
    { value: 7, label: '7 — Single line' },
    { value: 8, label: '8 — Single word' },
    { value: 11, label: '11 — Sparse text' },
    { value: 13, label: '13 — Raw line' },
];

const OEM_MODES = [
    { value: 0, label: '0 — Legacy only' },
    { value: 1, label: '1 — LSTM neural net' },
    { value: 2, label: '2 — Legacy + LSTM' },
    { value: 3, label: '3 — Default' },
];

const selectClass = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/* ── Segmented toggle helper ── */

function SegmentedToggle<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex rounded-lg border p-0.5 gap-0.5 w-fit">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        value === opt.value
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

/* ── Component ── */

export function TaskWizard() {
    const [data, setData] = React.useState<WizardData>({ ...defaultWizardData });
    const [submitting, setSubmitting] = React.useState(false);
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    const [bulkEnabled, setBulkEnabled] = React.useState(false);

    const patch = (p: Partial<WizardData>) => setData((prev) => ({ ...prev, ...p }));

    /* Clear selections when switching target table */
    const clearSelections = () => patch({
        sourceId: '', sourceName: '', sourceUrl: '',
        sourceUrlId: '', sourceUrlLabel: '', sourceUrlUrl: '',
        documentId: '', documentName: '', documentUrl: '',
    });

    const handleSourceSelect = (source: Source | null) => {
        if (source) {
            patch({ sourceId: String(source.id), sourceName: source.name, sourceUrl: source.base_url });
        } else {
            patch({ sourceId: '', sourceName: '', sourceUrl: '' });
        }
    };

    const handleSourceUrlSelect = (item: SourceUrl | null) => {
        if (item) {
            patch({ sourceUrlId: String(item.id), sourceUrlLabel: item.label || '', sourceUrlUrl: item.url });
        } else {
            patch({ sourceUrlId: '', sourceUrlLabel: '', sourceUrlUrl: '' });
        }
    };

    const handleDocumentSelect = (doc: Document | null) => {
        if (doc) {
            patch({ documentId: String(doc.id), documentName: doc.filename || '', documentUrl: doc.url });
        } else {
            patch({ documentId: '', documentName: '', documentUrl: '' });
        }
    };

    const handleBulkToggle = (checked: boolean) => {
        setBulkEnabled(checked);
        if (!checked) patch({ bulkCount: 1 });
    };

    const reset = () => {
        setData({ ...defaultWizardData });
        setBulkEnabled(false);
        setShowAdvanced(false);
    };

    const handleSubmit = async () => {
        if (!data.jobType) return;
        setSubmitting(true);
        try {
            const body: Record<string, unknown> = {
                task: data.jobType,
                max_attempts: data.maxAttempts,
                cron_time: data.cronTime || undefined,
            };

            if (data.jobType === 'scrapy') {
                body.method = data.method;
                body.count = data.bulkCount;
                if (data.scrapyTarget === 'sources') {
                    body.source_id = data.sourceId || undefined;
                    body.source_url = data.sourceUrl || undefined;
                } else {
                    body.source_url_id = data.sourceUrlId || undefined;
                    body.source_url = data.sourceUrlUrl || undefined;
                }
            } else {
                body.ocr_language = data.ocrLanguage;
                body.ocr_psm = data.ocrPsm;
                body.ocr_oem = data.ocrOem;
                if (data.ocrTarget === 'source_urls') {
                    body.source_url_id = data.sourceUrlId || undefined;
                    body.source_url = data.sourceUrlUrl || undefined;
                } else {
                    body.document_id = data.documentId || undefined;
                    body.source_url = data.documentUrl || undefined;
                }
            }

            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Failed to create job');

            const count = data.jobType === 'scrapy' ? data.bulkCount : 1;
            toast.success(`Created ${count} ${data.jobType} job${count > 1 ? 's' : ''}`, {
                action: { label: 'Create another', onClick: reset },
            });
            reset();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create job');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Create Job</CardTitle>
                <CardDescription>Add a task to the Redis queue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* ── Type toggle ── */}
                <div className="space-y-2">
                    <Label className="text-sm">Job type</Label>
                    <div className="flex rounded-lg border p-1 gap-1">
                        {([
                            { type: 'scrapy' as JobType, label: 'Scrapy', icon: Bug },
                            { type: 'ocr' as JobType, label: 'OCR', icon: ScanText },
                        ]).map(({ type, label, icon: Icon }) => (
                            <button
                                key={type}
                                onClick={() => { patch({ jobType: type }); clearSelections(); }}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                                    data.jobType === type
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Scrapy: target + picker ── */}
                {data.jobType === 'scrapy' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Pick from</Label>
                            <SegmentedToggle
                                options={[
                                    { value: 'sources' as ScrapyTarget, label: 'Sources' },
                                    { value: 'source_urls' as ScrapyTarget, label: 'Source URLs' },
                                ]}
                                value={data.scrapyTarget}
                                onChange={(v) => { patch({ scrapyTarget: v }); clearSelections(); }}
                            />
                        </div>
                        {data.scrapyTarget === 'sources' ? (
                            <div className="space-y-1.5">
                                <SourceCombobox value={data.sourceId} onSelect={handleSourceSelect} />
                                {data.sourceUrl && (
                                    <p className="text-xs text-muted-foreground font-mono truncate pl-1">{data.sourceUrl}</p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <SourceUrlCombobox value={data.sourceUrlId} onSelect={handleSourceUrlSelect} />
                                {data.sourceUrlUrl && (
                                    <p className="text-xs text-muted-foreground font-mono truncate pl-1">{data.sourceUrlUrl}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── OCR: target + picker ── */}
                {data.jobType === 'ocr' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Pick from</Label>
                            <SegmentedToggle
                                options={[
                                    { value: 'source_urls' as OcrTarget, label: 'Source URLs' },
                                    { value: 'documents' as OcrTarget, label: 'Documents' },
                                ]}
                                value={data.ocrTarget}
                                onChange={(v) => { patch({ ocrTarget: v }); clearSelections(); }}
                            />
                        </div>
                        {data.ocrTarget === 'source_urls' ? (
                            <div className="space-y-1.5">
                                <SourceUrlCombobox value={data.sourceUrlId} onSelect={handleSourceUrlSelect} />
                                {data.sourceUrlUrl && (
                                    <>
                                        <p className="text-xs text-muted-foreground font-mono truncate pl-1">{data.sourceUrlUrl}</p>
                                        <p className="text-xs text-muted-foreground pl-1">OCR will process all documents in this source URL</p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <DocumentCombobox value={data.documentId} onSelect={handleDocumentSelect} />
                                {data.documentUrl && (
                                    <p className="text-xs text-muted-foreground font-mono truncate pl-1">{data.documentUrl}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Scrapy-specific ── */}
                {data.jobType === 'scrapy' && (
                    <>
                        <div className="space-y-2">
                            <Label className="text-sm">Method</Label>
                            <div className="grid gap-2">
                                {METHODS.map(({ value, label, desc, icon: Icon }) => (
                                    <button
                                        key={value}
                                        onClick={() => patch({ method: value })}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                                            data.method === value
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border hover:bg-muted/50'
                                        )}
                                    >
                                        <div className={cn(
                                            'flex items-center justify-center h-8 w-8 rounded-md shrink-0',
                                            data.method === value
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground'
                                        )}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium">{label}</p>
                                            <p className="text-xs text-muted-foreground">{desc}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label className="text-sm">Bulk / Stress test</Label>
                            <Switch checked={bulkEnabled} onCheckedChange={handleBulkToggle} />
                        </div>
                        {bulkEnabled && (
                            <div className="space-y-2 pl-1">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Count</span>
                                    <span className="font-semibold text-foreground tabular-nums">{data.bulkCount}</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={1000}
                                    value={data.bulkCount}
                                    onChange={(e) => patch({ bulkCount: Number(e.target.value) })}
                                    className="w-full accent-primary"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>1</span>
                                    <span>1000</span>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── OCR-specific: Tesseract config ── */}
                {data.jobType === 'ocr' && (
                    <div className="space-y-4">
                        <Label className="text-sm font-medium">Tesseract Configuration</Label>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">Language</Label>
                                <select value={data.ocrLanguage} onChange={(e) => patch({ ocrLanguage: e.target.value })} className={selectClass}>
                                    {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">PSM</Label>
                                <select value={data.ocrPsm} onChange={(e) => patch({ ocrPsm: Number(e.target.value) })} className={selectClass}>
                                    {PSM_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">OEM</Label>
                                <select value={data.ocrOem} onChange={(e) => patch({ ocrOem: Number(e.target.value) })} className={selectClass}>
                                    {OEM_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Advanced (collapsible) ── */}
                {data.jobType && (
                    <>
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
                            Advanced options
                        </button>
                        {showAdvanced && (
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="max-attempts" className="text-xs text-muted-foreground">Max attempts</Label>
                                    <Input
                                        id="max-attempts"
                                        type="number"
                                        min={1}
                                        value={data.maxAttempts}
                                        onChange={(e) => patch({ maxAttempts: Number(e.target.value) || 1 })}
                                        className="h-9 max-w-[120px]"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground">Schedule (optional)</Label>
                                    <CronPicker value={data.cronTime} onChange={(cron) => patch({ cronTime: cron })} />
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ── Submit ── */}
                {data.jobType && (
                    <Button onClick={handleSubmit} disabled={submitting} className="w-full">
                        {submitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>Create {data.jobType} job{data.jobType === 'scrapy' && bulkEnabled && data.bulkCount > 1 ? `s (${data.bulkCount})` : ''}</>
                        )}
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
