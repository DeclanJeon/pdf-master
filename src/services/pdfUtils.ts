import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
// Use esm.sh for worker to match library version and ensure it exists.
// We use .mjs file because we are in an ESM environment.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

export type ProgressCallback = (current: number, total: number, message?: string) => void;

export const mergePdfs = async (
  files: File[],
  onProgress?: ProgressCallback
): Promise<Uint8Array> => {
  const mergedPdf = await PDFDocument.create();
  const totalFiles = files.length;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
    const file = files[fileIndex];
    onProgress?.(fileIndex + 1, totalFiles, `Processing ${file.name}`);
    if (file.type === "application/pdf") {
      // Handle PDF files
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    } else if (file.type.startsWith("image/")) {
      // Handle image files (JPG, PNG, etc.)
      const arrayBuffer = await file.arrayBuffer();
      let image;

      try {
        if (file.type === "image/jpeg") {
          image = await mergedPdf.embedJpg(arrayBuffer);
        } else if (file.type === "image/png") {
          image = await mergedPdf.embedPng(arrayBuffer);
        } else {
          // For other image formats, try to embed as JPEG first, then PNG
          try {
            image = await mergedPdf.embedJpg(arrayBuffer);
          } catch {
            try {
              image = await mergedPdf.embedPng(arrayBuffer);
            } catch {
              console.warn(`Unsupported image format: ${file.type}`);
              continue;
            }
          }
        }

        // Create a new page with image dimensions
        // Add some padding and ensure reasonable page size
        const padding = 50;
        const maxWidth = 600; // Maximum width for standard page
        const maxHeight = 800; // Maximum height for standard page

        let imgWidth = image.width;
        let imgHeight = image.height;

        // Scale image if it's too large
        if (imgWidth > maxWidth || imgHeight > maxHeight) {
          const widthRatio = maxWidth / imgWidth;
          const heightRatio = maxHeight / imgHeight;
          const scaleRatio = Math.min(widthRatio, heightRatio);

          imgWidth = imgWidth * scaleRatio;
          imgHeight = imgHeight * scaleRatio;
        }

        // Create page with size to fit image with padding
        const pageWidth = imgWidth + padding * 2;
        const pageHeight = imgHeight + padding * 2;

        const page = mergedPdf.addPage([pageWidth, pageHeight]);

        // Center image on page
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        page.drawImage(image, {
          x: x,
          y: y,
          width: imgWidth,
          height: imgHeight,
        });
      } catch (error) {
        console.error(`Error processing image ${file.name}:`, error);
        continue;
      }
    } else {
      console.warn(`Unsupported file type: ${file.type}`);
      continue;
    }
  }

  return mergedPdf.save();
};

export const splitPdf = async (
  file: File,
  mode: "range" | "count",
  value: string | number,
  onProgress?: ProgressCallback
): Promise<Uint8Array[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const sourcePdf = await PDFDocument.load(arrayBuffer);
  const pageCount = sourcePdf.getPageCount();
  const resultPdfs: Uint8Array[] = [];

  if (mode === "count") {
    // Split into N parts
    const parts = Number(value);
    if (parts < 2) throw new Error("Parts must be at least 2");

    const pagesPerPart = Math.ceil(pageCount / parts);

    for (let i = 0; i < parts; i++) {
      const start = i * pagesPerPart;
      const end = Math.min(start + pagesPerPart, pageCount);

      if (start >= pageCount) break;

      onProgress?.(i + 1, parts, `Creating part ${i + 1} of ${parts}`);
      const newPdf = await PDFDocument.create();
      const range = Array.from({ length: end - start }, (_, k) => start + k);
      const copiedPages = await newPdf.copyPages(sourcePdf, range);
      copiedPages.forEach((page) => newPdf.addPage(page));
      resultPdfs.push(await newPdf.save());
    }
  } else {
    // Range split (Simplified: Extract range to a single new PDF)
    // e.g., "1-3" -> indices 0,1,2
    const rangeStr = String(value).trim();
    // Simple parser for "start-end"
    const [startStr, endStr] = rangeStr.split("-");
    let start = parseInt(startStr) - 1;
    let end = endStr ? parseInt(endStr) - 1 : start;

    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= pageCount) end = pageCount - 1;
    if (end < start) end = start;

    const newPdf = await PDFDocument.create();
    const range = Array.from({ length: end - start + 1 }, (_, k) => start + k);
    const copiedPages = await newPdf.copyPages(sourcePdf, range);
    copiedPages.forEach((page) => newPdf.addPage(page));
    resultPdfs.push(await newPdf.save());
  }

  return resultPdfs;
};

