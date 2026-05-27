#!/usr/bin/env python3
"""ODT → HWPX 변환기 v2

ODT(ZIP+XML)를 파싱하여 HWPX(ZIP+XML)로 변환.
HWPX는 한글(Hancom) 문서 포맷.

HWPUNIT: 1인치 = 7200, 1인치 = 25.4mm → 1mm ≈ 283.46
글자높이: 1pt = 100 unit
"""
import argparse, io, os, zipfile, re, copy
from xml.etree import ElementTree as ET

ODT_NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'style': 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo': 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'draw': 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    'xlink': 'http://www.w3.org/1999/xlink',
    'svg': 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'meta': 'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
}

HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
HH = 'http://www.hancom.co.kr/hwpml/2011/head'
HS = 'http://www.hancom.co.kr/hwpml/2011/section'
HC = 'http://www.hancom.co.kr/hwpml/2011/core'

MM_TO_HWP = 283.46
PT_TO_HWP = 100


def _q(ns_uri, tag):
    return f'{{{ns_uri}}}{tag}'

def cm_to_hwp(s):
    if not s: return 0
    v = float(re.sub(r'[a-z]+$', '', s))
    if 'mm' in s: return int(v * MM_TO_HWP)
    if 'in' in s: return int(v * 7200)
    return int(v * 10 * MM_TO_HWP)

def pt_to_hwp(s):
    if not s: return 1000
    v = float(re.sub(r'pt$', '', s))
    return int(v * PT_TO_HWP)


