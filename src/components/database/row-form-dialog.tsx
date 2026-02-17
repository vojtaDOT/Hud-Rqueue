'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ColumnSchema, TableSchema, getCreateColumns, getEditColumns } from './table-schema';

interface RowFormDialogProps {
    open: boolean;
    onClose: () => void;
    schema: TableSchema;
    mode: 'create' | 'edit';
    initialData?: Record<string, unknown>;
    onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

function stringifyForForm(value: unknown, type: string): string {
    if (value === null || value === undefined) return '';
    if (type === 'jsonb' || type === 'json') {
        return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    }
    if (type === 'timestamptz' || type === 'timestamp') {
        if (typeof value === 'string' && value) {
            try {
                const d = new Date(value);
                return d.toISOString().slice(0, 19);
            } catch {
                return String(value);
            }
        }
    }
    return String(value);
}

export function RowFormDialog({
    open,
    onClose,
    schema,
    mode,
    initialData,
    onSubmit,
}: RowFormDialogProps) {
    const columns = mode === 'create' ? getCreateColumns(schema) : getEditColumns(schema);
    const [formData, setFormData] = useState<Record<string, string | boolean>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const data: Record<string, string | boolean> = {};
        columns.forEach(col => {
            const val = initialData?.[col.name];
            if (col.type === 'boolean') {
                data[col.name] = val === true;
            } else {
                data[col.name] = stringifyForForm(val, col.type);
            }
        });
        setFormData(data);
        setError(null);
    }, [open, initialData, mode, columns]);

    const handleChange = (col: ColumnSchema, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [col.name]: value }));
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);

        try {
            const payload: Record<string, unknown> = {};

            for (const col of columns) {
                const raw = formData[col.name];

                if (col.type === 'boolean') {
                    payload[col.name] = raw === true;
                    continue;
                }

                const strVal = raw as string;

                if (strVal === '' || strVal === undefined) {
                    if (col.nullable) {
                        payload[col.name] = null;
                    }
                    continue;
                }

                switch (col.type) {
                    case 'integer':
                    case 'bigint':
                        payload[col.name] = parseInt(strVal, 10);
                        if (isNaN(payload[col.name] as number)) {
                            setError(`${col.label}: neplatné číslo`);
                            setSubmitting(false);
                            return;
                        }
                        break;
                    case 'jsonb':
                    case 'json':
                        try {
                            payload[col.name] = JSON.parse(strVal);
                        } catch {
                            setError(`${col.label}: neplatný JSON`);
                            setSubmitting(false);
                            return;
                        }
                        break;
                    default:
                        payload[col.name] = strVal;
                }
            }

            await onSubmit(payload);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Chyba při ukládání');
        } finally {
            setSubmitting(false);
        }
    };

    const renderField = (col: ColumnSchema) => {
        const key = col.name;

        if (col.type === 'boolean') {
            return (
                <div key={key} className="flex items-center justify-between py-2">
                    <Label className="text-sm text-white/70">{col.label}</Label>
                    <Switch
                        checked={formData[key] === true}
                        onCheckedChange={v => handleChange(col, v)}
                    />
                </div>
            );
        }

        if (col.type === 'jsonb' || col.type === 'json') {
            return (
                <div key={key} className="space-y-1.5">
                    <Label className="text-sm text-white/70">{col.label}</Label>
                    <Textarea
                        value={(formData[key] as string) || ''}
                        onChange={e => handleChange(col, e.target.value)}
                        rows={5}
                        className="font-mono text-xs bg-white/5 border-white/20 text-white"
                        placeholder="{}"
                    />
                </div>
            );
        }

        if (col.type === 'text' || col.type === 'varchar') {
            const isLong = col.truncate && col.truncate > 60;
            if (isLong) {
                return (
                    <div key={key} className="space-y-1.5">
                        <Label className="text-sm text-white/70">{col.label}</Label>
                        <Textarea
                            value={(formData[key] as string) || ''}
                            onChange={e => handleChange(col, e.target.value)}
                            rows={3}
                            className="bg-white/5 border-white/20 text-white"
                        />
                    </div>
                );
            }
        }

        return (
            <div key={key} className="space-y-1.5">
                <Label className="text-sm text-white/70">{col.label}</Label>
                <Input
                    type={col.type === 'integer' || col.type === 'bigint' ? 'number' : 'text'}
                    value={(formData[key] as string) || ''}
                    onChange={e => handleChange(col, e.target.value)}
                    placeholder={col.nullable ? '(volitelné)' : ''}
                    className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
                />
            </div>
        );
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] bg-zinc-950 border-white/10 text-white overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'create' ? 'Nový záznam' : 'Upravit záznam'}
                        <span className="ml-2 text-sm font-normal text-white/40">
                            {schema.label}
                        </span>
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'create'
                            ? 'Vyplňte pole pro nový záznam.'
                            : `Úprava záznamu (PK: ${initialData?.[schema.primaryKey]})`}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
                    {columns.map(col => renderField(col))}
                </div>

                {error && (
                    <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>
                        Zrušit
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                    >
                        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {mode === 'create' ? 'Vytvořit' : 'Uložit'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
