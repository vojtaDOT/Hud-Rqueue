import { DatabaseManager } from '@/components/database/database-manager';

export default function DatabasePage() {
    return (
        <main className="min-h-dvh w-full flex flex-col">
            <DatabaseManager />
        </main>
    );
}