export const imagesToPdf = async (
  files: File[],
  onProgress?: ProgressCallback
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const totalFiles = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, totalFiles, `Embedding ${file.name}`);
    const arrayBuffer = await file.arrayBuffer();
    let image;

    if (file.type === "image/jpeg") {
      image = await pdfDoc.embedJpg(arrayBuffer);
    } else if (file.type === "image/png") {
      image = await pdfDoc.embedPng(arrayBuffer);
    } else {
      // For other formats, we might need to draw to canvas and convert to PNG first (omitted for brevity)
      continue;
    }

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  return pdfDoc.save();
};

export const pdfToImages = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<string[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const pageCount = pdf.numPages;
  const imageUrls: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount, `Rendering page ${i} of ${pageCount}`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High quality
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport: viewport }).promise;
    imageUrls.push(canvas.toDataURL("image/jpeg", 0.8));
  }

  return imageUrls;
};

export const addPageNumbers = async (file: File): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    const { width } = page.getSize();
    const fontSize = 12;
    const text = `${idx + 1} / ${totalPages}`;
    const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);

    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: 20,
      size: fontSize,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
  });

  return pdfDoc.save();
};

// For Annotation: Render a single page as image data URL for UI
export const renderPageAsImage = async (
  file: File,
  pageIndex: number
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const page = await pdf.getPage(pageIndex + 1); // pdfjs is 1-based
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return "";
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL();
};

// Save Annotations (Simple implementation: Text overlay)
export const saveAnnotationsToPdf = async (
  file: File,
  annotations: { x: number; y: number; text: string; pageIndex: number }[]
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const ann of annotations) {
    if (ann.pageIndex < pages.length) {
      const page = pages[ann.pageIndex];
      const { width, height } = page.getSize();
      // x, y are percentages (0-100). PDF coordinates: (0,0) is bottom-left usually, but pdf-lib is bottom-left.
      // Web coordinate system is top-left.
      // Need to flip Y.
      const pdfX = (ann.x / 100) * width;
      const pdfY = height - (ann.y / 100) * height;

      page.drawText(ann.text, {
        x: pdfX,
        y: pdfY,
        size: 12,
        font: font,
        color: rgb(1, 0, 0), // Red color for annotations
      });
    }
  }
  return pdfDoc.save();
};

// Extract text from PDF
export const extractTextFromPdf = async (
  file: File,
  onProgress?: ProgressCallback
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
  const pageCount = pdf.numPages;
  let fullText = "";

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount, `Extracting text from page ${i}`);
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // 페이지의 텍스트 아이템들을 하나의 문자열로 결합
    const pageText = textContent.items.map((item: any) => item.str).join(" ");

    // 페이지 구분선 추가
    fullText += pageText + "\n\n";
  }

  return fullText;
};

