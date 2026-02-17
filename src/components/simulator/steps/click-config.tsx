import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockData } from "../types";

interface ClickConfigProps {
    block: BlockData;
    onChange: (id: string, newConfig: NonNullable<BlockData['config']>) => void;
}

export function ClickConfig({ block, onChange }: ClickConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="selector">Element to Click</Label>
                <Input
                    id="selector"
                    placeholder="e.g. #load-more-btn"
                    value={block.config?.selector || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, selector: e.target.value })}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="wait">Wait After (ms)</Label>
                <Input
                    id="wait"
                    type="number"
                    placeholder="1000"
                    value={block.config?.wait || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, wait: e.target.value })}
                />
            </div>
        </div>
    );
}
