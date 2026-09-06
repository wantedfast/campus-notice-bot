// Next.js replaces this public variable during build; keep it aligned with basePath.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export function apiPath(path: string) { return `${basePath}${path}`; }