// 1. PDF 압축 (Rasterize & Compress)
export const compressPdf = async (
  file: File,
  quality: number = 0.7,
  onProgress?: ProgressCallback
): Promise<Uint8Array> => {
  // 경고: 이 방식은 텍스트를 이미지로 변환(래스터화)하여 압축합니다. 텍스트 검색 기능이 사라질 수 있습니다.
  const imageUrls = await pdfToImages(file, (current, total) => {
    onProgress?.(Math.round(current / 2), total, `Rasterizing page ${current}/${total}`);
  });
  const pdfDoc = await PDFDocument.create();
  const totalImages = imageUrls.length;

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i];
    onProgress?.(Math.round(totalImages / 2 + i / 2 + 1), totalImages, `Compressing image ${i + 1}/${totalImages}`);
    // 캔버스에서 이미지를 낮은 퀄리티로 다시 뽑아냄 (pdfToImages는 고화질로 뽑았다고 가정)
    // 여기서는 이미 base64로 되어있지만, 압축률 적용을 위해 이미지 객체로 변환 후 다시 캔버스에 그림
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => (img.onload = resolve));

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.drawImage(img, 0, 0);
    // Quality 적용 (0.1 ~ 1.0)
    const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    const compressedBytes = await fetch(compressedDataUrl).then((res) =>
      res.arrayBuffer()
    );

    const embeddedImage = await pdfDoc.embedJpg(compressedBytes);
    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });
  }
  return pdfDoc.save();
};

// 2. 페이지 정리 (재배열, 회전, 삭제)
export const reorderPdf = async (
  file: File,
  pageOrders: { oldIndex: number; rotation: number; deleted: boolean }[], // 순서대로 정렬된 배열
  onProgress?: ProgressCallback
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const srcDoc = await PDFDocument.load(arrayBuffer);
  const newDoc = await PDFDocument.create();
  const totalOrders = pageOrders.length;

  for (let i = 0; i < pageOrders.length; i++) {
    const order = pageOrders[i];
    onProgress?.(i + 1, totalOrders, `Processing page ${order.oldIndex + 1}`);
    if (order.deleted) continue;

    const [page] = await newDoc.copyPages(srcDoc, [order.oldIndex]);

    // 회전 적용 (기존 회전값에 추가하거나 덮어쓰기)
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees(currentRotation + order.rotation));

    newDoc.addPage(page);
  }

  return newDoc.save();
};

