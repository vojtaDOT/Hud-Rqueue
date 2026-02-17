import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockData } from "../types";

interface RemoveElementConfigProps {
    block: BlockData;
    onChange: (id: string, newConfig: NonNullable<BlockData['config']>) => void;
}

export function RemoveElementConfig({ block, onChange }: RemoveElementConfigProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="space-y-2">
                <Label htmlFor="selector">Element to Remove (Selector)</Label>
                <Input
                    id="selector"
                    placeholder="e.g. #cookie-banner"
                    value={block.config?.selector || ''}
                    onChange={(e) => onChange(block.id, { ...block.config, selector: e.target.value })}
                />
            </div>
            <div className="text-xs text-white/50">
                This element will be removed from the DOM before processing further steps.
            </div>
        </div>
    );
}
