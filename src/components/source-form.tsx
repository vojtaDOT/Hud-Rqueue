'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

const formSchema = z.object({
    name: z.string().min(2, {
        message: 'Name must be at least 2 characters.',
    }),
    base_url: z.string().url({
        message: 'Please enter a valid URL.',
    }),
    enabled: z.boolean().default(true),
    crawl_strategy: z.string().min(1, {
        message: 'Please select a crawl strategy.',
    }),
    crawl_params: z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        } catch {
            return false;
        }
    }, {
        message: 'Must be valid JSON.',
    }),
    crawl_interval: z.string().min(1, {
        message: 'Please select a crawl interval.',
    }),
});

export function SourceForm() {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: '',
            base_url: '',
            enabled: true,
            crawl_strategy: 'list',
            crawl_params: '{}',
            crawl_interval: '1 day',
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        try {
            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    crawl_params: JSON.parse(values.crawl_params),
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to add source');
            }

            toast.success('Source added successfully', {
                description: `Created source: ${data.source.name}`,
            });
            form.reset();
        } catch (error) {
            toast.error('Error adding source', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Add New Source</CardTitle>
                <CardDescription>Configure a new source for the crawler.</CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g. Example Bulletin Board" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="base_url"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Base URL</FormLabel>
                                    <FormControl>
                                        <Input placeholder="https://example.com/bulletin" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="crawl_strategy"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Crawl Strategy</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select strategy" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="list">List</SelectItem>
                                                <SelectItem value="rss">RSS</SelectItem>
                                                <SelectItem value="api">API</SelectItem>
                                                <SelectItem value="sitemap">Sitemap</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="crawl_interval"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Crawl Interval</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select interval" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="1 hour">1 Hour</SelectItem>
                                                <SelectItem value="6 hours">6 Hours</SelectItem>
                                                <SelectItem value="12 hours">12 Hours</SelectItem>
                                                <SelectItem value="1 day">1 Day</SelectItem>
                                                <SelectItem value="7 days">7 Days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="crawl_params"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Crawl Parameters (JSON)</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder='{"selector": ".item"}'
                                            className="font-mono"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormDescription>
                                        JSON configuration specific to the selected strategy.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="enabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Enabled</FormLabel>
                                        <FormDescription>
                                            New sources are enabled by default.
                                        </FormDescription>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <Button type="submit" disabled={form.formState.isSubmitting}>
                            {form.formState.isSubmitting ? 'Adding Source...' : 'Add Source'}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