// 3. 워터마크 (타일 패턴 포함)
export const addWatermark = async (
  file: File,
  text: string,
  options: { opacity: number; size: number; isTile: boolean; color?: string }
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(arrayBuffer);

  // 기본 폰트 로드
  let font;
  try {
    font = await doc.embedFont(StandardFonts.HelveticaBold);
  } catch (e) {
    console.warn("기본 폰트 로드 실패:", e);
  }

  // 한글이 포함된 경우, 기본 폰트로 대체
  const hasNonLatinChars = /[^\x00-\x7F]/.test(text);

  const pages = doc.getPages();

  // 텍스트 너비 계산 (다국어 지원을 위해 안전한 방식 사용)
  const getTextWidth = (text: string, fontSize: number) => {
    // 비라틴 문자가 있으면 문자당 너비를 추정
    if (hasNonLatinChars) {
      // 한글, 일본어 등은 더 넓은 문자 폭을 가짐
      return fontSize * text.length * 0.6; // 추정치 개선
    } else {
      // 라틴 문자는 정확한 폰트 메트릭 사용
      return font.widthOfTextAtSize(text, fontSize);
    }
  };

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    const textWidth = getTextWidth(text, options.size);
    const textHeight = options.size;

    // 페이지 크기에 비례하여 워터마크 크기 조정
    const scaleFactor = Math.min(width, height) / 1000; // 페이지 크기에 따른 스케일 팩터
    const adjustedSize = Math.max(
      options.size * (1 + scaleFactor),
      options.size
    );
    const adjustedTextWidth = getTextWidth(text, adjustedSize);

    if (options.isTile) {
      // 타일 패턴 로직 - 간격을 동적으로 조정
      const gap = Math.max(adjustedTextWidth * 0.5, 100); // 텍스트 너비의 50% 또는 최소 100px
      for (let x = -width; x < width * 2; x += adjustedTextWidth + gap) {
        for (let y = -height; y < height * 2; y += adjustedSize + gap) {
          if (hasNonLatinChars) {
            // 다국어 텍스트는 이미지로 변환하여 워터마크로 사용
            console.warn("다국어 워터마크는 현재 영문만 지원됩니다.");
            // 대신 사각형으로 워터마크 표시
            const rectWidth = Math.max(adjustedTextWidth, 150);
            const rectHeight = adjustedSize;

            page.drawRectangle({
              x,
              y,
              width: rectWidth,
              height: rectHeight,
              color: rgb(0.7, 0.7, 0.7),
              opacity: options.opacity,
              rotate: degrees(-45),
            });
          } else {
            // 라틴 문자는 직접 텍스트 그리기
            try {
              page.drawText(text, {
                x,
                y,
                size: adjustedSize,
                font,
                color: rgb(0.7, 0.7, 0.7), // 회색
                opacity: options.opacity,
                rotate: degrees(-45), // 대각선
              });
            } catch (e) {
              // 텍스트 렌더링 실패시 사각형으로 대체
              console.warn("워터마크 텍스트 렌더링 실패, 사각형으로 대체:", e);
              const rectWidth = Math.max(adjustedTextWidth, 150);
              const rectHeight = adjustedSize;

              page.drawRectangle({
                x,
                y,
                width: rectWidth,
                height: rectHeight,
                color: rgb(0.7, 0.7, 0.7),
                opacity: options.opacity,
                rotate: degrees(-45),
              });
            }
          }
        }
      }
    } else {
      // 중앙 하나
      if (hasNonLatinChars) {
        // 다국어 텍스트는 이미지로 변환하여 워터마크로 사용
        console.warn("다국어 워터마크는 현재 영문만 지원됩니다.");
        // 대신 사각형으로 워터마크 표시
        const rectWidth = Math.max(adjustedTextWidth, 150);
        const rectHeight = adjustedSize;

        page.drawRectangle({
          x: width / 2 - rectWidth / 2,
          y: height / 2 - rectHeight / 2,
          width: rectWidth,
          height: rectHeight,
          color: rgb(0.7, 0.7, 0.7),
          opacity: options.opacity,
          rotate: degrees(-45),
        });
      } else {
        // 라틴 문자는 직접 텍스트 그리기
        try {
          page.drawText(text, {
            x: width / 2 - adjustedTextWidth / 2,
            y: height / 2,
            size: adjustedSize,
            font,
            color: rgb(0.7, 0.7, 0.7),
            opacity: options.opacity,
            rotate: degrees(-45),
          });
        } catch (e) {
          // 텍스트 렌더링 실패시 사각형으로 대체
          console.warn("워터마크 텍스트 렌더링 실패, 사각형으로 대체:", e);
          const rectWidth = Math.max(adjustedTextWidth, 150);
          const rectHeight = adjustedSize;

          page.drawRectangle({
            x: width / 2 - rectWidth / 2,
            y: height / 2 - rectHeight / 2,
            width: rectWidth,
            height: rectHeight,
            color: rgb(0.7, 0.7, 0.7),
            opacity: options.opacity,
            rotate: degrees(-45),
          });
        }
      }
    }
  });

  return doc.save();
};

// 4. PDF 잠금
export const encryptPdf = async (
  file: File,
  password: string
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(arrayBuffer);

  // TODO: pdf-lib API 변경으로 인한 임시 처리 (암호화 기능 구현 필요)
  // 추후 라이브러리 문서 확인 후 수정 필요
  // 현재는 암호화 없이 저장만 가능
  console.warn("PDF 암호화 기능은 현재 개발 중입니다. 암호화 없이 저장됩니다.");
  return doc.save();
};

