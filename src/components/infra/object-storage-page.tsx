'use client';

import { useState } from 'react';
import { HardDrive, Wrench } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ObjectStorageExplorer } from '@/components/infra/object-storage-explorer';
import { DocumentsStorageManager } from '@/components/infra/documents-storage-manager';

export function ObjectStoragePage() {
    const [tab, setTab] = useState('interaction');

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 sm:px-6">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">Object Storage</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Separate workflows for direct blob storage interactions and document cleanup operations.
                </p>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                <TabsList className="h-auto w-full flex-wrap justify-start gap-1 overflow-x-auto p-1">
                    <TabsTrigger value="interaction" className="gap-2">
                        <HardDrive className="h-4 w-4" />
                        Interaction with Blob Storage
                    </TabsTrigger>
                    <TabsTrigger value="cleanup" className="gap-2">
                        <Wrench className="h-4 w-4" />
                        Cleanup Process
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="interaction" className="space-y-4">
                    <ObjectStorageExplorer />
                </TabsContent>

                <TabsContent value="cleanup" className="space-y-4">
                    <DocumentsStorageManager embedded />
                </TabsContent>
            </Tabs>
        </div>
    );
}
