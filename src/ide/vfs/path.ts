const SEP = "/";

export function normalizePath(rawPath: string): string {
    if (!rawPath || rawPath.trim() === "") {
        return SEP;
    }

    const withSlashes = rawPath.replace(/\\/g, SEP);
    const parts = withSlashes
        .split(SEP)
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && part !== ".");

    const normalizedParts: string[] = [];
    for (const part of parts) {
        if (part === "..") {
            normalizedParts.pop();
        } else {
            normalizedParts.push(part);
        }
    }

    return `${SEP}${normalizedParts.join(SEP)}`;
}

export function getName(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === SEP) {
        return SEP;
    }
    const parts = normalized.split(SEP).filter(Boolean);
    return parts[parts.length - 1] ?? SEP;
}

export function getParentPath(path: string): string | null {
    const normalized = normalizePath(path);
    if (normalized === SEP) {
        return null;
    }

    const parts = normalized.split(SEP).filter(Boolean);
    if (parts.length <= 1) {
        return SEP;
    }

    return `${SEP}${parts.slice(0, -1).join(SEP)}`;
}

export function joinPath(parent: string, name: string): string {
    const parentNormalized = normalizePath(parent);
    const childName = name.trim().replace(/\//g, "");
    if (parentNormalized === SEP) {
        return normalizePath(`${SEP}${childName}`);
    }
    return normalizePath(`${parentNormalized}${SEP}${childName}`);
}