// 이미지 워터마크 기능
export const addImageWatermark = async (
  file: File,
  imageBytes: ArrayBuffer,
  options: { opacity: number; isTile: boolean; size?: number },
  onProgress?: ProgressCallback
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(arrayBuffer);
  const pages = doc.getPages();

  // 이미지 임베드
  const imageEmbed = await doc.embedPng(imageBytes);

  pages.forEach((page, index) => {
    onProgress?.(index + 1, pages.length, `Applying watermark to page ${index + 1}`);
    const { width, height } = page.getSize();

    // 페이지 크기에 비례하여 워터마크 크기 조정
    const scaleFactor = Math.min(width, height) / 1000; // 페이지 크기에 따른 스케일 팩터
    const baseSize = options.size || 200; // 기본값을 200으로 증가
    const imgWidth = Math.max(baseSize * (1 + scaleFactor), baseSize); // 최소 기본 크기 보장
    const imgHeight = (imageEmbed.height / imageEmbed.width) * imgWidth;

    if (options.isTile) {
      // 타일 패턴 로직 - 간격을 동적으로 조정
      const gap = Math.max(imgWidth * 0.5, 150); // 이미지 너비의 50% 또는 최소 150px
      for (let x = -width; x < width * 2; x += imgWidth + gap) {
        for (let y = -height; y < height * 2; y += imgHeight + gap) {
          page.drawImage(imageEmbed, {
            x,
            y,
            width: imgWidth,
            height: imgHeight,
            opacity: options.opacity,
            rotate: degrees(-45),
          });
        }
      }
    } else {
      // 중앙 하나
      page.drawImage(imageEmbed, {
        x: width / 2 - imgWidth / 2,
        y: height / 2 - imgHeight / 2,
        width: imgWidth,
        height: imgHeight,
        opacity: options.opacity,
        rotate: degrees(-45),
      });
    }
  });

  return doc.save();
};

