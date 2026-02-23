export function toRedisBool(value: boolean): 'true' | 'false' {
    return value ? 'true' : 'false';
}

export function fromRedisBool(value: string | undefined): boolean {
    return value === 'true';
}
