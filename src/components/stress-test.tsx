'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function StressTest() {
    const [count, setCount] = useState(50);
    const [isLoading, setIsLoading] = useState(false);

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

    return (
        <Card className="w-full max-w-2xl mx-auto mt-8 border-red-200 dark:border-red-900">
            <CardHeader>
                <CardTitle className="text-red-500">Stress Test</CardTitle>
                <CardDescription>
                    Generate a large batch of tasks to test queue performance.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
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
                    disabled={isLoading || count < 1}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generatiing...
                        </>
                    ) : (
                        'Generate Batch'
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
