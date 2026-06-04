export interface CursorData {
    id: string;
}

export function encodeCursor(id: string): string {
    return btoa(id);
}

export function decodeCursor(cursor: string): CursorData {
    return { id: atob(cursor) };
}