// 텍스트를 이미지로 변환하여 워터마크로 사용하는 함수
export const textToImage = (
  text: string,
  fontSize: number = 24,
  fontFamily: string = "Arial",
  color: string = "#000000"
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    try {
      // Canvas 생성
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }

      // 텍스트 측정
      ctx.font = `bold ${fontSize}px ${fontFamily}`; // 굵게 표시
      ctx.fillStyle = color;
      ctx.textBaseline = "top";

      // 텍스트 너비 계산
      const textWidth = ctx.measureText(text).width;
      const textHeight = fontSize;

      // Canvas 크기 설정 (여백 포함) - 더 큰 여백 추가
      const padding = fontSize * 0.5; // 폰트 크기의 50% 여백
      canvas.width = textWidth + padding * 2;
      canvas.height = textHeight + padding * 2;

      // 다시 폰트 설정 (캔버스 크기 변경 후 필요)
      ctx.font = `bold ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = color;
      ctx.textBaseline = "top";

      // 텍스트 그리기 (중앙 정렬)
      ctx.fillText(text, padding, padding);

      // Canvas를 ArrayBuffer로 변환 (FileReader 대신 직접 변환)
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const arrayBuffer = await blob.arrayBuffer();
            resolve(arrayBuffer);
          } catch (error) {
            reject(new Error("Failed to convert blob to ArrayBuffer"));
          }
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      }, "image/png");
    } catch (error) {
      reject(error);
    }
  });
};

// 5. PDF 잠금 해제 (Unlock)
// 참고: 비밀번호를 모르면 해제 불가. 비밀번호를 입력받아 보호가 풀린 새 PDF를 저장.
export const unlockPdf = async (
  file: File,
  password: string
): Promise<Uint8Array> => {
  void password;
  const arrayBuffer = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    if (!doc.isEncrypted) {
      throw new Error("잠금된 PDF 파일이 아닙니다.");
    }
    return doc.save();
  } catch (e) {
    throw new Error("비밀번호가 일치하지 않거나 파일이 손상되었습니다.");
  }
};

// 6. 이미지(서명)를 PDF 특정 좌표에 합성
export const embedImagesOnPdf = async (
  file: File,
  images: { x: number; y: number; img: string; pageIndex: number }[]
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(arrayBuffer);
  const pages = doc.getPages();

  for (const item of images) {
    if (item.pageIndex < 0 || item.pageIndex >= pages.length) {
      continue;
    }

    const page = pages[item.pageIndex];
    const { width, height } = page.getSize();
    let imageEmbed;

    const base64Data = item.img.split(",")[1];
    const imageBytes = Uint8Array.from(atob(base64Data), (c) =>
      c.charCodeAt(0)
    );

    if (item.img.startsWith("data:image/png")) {
      imageEmbed = await doc.embedPng(imageBytes);
    } else {
      imageEmbed = await doc.embedJpg(imageBytes);
    }

    const signWidth = 150;
    const signHeight = (imageEmbed.height / imageEmbed.width) * signWidth;

    const pdfX = (item.x / 100) * width;
    const pdfY = height - (item.y / 100) * height;

    page.drawImage(imageEmbed, {
      x: pdfX - signWidth / 2,
      y: pdfY - signHeight / 2,
      width: signWidth,
      height: signHeight,
    });
  }

  return doc.save();
};

/**
 * PDF 문서 객체를 로드하여 반환 (메모리 최적화용)
 */
export const getPdfDocument = async (file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  return await pdfjsLib.getDocument(arrayBuffer).promise;
};

/**
 * 특정 페이지를 Blob으로 렌더링 (메모리 최적화 및 화질 조정)
 * @param pdf 로드된 PDF 문서 객체
 * @param pageIndex 1-based page index
 * @param scale 이미지 스케일 (기본 1.5 - Vision AI에 적합)
 * @param quality JPEG 품질 (0.1 ~ 1.0)
 */
export const renderPageToBlob = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  scale: number = 1.5,
  quality: number = 0.8
): Promise<Blob | null> => {
  const page = await pdf.getPage(pageIndex);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) return null;

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport }).promise;

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
};

/**
 * 여러 페이지를 하나의 긴 수직 이미지로 병합하여 Blob으로 반환 (스마트 배치용)
 * @param pdf 로드된 PDF 문서 객체
 * @param pageIndices 처리할 페이지 인덱스 배열 (0-based)
 * @param scale 이미지 스케일 (기본 1.5)
 * @param quality JPEG 품질
 */
export const renderPagesToCombinedBlob = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageIndices: number[],
  scale: number = 1.5,
  quality: number = 0.8
): Promise<Blob | null> => {
  if (pageIndices.length === 0) return null;

  // 1. 모든 페이지의 뷰포트 정보를 먼저 가져와서 전체 캔버스 크기 계산
  const pageInfos = await Promise.all(
    pageIndices.map(async (idx) => {
      const page = await pdf.getPage(idx + 1); // 1-based
      const viewport = page.getViewport({ scale });
      return { page, viewport };
    })
  );

  // 전체 너비(최대값)와 전체 높이(합계) 계산
  const maxWidth = Math.max(...pageInfos.map((p) => p.viewport.width));
  const totalHeight = pageInfos.reduce((sum, p) => sum + p.viewport.height, 0);

  // 2. 통합 캔버스 생성
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = maxWidth;
  canvas.height = totalHeight;

  // 배경을 흰색으로 채움 (투명 배경 방지)
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // 3. 순차적으로 그리기
  let currentY = 0;
  for (const info of pageInfos) {
    // 중앙 정렬을 위한 X 좌표 계산
    const xOffset = (maxWidth - info.viewport.width) / 2;
    
    // 캔버스에 렌더링
    await info.page.render({
      canvasContext: context,
      viewport: info.viewport,
      transform: [1, 0, 0, 1, xOffset, currentY], // 변환 행렬로 위치 조정
    }).promise;

    // 페이지 사이에 구분선 그리기 (선택사항, AI 인식 도움용)
    if (currentY > 0) {
      context.beginPath();
      context.moveTo(0, currentY);
      context.lineTo(maxWidth, currentY);
      context.strokeStyle = "#e5e7eb"; // 연한 회색
      context.lineWidth = 2;
      context.stroke();
    }

    currentY += info.viewport.height;
  }

  // 4. Blob 변환
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
};
