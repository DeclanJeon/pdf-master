#!/usr/bin/env python3
"""PDF → DOCX → ODT → HWPX 변환 파이프라인

사용법:
  python scripts/convert_pipeline.py input.pdf [-o output.hwpx] [--keep-intermediate]
  
단계:
  1. PDF → DOCX  (pdf_to_docx.py)
  2. DOCX → ODT  (libreoffice --convert-to odt)
  3. ODT → HWPX  (odt_to_hwpx.py)
"""
import argparse, os, sys, subprocess, tempfile, shutil

def step_pdf_to_docx(pdf_path, output_dir):
    """PDF → DOCX"""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pdf_to_docx import analyze_page, build_docx
    import fitz
    
    docx_path = os.path.join(output_dir, os.path.splitext(os.path.basename(pdf_path))[0] + '.docx')
    
    doc = fitz.open(pdf_path)
    # 모든 페이지 병합 (현재는 1페이지 지원)
    all_pages = []
    for page in doc:
        all_pages.append(analyze_page(page, 'faithful'))
    
    # 첫 페이지만 처리
    docx_bytes = build_docx(all_pages[0], 'faithful')
    
    with open(docx_path, 'wb') as f:
        f.write(docx_bytes)
    
    print(f'[1/3] PDF → DOCX: {docx_path}')
    return docx_path

def step_docx_to_odt(docx_path, output_dir):
    """DOCX → ODT (LibreOffice)"""
    result = subprocess.run(
        ['libreoffice', '--headless', '--convert-to', 'odt', '--outdir', output_dir, docx_path],
        capture_output=True, text=True, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(f'LibreOffice 변환 실패: {result.stderr}')
    
    odt_path = docx_path.rsplit('.', 1)[0] + '.odt'
    if not os.path.exists(odt_path):
        # LibreOffice가 다른 위치에 생성했을 수 있음
        base = os.path.splitext(os.path.basename(docx_path))[0]
        odt_path = os.path.join(output_dir, base + '.odt')
    
    print(f'[2/3] DOCX → ODT: {odt_path}')
    return odt_path

def step_odt_to_hwpx(odt_path, output_path=None):
    """ODT → HWPX"""
    from odt_to_hwpx import convert_file as odt2hwpx
    
    hwpx_path = odt2hwpx(odt_path, output_path)
    print(f'[3/3] ODT → HWPX: {hwpx_path}')
    return hwpx_path

def convert_pipeline(pdf_path, output_path=None, keep_intermediate=False):
    """전체 파이프라인 실행"""
    tmp_dir = tempfile.mkdtemp(prefix='pdf-pipeline-')
    
    try:
        # 1. PDF → DOCX
        docx_path = step_pdf_to_docx(pdf_path, tmp_dir)
        
        # 2. DOCX → ODT
        odt_path = step_docx_to_odt(docx_path, tmp_dir)
        
        # 3. ODT → HWPX
        if output_path is None:
            output_path = os.path.splitext(os.path.abspath(pdf_path))[0] + '.hwpx'
        hwpx_path = step_odt_to_hwpx(odt_path, output_path)
        
        # 중간 파일 복사 (옵션)
        if keep_intermediate:
            base = os.path.splitext(output_path)[0]
            shutil.copy2(docx_path, base + '.docx')
            shutil.copy2(odt_path, base + '.odt')
            print(f'중간 파일: {base}.docx, {base}.odt')
        
        print(f'\n[완료] {pdf_path} → {hwpx_path}')
        return hwpx_path
        
    finally:
        if not keep_intermediate:
            shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='PDF → DOCX → ODT → HWPX 변환 파이프라인')
    parser.add_argument('input', help='입력 PDF 파일 경로')
    parser.add_argument('-o', '--output', help='출력 HWPX 파일 경로')
    parser.add_argument('--keep-intermediate', action='store_true',
                       help='DOCX, ODT 중간 파일 유지')
    args = parser.parse_args()
    
    convert_pipeline(args.input, args.output, args.keep_intermediate)
