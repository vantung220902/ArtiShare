// The project doesn't depend on @types/node (its globals would leak into src/), but the screenshot
// generator and the F018 spec read and write a few files. This declares just those calls.
interface FileBuffer extends Uint8Array {
  subarray(start?: number, end?: number): FileBuffer;
  readUInt32BE(offset: number): number;
  toString(encoding?: 'utf8' | 'base64'): string;
}

declare module 'node:fs' {
  export function readFileSync(path: string | URL): FileBuffer;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
