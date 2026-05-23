import {
  Paragraph,
  Document as DocxDocument,
  Packer,
  TextRun,
} from "docx";
import { saveAs } from "file-saver";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";

export type ProgressCallback = (current: number, total: number, message?: string) => void;

type EpubConversionDiagnostics = {
  chapterSkips: Map<string, number>;
  imageSkips: Map<string, number>;
};

type ManifestEntry = {
  href: string;
  mediaType: string;
};

// PDF.js 워커 설정 (pdfUtils.ts와 동일하게 설정)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

/**
 * PDF to DOCX: 텍스트 추출 기반의 단순 변환
 * (복잡한 레이아웃/이미지는 제외하고 텍스트 위주로 변환)
 */
export const pdfToDocx = async (
  file: File,
  option: "preserve-layout" | "extract-text" = "preserve-layout",
  onProgress?: ProgressCallback
): Promise<void> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const docChildren: Paragraph[] = [];
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(i, totalPages, `Converting page ${i} of ${totalPages}`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();

      const pageText = textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(option === "extract-text" ? " " : "\n")
        .trim();

      if (!pageText) {
        continue;
      }

      // DOCX 단락 생성
      docChildren.push(
        new Paragraph({
          children: [new TextRun(pageText)],
          spacing: { after: 200 }, // 단락 간 간격
        })
      );

      if (option === "preserve-layout" && i < pdf.numPages) {
        docChildren.push(new Paragraph({ text: "--- Page Break ---" }));
      }
    }

    const doc = new DocxDocument({
      sections: [{ properties: {}, children: docChildren }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${file.name.replace(".pdf", "")}.docx`);
  } catch (error) {
    console.error("PDF to DOCX Error:", error);
    throw new Error("PDF를 DOCX로 변환하는데 실패했습니다.");
  }
};

const dirname = (path: string) => {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx + 1);
};

const incrementBucket = (buckets: Map<string, number>, key: string) => {
  buckets.set(key, (buckets.get(key) || 0) + 1);
};

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getElementsByLocalName = (root: Document | Element, localName: string) => {
  const direct = Array.from(root.getElementsByTagName(localName));
  if (direct.length > 0) {
    return direct;
  }

  return Array.from(root.getElementsByTagName("*")).filter(
    (node) => node.localName?.toLowerCase() === localName
  );
};

const normalizePath = (path: string) => {
  const output: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join("/");
};

const resolvePath = (baseDir: string, relativePath: string) => {
  const decoded = safeDecodeURIComponent(relativePath);
  if (!baseDir) return normalizePath(decoded);
  return normalizePath(`${baseDir}${decoded}`);
};

const sanitizeHref = (value: string) => value.split("#")[0].split("?")[0];

const toAssetMimeType = (path: string): string | null => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
};

const toBase64 = (bytes: Uint8Array) => {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const toDataUrlFromBytes = (bytes: Uint8Array, mimeType: string) => {
  if (mimeType === "image/svg+xml") {
    const svgText = new TextDecoder("utf-8").decode(bytes);
    return `data:${mimeType};charset=utf-8,${encodeURIComponent(svgText)}`;
  }
  return `data:${mimeType};base64,${toBase64(bytes)}`;
};

const stripFileExtension = (name: string) => name.replace(/\.[^.]+$/, "");

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  if (!items.length) {
    return [];
  }

  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runWorker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  };

  const poolSize = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
};

const getRootfilePath = (containerDoc: Document) => {
  const rootfiles = getElementsByLocalName(containerDoc, "rootfile");
  if (!rootfiles.length) {
    return null;
  }

  const preferred = rootfiles.find(
    (node) =>
      (node.getAttribute("media-type") || "").trim().toLowerCase() ===
      "application/oebps-package+xml"
  );

  return (
    preferred?.getAttribute("full-path") ||
    rootfiles[0].getAttribute("full-path") ||
    null
  );
};

const getOpfTitle = (opfDoc: Document, fallbackName: string) => {
  const metadata = getElementsByLocalName(opfDoc, "metadata")[0];
  if (!metadata) {
    return fallbackName;
  }

  const titleNode = getElementsByLocalName(metadata, "title")[0];
  return titleNode?.textContent?.trim() || fallbackName;
};

const getManifestMap = (opfDoc: Document) => {
  const manifestMap = new Map<string, ManifestEntry>();
  const manifest = getElementsByLocalName(opfDoc, "manifest")[0];
  if (!manifest) {
    return manifestMap;
  }

  const items = getElementsByLocalName(manifest, "item");
  for (const item of items) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") || "";
    if (id && href) {
      manifestMap.set(id, { href, mediaType });
    }
  }

  return manifestMap;
};

const getSpineIds = (opfDoc: Document) => {
  const spine = getElementsByLocalName(opfDoc, "spine")[0];
  if (!spine) {
    return [];
  }

  return getElementsByLocalName(spine, "itemref")
    .map((node) => node.getAttribute("idref"))
    .filter((id): id is string => Boolean(id));
};

export const epubToPdf = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<void> => {
  try {
    const diagnostics: EpubConversionDiagnostics = {
      chapterSkips: new Map(),
      imageSkips: new Map(),
    };

    let lastProgress = -1;
    const emitProgress = (value: number, message: string) => {
      const normalized = Math.max(0, Math.min(100, Math.round(value)));
      if (normalized !== lastProgress || normalized === 100) {
        lastProgress = normalized;
        onProgress?.(normalized, 100, message);
      }
    };

    emitProgress(0, "Loading EPUB archive");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const containerXml = await zip.file("META-INF/container.xml")?.async("string");

    if (!containerXml) {
      throw new Error("Invalid EPUB: container.xml not found");
    }

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, "application/xml");
    const rootfilePath = getRootfilePath(containerDoc);

    if (!rootfilePath) {
      throw new Error("Invalid EPUB: OPF rootfile path missing");
    }

    const opfText = await zip.file(rootfilePath)?.async("string");
    if (!opfText) {
      throw new Error("Invalid EPUB: package file not found");
    }

    const opfDoc = parser.parseFromString(opfText, "application/xml");
    const title = getOpfTitle(opfDoc, stripFileExtension(file.name));

    const manifestMap = getManifestMap(opfDoc);
    const spineIds = getSpineIds(opfDoc);

    if (!spineIds.length) {
      throw new Error("EPUB 변환 실패: spine 항목을 찾지 못했습니다.");
    }

    emitProgress(20, "Indexing EPUB chapters");
    const baseDir = dirname(rootfilePath);
    const chapterPaths: string[] = [];
    const sharedStyleTexts: string[] = [];

    for (const entry of manifestMap.values()) {
      if (!/css/i.test(entry.mediaType)) {
        continue;
      }

      const cssPath = resolvePath(baseDir, entry.href);
      const cssText = await zip.file(cssPath)?.async("string");
      if (cssText) {
        sharedStyleTexts.push(cssText);
      }
    }

    for (let spineIndex = 0; spineIndex < spineIds.length; spineIndex++) {
      const id = spineIds[spineIndex];
      emitProgress(
        20 + Math.round((spineIndex / spineIds.length) * 32),
        `Indexing chapter ${spineIndex + 1} of ${spineIds.length}`
      );

      const entry = manifestMap.get(id);
      if (!entry?.href) {
        incrementBucket(diagnostics.chapterSkips, "manifest-href-missing");
        continue;
      }

      chapterPaths.push(resolvePath(baseDir, entry.href));
    }

    if (!chapterPaths.length) {
      throw new Error("EPUB 변환 실패: 유효한 chapter 항목을 찾지 못했습니다.");
    }

    emitProgress(52, "Preparing chapter HTML in parallel");
    const chapterCount = chapterPaths.length;
    let preparedCount = 0;

    const chapterHtmlSections = await mapWithConcurrency<
      string,
      { bodyMarkup: string; styleText: string }
    >(
      chapterPaths,
      4,
      async (chapterPath) => {
        const chapterMarkup = await zip.file(chapterPath)?.async("string");
        if (!chapterMarkup) {
          incrementBucket(diagnostics.chapterSkips, "chapter-file-missing");
          preparedCount += 1;
          emitProgress(
            52 + Math.round((preparedCount / chapterCount) * 28),
            `Prepared chapter ${preparedCount} of ${chapterCount}`
          );
          return { bodyMarkup: "", styleText: "" };
        }

        const parser = new DOMParser();
        const chapterDoc = parser.parseFromString(chapterMarkup, "text/html");
        const chapterDir = dirname(chapterPath);

        const chapterStyleTexts: string[] = [];
        const styleNodes = Array.from(chapterDoc.querySelectorAll("style"));
        for (const styleNode of styleNodes) {
          const text = styleNode.textContent?.trim();
          if (text) chapterStyleTexts.push(text);
        }

        const linkNodes = Array.from(
          chapterDoc.querySelectorAll("link[rel~='stylesheet'][href]")
        );
        for (const linkNode of linkNodes) {
          const href = linkNode.getAttribute("href");
          if (!href) continue;
          const cssPath = resolvePath(chapterDir, sanitizeHref(href));
          const cssText = await zip.file(cssPath)?.async("string");
          if (cssText) chapterStyleTexts.push(cssText);
        }

        const imageNodes = Array.from(chapterDoc.querySelectorAll("img[src]"));
        for (const imageNode of imageNodes) {
          const src = imageNode.getAttribute("src");
          if (!src || src.startsWith("data:")) {
            continue;
          }

          const imagePath = resolvePath(chapterDir, sanitizeHref(src));
          const mimeType = toAssetMimeType(imagePath);
          const imageFile = zip.file(imagePath);
          if (!mimeType || !imageFile) {
            incrementBucket(diagnostics.imageSkips, "image-file-missing");
            continue;
          }

          const bytes = new Uint8Array(await imageFile.async("arraybuffer"));
          imageNode.setAttribute("src", toDataUrlFromBytes(bytes, mimeType));
        }

        const bodyMarkup = chapterDoc.body?.innerHTML?.trim() || "";
        if (!bodyMarkup) {
          incrementBucket(diagnostics.chapterSkips, "chapter-extraction-empty");
        }

        preparedCount += 1;
        emitProgress(
          52 + Math.round((preparedCount / chapterCount) * 28),
          `Prepared chapter ${preparedCount} of ${chapterCount}`
        );

        return {
          bodyMarkup,
          styleText: chapterStyleTexts.join("\n"),
        };
      }
    );

    const validSections = chapterHtmlSections.filter((section) => section.bodyMarkup.length > 0);
    if (!validSections.length) {
      const details = Array.from(diagnostics.chapterSkips.entries())
        .map(([reason, count]) => `${reason}:${count}`)
        .join(", ");
      throw new Error(
        details
          ? `EPUB 변환 실패: 본문 콘텐츠를 찾지 못했습니다. (${details})`
          : "EPUB 변환 실패: 본문 콘텐츠를 찾지 못했습니다."
      );
    }

    if (diagnostics.chapterSkips.size > 0 || diagnostics.imageSkips.size > 0) {
      console.warn("EPUB conversion partial warnings", {
        chapterSkips: Object.fromEntries(diagnostics.chapterSkips),
        imageSkips: Object.fromEntries(diagnostics.imageSkips),
      });
    }

    emitProgress(82, "Composing layout");
    const chapterMarkup = validSections
      .map(
        (section, index) =>
          `<article class="epub-chapter" data-index="${index}">${section.bodyMarkup}</article>`
      )
      .join("\n");

    const chapterStyleBlock = validSections.map((section) => section.styleText).join("\n");
    const sharedStyleBlock = sharedStyleTexts.join("\n");

    const printHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { font-family: "Noto Serif", "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans CJK JP", "Noto Sans CJK SC", serif; color: #111; line-height: 1.5; }
      .epub-book { max-width: 900px; margin: 0 auto; }
      .epub-title { font-size: 28px; font-weight: 700; margin: 0 0 24px; page-break-after: avoid; }
      .epub-chapter { break-inside: avoid; page-break-after: always; margin: 0 0 24px; }
      .epub-chapter:last-child { page-break-after: auto; }
      img, svg { max-width: 100%; height: auto; }
      table { width: 100%; border-collapse: collapse; }
      pre { white-space: pre-wrap; word-break: break-word; }
      ${sharedStyleBlock}
      ${chapterStyleBlock}
    </style>
  </head>
  <body>
    <main class="epub-book">
      <h1 class="epub-title">${title}</h1>
      ${chapterMarkup}
    </main>
  </body>
</html>`;

    emitProgress(92, "Rendering PDF headlessly");
    const response = await fetch("/api/render-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ html: printHtml }),
    });

    if (!response.ok) {
      let serverError = "헤드리스 PDF 렌더링에 실패했습니다.";
      try {
        const payload = await response.json();
        if (payload && typeof payload.error === "string") {
          serverError = payload.error;
        }
      } catch {
      }
      throw new Error(serverError);
    }

    emitProgress(98, "Downloading file");
    const pdfBlob = await response.blob();
    saveAs(pdfBlob, `${stripFileExtension(file.name)}.pdf`);
    emitProgress(100, "Done");
  } catch (error) {
    console.error("EPUB to PDF Error:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("EPUB를 PDF로 변환하는데 실패했습니다.");
  }
};

/**
 * DOCX to PDF: Mammoth를 이용한 HTML 변환 -> 인쇄/PDF 저장 유도
 * (클라이언트 사이드에서 완벽한 바이너리 변환은 불가능하므로, 미리보기를 띄우고 인쇄를 유도합니다)
 */
export const docxToPdf = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value; // 변환된 HTML 문자열 반환
  } catch (error) {
    console.error("DOCX to PDF Error:", error);
    throw new Error("DOCX 변환에 실패했습니다.");
  }
};
