
import { DataSeeder } from '@/components/data-seeder';
import { AnimatedBackground } from '@/components/animated-background';

export default function DataPage() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 relative pt-20">
            <AnimatedBackground />

            <div className="w-full space-y-8 z-10">
                <DataSeeder />
            </div>
        </main>
    );
}
