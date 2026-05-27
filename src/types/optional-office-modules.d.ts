declare module "docx" {
  export class Paragraph { constructor(options?: unknown); }
  export class Document { constructor(options?: unknown); }
  export const Packer: { toBlob(document: Document): Promise<Blob> };
  export class TextRun { constructor(options?: unknown); }
}

declare module "file-saver" {
  export function saveAs(data: Blob | File | string, filename?: string): void;
}

declare module "mammoth" {
  const mammoth: {
    convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}

declare module "jszip" {
  type JSZipInput = string | Blob | ArrayBuffer | Uint8Array;
  type JSZipObject = {
    dir: boolean;
    async(type: 'string'): Promise<string>;
    async(type: 'uint8array'): Promise<Uint8Array>;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
    async(type: 'blob'): Promise<Blob>;
  };

  export default class JSZip {
    constructor();
    static loadAsync(data: Blob | ArrayBuffer | Uint8Array): Promise<JSZip>;
    file(path: string): JSZipObject | null;
    file(path: string, data: JSZipInput, options?: Record<string, unknown>): this;
    generateAsync(options: { type: 'blob' }): Promise<Blob>;
    generateAsync(options: { type: 'uint8array' }): Promise<Uint8Array>;
    files: Record<string, JSZipObject>;
  }
}
