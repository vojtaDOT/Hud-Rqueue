import { DatabaseManager } from '@/components/database/database-manager';

export default function DatabasePage() {
    return (
        <main className="h-dvh w-full overflow-hidden flex flex-col">
            <DatabaseManager />
        </main>
    );
}
