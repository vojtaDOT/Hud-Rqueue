'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';

export function StressTest() {
    const [count, setCount] = useState(50);
    const [isLoading, setIsLoading] = useState(false);
    const [isFlushing, setIsFlushing] = useState(false);

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    task: 'stress-test',
                    count: count,
                    max_attempts: 1,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate tasks');
            }

            toast.success(data.message, {
                description: `Created IDs from ${data.first_job_id} to ${data.last_job_id}`,
            });
        } catch (error) {
            toast.error('Error generating tasks', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleFlush = async () => {
        if (!confirm('Are you sure you want to flush the entire queue? This action cannot be undone.')) {
            return;
        }

        setIsFlushing(true);
        try {
            const response = await fetch('/api/tasks', {
                method: 'DELETE',
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to flush queue');
            }

            toast.success(data.message, {
                description: `Deleted ${data.deleted_jobs} jobs`,
            });
        } catch (error) {
            toast.error('Error flushing queue', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsFlushing(false);
        }
    };

    return (
        <Card className="w-full max-w-2xl mx-auto mt-8 border-red-200 dark:border-red-900">
            <CardHeader>
                <CardTitle className="text-red-500">Danger zone</CardTitle>
                <CardDescription>
                    Generate a large batch of tasks to test queue performance, or flush the entire queue.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <Input
                            type="number"
                            min={1}
                            max={1000}
                            value={count}
                            onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                            placeholder="Number of tasks"
                        />
                    </div>
                    <Button
                        variant="destructive"
                        onClick={handleGenerate}
                        disabled={isLoading || isFlushing || count < 1}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            'Generate Batch'
                        )}
                    </Button>
                </div>
                <div className="border-t pt-4">
                    <Button
                        variant="destructive"
                        onClick={handleFlush}
                        disabled={isLoading || isFlushing}
                        className="w-full"
                    >
                        {isFlushing ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Flushing...
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Flush Entire Queue
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