class Converter:
    def __init__(self, odt_bytes):
        self.odt = zipfile.ZipFile(io.BytesIO(odt_bytes))
        self.content = ET.fromstring(self.odt.read('content.xml'))
        self.styles = ET.fromstring(self.odt.read('styles.xml'))
        self.images = {n: self.odt.read(n) for n in self.odt.namelist() 
                       if n.startswith('Pictures/')}
        self._build_style_map()
        self.char_props = [{'height': 1000, 'face': None, 'bold': False, 'color': '#000000'}]
        self.para_props = [{'align': '0', 'spacing': None}]  # 0=left,1=right,2=center,3=justify
        self.border_fills = [{'type': 'none'}, {'type': 'solid'}]

    def _build_style_map(self):
        self.smap = {}
        for s in self.styles.findall(f'.//{_q(ODT_NS["style"],"style")}'):
            n = s.get(_q(ODT_NS["style"],'name'),'')
            self.smap[n] = s
        for s in self.content.findall(f'.//{_q(ODT_NS["style"],"style")}'):
            n = s.get(_q(ODT_NS["style"],'name'),'')
            self.smap[n] = s

    def _style_text_props(self, style_name):
        s = self.smap.get(style_name)
        if s is None: return {}
        tp = s.find(_q(ODT_NS["style"],'text-properties'))
        return dict(tp.attrib) if tp is not None else {}

    def _style_para_props(self, style_name):
        s = self.smap.get(style_name)
        if s is None: return {}
        pp = s.find(_q(ODT_NS["style"],'paragraph-properties'))
        return dict(pp.attrib) if pp is not None else {}

    def _get_charPr(self, face, size_pt, bold=False, color='#000000'):
        h = pt_to_hwp(str(size_pt)) if size_pt else 1000
        for i, cp in enumerate(self.char_props):
            if cp['height'] == h and cp['bold'] == bold and cp['face'] == face:
                return i
        idx = len(self.char_props)
        self.char_props.append({'height': h, 'face': face, 'bold': bold, 'color': color})
        return idx

    def _get_paraPr(self, align='left'):
        amap = {'left':'0','right':'1','center':'2','justify':'3','end':'1','start':'0'}
        aval = amap.get(align, '0')
        for i, pp in enumerate(self.para_props):
            if pp['align'] == aval: return i
        idx = len(self.para_props)
        self.para_props.append({'align': aval, 'spacing': None})
        return idx

    def convert(self):
        body = self.content.find(f'.//{_q(ODT_NS["office"],"body")}')
        text_el = body.find(_q(ODT_NS["office"],"text"))
        page = self._page_props()
        section = self._build_section(text_el)
        header = self._build_header(page)
        return self._zip(header, section)

    def _page_props(self):
        p = {'width':59528,'height':84186,'left':8504,'right':8504,'top':5668,'bottom':4252,
             'header':4252,'footer':4252}
        for pl in self.styles.findall(f'.//{_q(ODT_NS["style"],"page-layout")}'):
            plp = pl.find(_q(ODT_NS["style"],'page-layout-properties'))
            if plp is not None:
                fo = ODT_NS["fo"]
                w = plp.get(_q(fo,'page-width'),'')
                h = plp.get(_q(fo,'page-height'),'')
                if w: p['width'] = cm_to_hwp(w)
                if h: p['height'] = cm_to_hwp(h)
                for side in ['left','right','top','bottom']:
                    v = plp.get(_q(fo,f'margin-{side}'),'')
                    if v: p[side] = cm_to_hwp(v)
            break
        return p

    def _build_section(self, text_el):
        sec = ET.Element(_q(HS,'sec'))
        first = True
        for child in text_el:
            tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
            if tag == 'p':
                sec.append(self._para(child, first)); first = False
            elif tag == 'h':
                sec.append(self._para(child, first)); first = False
            elif tag == 'table':
                sec.append(self._table_para(child, first)); first = False
        return sec

    def _para(self, odt_p, first=False):
        p = ET.Element(_q(HP,'p'))
        p.set('id','0'); p.set('paraPrIDRef','0'); p.set('styleIDRef','0')
        p.set('pageBreak','0'); p.set('columnBreak','0'); p.set('merged','0')

        sname = odt_p.get(_q(ODT_NS["text"],'style-name'),'')
        pprops = self._style_para_props(sname)
        tprops = self._style_text_props(sname)
        align = pprops.get(_q(ODT_NS["fo"],'text-align'),'left').split()[0]
        pPrId = self._get_paraPr(align)
        p.set('paraPrIDRef', str(pPrId))

        # 텍스트 + 폰트/사이즈
        spans = odt_p.findall(f'.//{_q(ODT_NS["text"],"span")}')
        all_text = []
        face = None; size_pt = 10.0; bold = False
        
        if spans:
            for sp in spans:
                ssname = sp.get(_q(ODT_NS["text"],'style-name'),'')
                sp_props = self._style_text_props(ssname)
                fo = ODT_NS["fo"]
                fn = sp_props.get(_q(fo,'font-family'),'')
                fs = sp_props.get(_q(fo,'font-size'),'')
                fb = sp_props.get(_q(fo,'font-weight'),'')
                if fn: face = fn.strip("'\"")
                if fs: 
                    try: size_pt = float(fs.replace('pt',''))
                    except: pass
                if fb == 'bold': bold = True
                all_text.append(''.join(sp.itertext()))
        else:
            all_text.append(''.join(odt_p.itertext()))
            if tprops:
                fn = tprops.get(_q(ODT_NS["fo"],'font-family'),'')
                fs = tprops.get(_q(ODT_NS["fo"],'font-size'),'')
                if fn: face = fn.strip("'\"")
                if fs:
                    try: size_pt = float(fs.replace('pt',''))
                    except: pass

        cPrId = self._get_charPr(face, size_pt, bold)
        run = ET.SubElement(p, _q(HP,'run'))
        run.set('charPrIDRef', str(cPrId))

        if first:
            self._add_secPr(run)

        t = ET.SubElement(run, _q(HP,'t'))
        t.text = ''.join(all_text)

        # linesegarray
        lsa = ET.SubElement(p, _q(HP,'linesegarray'))
        ls = ET.SubElement(lsa, _q(HP,'lineseg'))
        h = pt_to_hwp(str(size_pt))
        ls.set('textpos','0'); ls.set('vertpos','0')
        ls.set('vertsize',str(h)); ls.set('textheight',str(h))
        ls.set('baseline',str(int(h*0.85))); ls.set('spacing','600')
        ls.set('horzpos','0'); ls.set('horzsize','42520'); ls.set('flags','393216')

        return p

    def _add_secPr(self, run):
        secPr = ET.SubElement(run, _q(HP,'secPr'))
        secPr.set('id',''); secPr.set('textDirection','HORIZONTAL')
        secPr.set('spaceColumns','1134'); secPr.set('tabStop','8000')
        secPr.set('outlineShapeIDRef','1'); secPr.set('memoShapeIDRef','0')
        secPr.set('textVerticalWidthHead','0'); secPr.set('masterPageCnt','0')
        grid = ET.SubElement(secPr, _q(HP,'grid'))
        grid.set('lineGrid','0'); grid.set('charGrid','0'); grid.set('wonggojiFormat','0')
        sn = ET.SubElement(secPr, _q(HP,'startNum'))
        sn.set('pageStartsOn','BOTH'); sn.set('page','0')
        sn.set('pic','0'); sn.set('tbl','0'); sn.set('equation','0')
        vis = ET.SubElement(secPr, _q(HP,'visibility'))
        vis.set('hideFirstHeader','0'); vis.set('hideFirstFooter','0')
        vis.set('hideFirstMasterPage','0'); vis.set('border','SHOW_ALL')
        vis.set('fill','SHOW_ALL'); vis.set('hideFirstPageNum','0')
        vis.set('hideFirstEmptyLine','0'); vis.set('showLineNumber','0')
        pp = ET.SubElement(secPr, _q(HP,'pagePr'))
        pp.set('landscape','WIDELY')
        page = self._page_props()
        pp.set('width',str(page['width'])); pp.set('height',str(page['height']))
        pp.set('gutterType','LEFT_ONLY')
        mg = ET.SubElement(pp, _q(HP,'margin'))
        mg.set('header',str(page['header'])); mg.set('footer',str(page['footer']))
        mg.set('gutter','0')
        mg.set('left',str(page['left'])); mg.set('right',str(page['right']))
        mg.set('top',str(page['top'])); mg.set('bottom',str(page['bottom']))
        ctrl = ET.SubElement(run, _q(HP,'ctrl'))
        colPr = ET.SubElement(ctrl, _q(HP,'colPr'))
        colPr.set('id',''); colPr.set('type','NEWSPAPER'); colPr.set('layout','LEFT')
        colPr.set('colCount','1'); colPr.set('sameSz','1'); colPr.set('sameGap','0')

    def _table_para(self, odt_table, first=False):
        """ODT 표 → HWPX 표 문단"""
        p = ET.Element(_q(HP,'p'))
        p.set('id','0'); p.set('paraPrIDRef','0'); p.set('styleIDRef','0')
        p.set('pageBreak','0'); p.set('columnBreak','0'); p.set('merged','0')

        run = ET.SubElement(p, _q(HP,'run'))
        run.set('charPrIDRef','0')

        if first:
            self._add_secPr(run)

        # 표 컨트롤
        ctrl = ET.SubElement(run, _q(HP,'ctrl'))
        rows = odt_table.findall(_q(ODT_NS["table"],'table-row'))
        n_rows = len(rows)
        first_cells = rows[0].findall(_q(ODT_NS["table"],'table-cell')) if rows else []
        n_cols = sum(int(c.get(_q(ODT_NS["table"],'number-columns-spanned'),'1')) 
                     for c in first_cells) if first_cells else 0
        if n_cols == 0: n_cols = len(first_cells)

        tbl = ET.SubElement(ctrl, _q(HP,'tbl'))
        tbl.set('rowCnt',str(n_rows)); tbl.set('colCnt',str(n_cols))
        tbl.set('cellCnt',str(n_rows*n_cols))

        # 표 속성
        tblPr = ET.SubElement(tbl, _q(HP,'tblPr'))
        om = ET.SubElement(tblPr, _q(HP,'outerMargin'))
        om.set('left','141'); om.set('top','141')
        om.set('right','141'); om.set('bottom','141')

        # 셀 내용
        cell_id = 0
        col_offset = 0
        for ri, row_el in enumerate(rows):
            cells = row_el.findall(_q(ODT_NS["table"],'table-cell'))
            col_sum = 0
            for ci, cell_el in enumerate(cells):
                cspan = int(cell_el.get(_q(ODT_NS["table"],'number-columns-spanned'),'1'))
                rspan = int(cell_el.get(_q(ODT_NS["table"],'number-rows-spanned'),'1'))

                sc = ET.SubElement(tbl, _q(HP,'sc'))
                sc.set('id',str(cell_id)); sc.set('col',str(col_sum))
                sc.set('row',str(ri)); sc.set('colSpan',str(cspan))
                sc.set('rowSpan',str(rspan))

                # 셀 내부 문단
                cell_paras = cell_el.findall(f'.//{_q(ODT_NS["text"],"p")}')
                for cp_el in cell_paras:
                    sp = ET.SubElement(sc, _q(HP,'p'))
                    sp.set('id','0'); sp.set('paraPrIDRef','0')
                    sp.set('styleIDRef','0'); sp.set('pageBreak','0')
                    sp.set('columnBreak','0'); sp.set('merged','0')

                    # 셀 내부 텍스트/폰트
                    cell_spans = cp_el.findall(f'.//{_q(ODT_NS["text"],"span")}')
                    cell_text = []; cface=None; csz=10.0; cbold=False
                    if cell_spans:
                        for csp in cell_spans:
                            cssname = csp.get(_q(ODT_NS["text"],'style-name'),'')
                            csprops = self._style_text_props(cssname)
                            fo = ODT_NS["fo"]
                            cfn = csprops.get(_q(fo,'font-family'),'')
                            cfs = csprops.get(_q(fo,'font-size'),'')
                            cfb = csprops.get(_q(fo,'font-weight'),'')
                            if cfn: cface = cfn.strip("'\"")
                            if cfs:
                                try: csz = float(cfs.replace('pt',''))
                                except: pass
                            if cfb == 'bold': cbold = True
                            cell_text.append(''.join(csp.itertext()))
                    else:
                        cell_text.append(''.join(cp_el.itertext()))
                    
                    ccPrId = self._get_charPr(cface, csz, cbold)
                    sr = ET.SubElement(sp, _q(HP,'run'))
                    sr.set('charPrIDRef', str(ccPrId))
                    st = ET.SubElement(sr, _q(HP,'t'))
                    st.text = ''.join(cell_text)

                    slsa = ET.SubElement(sp, _q(HP,'linesegarray'))
                    sls = ET.SubElement(slsa, _q(HP,'lineseg'))
                    ch = pt_to_hwp(str(csz))
                    sls.set('textpos','0'); sls.set('vertpos','0')
                    sls.set('vertsize',str(ch)); sls.set('textheight',str(ch))
                    sls.set('baseline',str(int(ch*0.85))); sls.set('spacing','600')
                    sls.set('horzpos','0'); sls.set('horzsize','42520')
                    sls.set('flags','393216')

                cell_id += 1
                col_sum += cspan

        # linesegarray for table paragraph
        lsa = ET.SubElement(p, _q(HP,'linesegarray'))
        ls = ET.SubElement(lsa, _q(HP,'lineseg'))
        ls.set('textpos','0'); ls.set('vertpos','0')
        ls.set('vertsize','1000'); ls.set('textheight','1000')
        ls.set('baseline','850'); ls.set('spacing','600')
        ls.set('horzpos','0'); ls.set('horzsize','42520'); ls.set('flags','393216')

        return p

    def _build_header(self, page):
        hh = ET.Element(_q(HH,'head'))
        hh.set('version','1.2'); hh.set('secCnt','1')

        bn = ET.SubElement(hh, _q(HH,'beginNum'))
        bn.set('page','1'); bn.set('footnote','1'); bn.set('endnote','1')
        bn.set('pic',str(len(self.images))); bn.set('tbl','1'); bn.set('equation','1')

        rl = ET.SubElement(hh, _q(HH,'refList'))

        # fonts
        ffs = ET.SubElement(rl, _q(HH,'fontfaces'))
        used_fonts = set(cp['face'] for cp in self.char_props if cp['face'])
        default_fonts = {'함초롬돋움','함초롬바탕'}
        all_fonts = default_fonts | used_fonts
        ffs.set('itemCnt',str(len(all_fonts)))
        for lang in ['HANGUL','LATIN','HANJA','JAPANESE','OTHER']:
            ff = ET.SubElement(ffs, _q(HH,'fontface'))
            ff.set('lang',lang); ff.set('fontCnt',str(len(all_fonts)))
            for fi, fn in enumerate(sorted(all_fonts)):
                f = ET.SubElement(ff, _q(HH,'font'))
                f.set('id',str(fi)); f.set('face',fn)
                f.set('type','TTF'); f.set('isEmbedded','0')
                ti = ET.SubElement(f, _q(HH,'typeInfo'))
                ti.set('familyType','FCAT_GOTHIC'); ti.set('weight','6')
                ti.set('proportion','4'); ti.set('contrast','0')
                ti.set('strokeVariation','1'); ti.set('armStyle','1')
                ti.set('letterform','1'); ti.set('midline','1'); ti.set('xHeight','1')

        # borderFills
        bfs = ET.SubElement(rl, _q(HH,'borderFills'))
        bfs.set('itemCnt',str(len(self.border_fills)))
        for i, bf in enumerate(self.border_fills):
            b = ET.SubElement(bfs, _q(HH,'borderFill'))
            b.set('id',str(i+1)); b.set('threeD','0'); b.set('shadow','0')
            b.set('centerLine','NONE'); b.set('breakCellSeparateLine','0')
            if bf['type'] == 'solid':
                sl = ET.SubElement(b, _q(HH,'sl'))
                sl.set('type','SOLID'); sl.set('width','0.12 mm')
                sl.set('color','#000000')

        # charProperties
        cps = ET.SubElement(rl, _q(HH,'charProperties'))
        cps.set('itemCnt',str(len(self.char_props)))
        for i, cp in enumerate(self.char_props):
            c = ET.SubElement(cps, _q(HH,'charPr'))
            c.set('id',str(i)); c.set('height',str(cp['height']))
            c.set('textColor',cp.get('color','#000000'))
            c.set('shadeColor','none'); c.set('useFontSpace','0')
            c.set('useKerning','0'); c.set('symMark','NONE')
            c.set('borderFillIDRef','2')
            # 폰트 참조
            fn = cp.get('face','함초롬돋움') or '함초롬돋움'
            font_id = sorted(set(d for cp2 in self.char_props if cp2['face'] for d in [cp2['face']]) | {'함초롬돋움','함초롬바탕'})
            try: fid = list(font_id).index(fn)
            except: fid = 0
            for attr in ['hangulFontIDRef','latinFontIDRef','hanjaFontIDRef']:
                c.set(attr, str(fid))

        # paraProperties
        pps = ET.SubElement(rl, _q(HH,'paraProperties'))
        pps.set('itemCnt',str(len(self.para_props)))
        for i, pp in enumerate(self.para_props):
            pe = ET.SubElement(pps, _q(HH,'paraPr'))
            pe.set('id',str(i)); pe.set('tabPrIDRef','0')
            pe.set('condense','0'); pe.set('fontLineHeight','0')
            pe.set('snapToGrid','1'); pe.set('suppressLineNumbers','0')
            pe.set('checked','0'); pe.set('align',pp['align'])

        # styles
        sts = ET.SubElement(rl, _q(HH,'styles'))
        sts.set('itemCnt','1')
        s = ET.SubElement(sts, _q(HH,'style'))
        s.set('id','0'); s.set('type','PARA'); s.set('distIDRef','0')
        s.set('name','바탕글'); s.set('engName','Normal')
        s.set('paraPrIDRef','0'); s.set('charPrIDRef','0')
        s.set('nextStyleIDRef','0'); s.set('langID','1042')

        # tabPrs
        tps = ET.SubElement(rl, _q(HH,'tabPrs'))
        tps.set('itemCnt','1')
        tp = ET.SubElement(tps, _q(HH,'tabPr'))
        tp.set('id','0'); tp.set('itemCnt','0')

        return hh

    def _zip(self, header, section):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('mimetype','application/hwpml-package+xml',
                       compress_type=zipfile.ZIP_STORED)
            z.writestr('version.xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
                '<HWPML version="1.2" />')
            z.writestr('Contents/header.xml',
                ET.tostring(header,encoding='unicode',xml_declaration=True))
            z.writestr('Contents/section0.xml',
                ET.tostring(section,encoding='unicode',xml_declaration=True))

            # content.hpf
            opf = ET.Element(_q('http://www.idpf.org/2007/opf','package'))
            meta = ET.SubElement(opf,_q('http://www.idpf.org/2007/opf','metadata'))
            ET.SubElement(meta,_q('http://www.idpf.org/2007/opf','title'))
            lang = ET.SubElement(meta,_q('http://www.idpf.org/2007/opf','language'))
            lang.text = 'ko'
            mf = ET.SubElement(opf,_q('http://www.idpf.org/2007/opf','manifest'))
            for mid,href,mt in [('header','Contents/header.xml','application/xml'),
                                ('section0','Contents/section0.xml','application/xml'),
                                ('settings','settings.xml','application/xml')]:
                it = ET.SubElement(mf,_q('http://www.idpf.org/2007/opf','item'))
                it.set('id',mid); it.set('href',href); it.set('media-type',mt)
            for i,p in enumerate(self.images):
                it = ET.SubElement(mf,_q('http://www.idpf.org/2007/opf','item'))
                it.set('id',f'img{i}'); it.set('href',p)
                ext = p.rsplit('.',1)[-1] if '.' in p else 'png'
                it.set('media-type',f'image/{ext}')
            sp = ET.SubElement(opf,_q('http://www.idpf.org/2007/opf','spine'))
            for ref in ['header','section0']:
                ir = ET.SubElement(sp,_q('http://www.idpf.org/2007/opf','itemref'))
                ir.set('idref',ref)
            z.writestr('Contents/content.hpf',
                ET.tostring(opf,encoding='unicode',xml_declaration=True))

            z.writestr('Preview/PrvText.txt','')
            from PIL import Image
            img = Image.new('RGB',(1,1),(255,255,255))
            pb = io.BytesIO(); img.save(pb,format='PNG')
            z.writestr('Preview/PrvImage.png',pb.getvalue())

            z.writestr('settings.xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
                '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app">'
                '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>'
                '</ha:HWPApplicationSetting>')
            z.writestr('META-INF/container.xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
                '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"'
                ' xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">'
                '<ocf:rootfiles>'
                '<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>'
                '<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>'
                '<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>'
                '</ocf:rootfiles></ocf:container>')
            z.writestr('META-INF/manifest.xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'
                '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">'
                '<manifest:entry manifest:full-path="/" manifest:media-type="application/hwpml-package+xml"/>'
                '</manifest:manifest>')
            z.writestr('META-INF/container.rdf',
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"'
                ' xmlns:pkg="http://www.idpf.org/2007/opf/package">'
                '<rdf:Description rdf:about="">'
                '<pkg:ref>scheme://url/</pkg:ref>'
                '</rdf:Description></rdf:RDF>')
            for path, data in self.images.items():
                z.writestr(path, data)
        return buf.getvalue()


def convert_odt_to_hwpx(odt_bytes):
    return Converter(odt_bytes).convert()

def convert_file(odt_path, hwpx_path=None):
    with open(odt_path,'rb') as f: data = f.read()
    result = convert_odt_to_hwpx(data)
    if hwpx_path is None:
        hwpx_path = odt_path.rsplit('.',1)[0] + '.hwpx'
    with open(hwpx_path,'wb') as f: f.write(result)
    return hwpx_path

if __name__ == '__main__':
    import argparse as ap
    p = ap.ArgumentParser(description='ODT → HWPX 변환')
    p.add_argument('input', help='입력 ODT 파일')
    p.add_argument('-o','--output', help='출력 HWPX 파일')
    a = p.parse_args()
    r = convert_file(a.input, a.output)
    print(f'[OK] {a.input} → {r}')
