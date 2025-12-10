'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface RegionItem {
    id: string;
    kod: string;
    nazev: { cs: string };
    kodNuts3: string;
}

interface DistrictItem {
    id: string;
    kod: string;
    nazev: { cs: string };
    kodLau: string;
    kraj: string;
}

export function DataSeeder() {
    const [regionsJson, setRegionsJson] = useState('');
    const [districtsJson, setDistrictsJson] = useState('');
    const [isImportingRegions, setIsImportingRegions] = useState(false);
    const [isImportingDistricts, setIsImportingDistricts] = useState(false);

    const handleImportRegions = async () => {
        if (!regionsJson.trim()) {
            toast.error('Please paste JSON data for regions');
            return;
        }

        setIsImportingRegions(true);
        try {
            const parsed = JSON.parse(regionsJson);
            const items: RegionItem[] = parsed.polozky;

            if (!items || !Array.isArray(items)) {
                throw new Error('Invalid JSON structure. Expected { "polozky": [...] }');
            }

            const mappedData = items.map((item) => ({
                id: item.id,
                code: item.kod,
                nuts3_code: item.kodNuts3,
                name: item.nazev,
            }));

            const { error } = await supabase
                .from('cz_regions_kraj')
                .upsert(mappedData, { onConflict: 'id' });

            if (error) {
                throw new Error(error.message);
            }

            toast.success(`Successfully imported ${mappedData.length} regions`);
            setRegionsJson('');
        } catch (error) {
            toast.error('Error importing regions', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsImportingRegions(false);
        }
    };

    const handleImportDistricts = async () => {
        if (!districtsJson.trim()) {
            toast.error('Please paste JSON data for districts');
            return;
        }

        setIsImportingDistricts(true);
        try {
            const parsed = JSON.parse(districtsJson);
            const items: DistrictItem[] = parsed.polozky;

            if (!items || !Array.isArray(items)) {
                throw new Error('Invalid JSON structure. Expected { "polozky": [...] }');
            }

            const mappedData = items.map((item) => ({
                id: item.id,
                code: item.kod,
                lau_code: item.kodLau,
                name: item.nazev,
                kraj_id: item.kraj,
            }));

            const { error } = await supabase
                .from('cz_regions_okres')
                .upsert(mappedData, { onConflict: 'id' });

            if (error) {
                throw new Error(error.message);
            }

            toast.success(`Successfully imported ${mappedData.length} districts`);
            setDistrictsJson('');
        } catch (error) {
            toast.error('Error importing districts', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsImportingDistricts(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto space-y-8">
            {/* Regions Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Import Regions (Kraje)</CardTitle>
                    <CardDescription>
                        Paste JSON data with the structure: {`{ "polozky": [{ "id", "kod", "nazev", "kodNuts3" }] }`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <textarea
                        className="w-full h-48 p-3 rounded-md border bg-background text-foreground font-mono text-sm resize-y"
                        placeholder='{ "polozky": [...] }'
                        value={regionsJson}
                        onChange={(e) => setRegionsJson(e.target.value)}
                        disabled={isImportingRegions}
                    />
                    <Button
                        onClick={handleImportRegions}
                        disabled={isImportingRegions || !regionsJson.trim()}
                        className="w-full"
                    >
                        {isImportingRegions ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Import Regions
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Districts Card */}
            <Card>
                <CardHeader>
                    <CardTitle>Import Districts (Okresy)</CardTitle>
                    <CardDescription>
                        Paste JSON data with the structure: {`{ "polozky": [{ "id", "kod", "nazev", "kodLau", "kraj" }] }`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <textarea
                        className="w-full h-48 p-3 rounded-md border bg-background text-foreground font-mono text-sm resize-y"
                        placeholder='{ "polozky": [...] }'
                        value={districtsJson}
                        onChange={(e) => setDistrictsJson(e.target.value)}
                        disabled={isImportingDistricts}
                    />
                    <Button
                        onClick={handleImportDistricts}
                        disabled={isImportingDistricts || !districtsJson.trim()}
                        className="w-full"
                    >
                        {isImportingDistricts ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <Upload className="mr-2 h-4 w-4" />
                                Import Districts
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
