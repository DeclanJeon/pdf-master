#!/usr/bin/env python3
"""HWPX → HTML converter for PDF마스터
Parses HWPX (Hancom WP ML ZIP) and generates styled HTML preserving:
- Paragraph text and formatting (font size, color, bold, alignment)
- Tables with borders and cell content
- Page layout (margins, orientation, size)
- Images (base64 embedded)
- Headers/footers

Usage: python3 hwpx2html.py input.hwpx output.html
"""

import sys
import os
import zipfile
import xml.etree.ElementTree as ET
import base64
import re
from pathlib import Path

# HWPX namespaces
NS = {
    'ha': 'http://www.hancom.co.kr/hwpml/2011/app',
    'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
    'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
    'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
    'hc': 'http://www.hancom.co.kr/hwpml/2011/core',
    'hpf': 'http://www.hancom.co.kr/schema/2011/hpf',
    'hp10': 'http://www.hancom.co.kr/hwpml/2016/paragraph',
}

def qn(ns_prefix, local):
    return f'{{{NS.get(ns_prefix, "")}}}{local}'

class HwpxConverter:
    def __init__(self, hwpx_path: str):
        self.hwpx_path = hwpx_path
        self.zf = zipfile.ZipFile(hwpx_path, 'r')
        self.char_styles = {}   # charPrIDRef → {height, textColor, ...}
        self.para_styles = {}   # paraPrIDRef → {align, ...}
        self.style_defs = {}    # styleIDRef → name
        self.border_fills = {}  # borderFillIDRef → CSS
        self.page_props = {}
        self._parse_header()

    def _parse_header(self):
        """Parse header.xml for style definitions"""
        try:
            header_xml = self.zf.read('Contents/header.xml')
        except KeyError:
            return
        root = ET.fromstring(header_xml)

        # Parse charPr (character properties)
        for cp in root.iter(qn('hh', 'charPr')):
            cid = cp.get('id', '')
            self.char_styles[cid] = {
                'height': cp.get('height', '1000'),
                'textColor': cp.get('textColor', '#000000'),
                'shadeColor': cp.get('shadeColor', 'none'),
                'bold': cp.get('bold', '0'),
                'italic': cp.get('italic', '0'),
                'underline': cp.get('underline', '0'),
                'strikeout': cp.get('strikeout', '0'),
                'faceNameHangul': cp.get('faceNameHangul', cp.get('lang', '')),
                'faceNameLatin': cp.get('faceNameLatin', cp.get('lang', '')),
                'faceNameHanja': cp.get('faceNameHanja', ''),
                'faceNameJapanese': cp.get('faceNameJapanese', ''),
                'faceNameEtc': cp.get('faceNameEtc', ''),
                'ratio': cp.get('ratio', '100'),
                'spacing': cp.get('spacing', '0'),
                'offset': cp.get('offset', '0'),
            }

        # Parse paraPr (paragraph properties)
        for pp in root.iter(qn('hh', 'paraPr')):
            pid = pp.get('id', '')
            align = pp.get('align', 'LEFT')
            self.para_styles[pid] = {
                'align': align,
                'breakLatin': pp.get('breakLatin', '0'),
                'breakNonLatin': pp.get('breakNonLatin', '0'),
            }

        # Parse style definitions
        for st in root.iter(qn('hh', 'style')):
            sid = st.get('id', '')
            name_el = st.find(qn('hh', 'name'))
            self.style_defs[sid] = name_el.text if name_el is not None else ''

        # Parse borderFill
        for bf in root.iter(qn('hh', 'borderFill')):
            bid = bf.get('id', '')
            sl = bf.find(qn('hh', 'slash'))
            bs = bf.find(qn('hh', 'backSlash'))
            fill = bf.find(qn('hh', 'fill'))
            color = ''
            if fill is not None:
                fc = fill.find(qn('hh', 'solidFill'))
                if fc is not None:
                    color = fc.text or ''

            borders = {}
            for side in ['left', 'right', 'top', 'bottom']:
                el = bf.find(qn('hh', side + 'Border'))
                if el is not None:
                    border_type = el.get('type', 'NONE')
                    border_width = el.get('thickness', '0.5')
                    border_color = el.get('color', '#000000')
                    borders[side] = {
                        'type': border_type,
                        'width': float(border_width),
                        'color': border_color,
                    }

            self.border_fills[bid] = {
                'borders': borders,
                'fill_color': color,
            }

    def _height_to_pt(self, height_str):
        """Convert HWP unit (1/100 pt) to pt"""
        try:
            return int(height_str) / 100.0
        except (ValueError, TypeError):
            return 10.0

    def _hwpunit_to_mm(self, val_str):
        """Convert HWP unit (1/100 pt) to mm. 1pt = 25.4/72 mm"""
        try:
            return int(val_str) / 100.0 * 25.4 / 72.0
        except (ValueError, TypeError):
            return 0.0

    def _hwpunit_to_pt(self, val_str):
        """Convert HWP unit (1/100 pt) to pt"""
        try:
            return int(val_str) / 100.0
        except (ValueError, TypeError):
            return 0.0

    def _get_char_css(self, char_pr_id):
        """Get CSS style string for a charPr reference"""
        cs = self.char_styles.get(char_pr_id, {})
        if not cs:
            return ''

        parts = []
        height = cs.get('height', '1000')
        if height and height != '1000':
            pt = self._height_to_pt(height)
            parts.append(f'font-size:{pt:.1f}pt')

        color = cs.get('textColor', '')
        if color and color != '#000000' and color != 'black':
            parts.append(f'color:{color}')

        bg = cs.get('shadeColor', '')
        if bg and bg != 'none' and bg != '#FFFFFF':
            parts.append(f'background-color:{bg}')

        if cs.get('bold') == '1':
            parts.append('font-weight:bold')
        if cs.get('italic') == '1':
            parts.append('font-style:italic')

        underline = cs.get('underline', '0')
        if underline and underline != '0' and underline != 'NONE':
            parts.append('text-decoration:underline')

        strikeout = cs.get('strikeout', '0')
        if strikeout and strikeout != '0' and strikeout != 'NONE':
            parts.append('text-decoration:line-through')

        ratio = cs.get('ratio', '100')
        if ratio and ratio != '100':
            parts.append(f'font-size:{int(ratio)}%')

        spacing = cs.get('spacing', '0')
        if spacing and spacing != '0':
            try:
                parts.append(f'letter-spacing:{int(spacing)/100:.1f}pt')
            except:
                pass

        # Font family
        face_ko = cs.get('faceNameHangul', '')
        face_en = cs.get('faceNameLatin', '')
        fonts = []
        if face_ko: fonts.append(face_ko)
        if face_en and face_en != face_ko: fonts.append(face_en)
        if fonts:
            parts.append(f"font-family:{','.join(fonts)},'맑은 고딕','Apple SD Gothic Neo',sans-serif")

        return ';'.join(parts)

    def _get_para_css(self, para_pr_id):
        """Get CSS style string for a paraPr reference"""
        ps = self.para_styles.get(para_pr_id, {})
        if not ps:
            return ''

        parts = []
        align = ps.get('align', 'LEFT')
        align_map = {
            'LEFT': 'left', 'CENTER': 'center', 'RIGHT': 'right',
            'JUSTIFY': 'justify', 'DISTRIBUTED': 'justify',
        }
        if align in align_map:
            parts.append(f'text-align:{align_map[align]}')

        return ';'.join(parts)

    def _get_border_css(self, border_fill_id):
        """Get CSS border style string"""
        bf = self.border_fills.get(border_fill_id, {})
        if not bf:
            return 'border:1px solid #000'

        parts = []
        borders = bf.get('borders', {})
        for side in ['top', 'right', 'bottom', 'left']:
            b = borders.get(side, {})
            btype = b.get('type', 'NONE')
            if btype == 'NONE' or not btype:
                parts.append(f'border-{side}:none')
            else:
                width = b.get('width', 0.5)
                color = b.get('color', '#000000')
                style = 'solid' if btype in ('SINGLE', 'THICK', 'DOUBLE', 'DOTTED', 'DASH', 'DASH_DOT') else 'solid'
                parts.append(f'border-{side}:{width:.1f}pt {style} {color}')

        fill = bf.get('fill_color', '')
        if fill and fill != 'none':
            parts.append(f'background-color:{fill}')

        return ';'.join(parts)

    def _render_text(self, elem):
        """Render a <hp:t> text element, returning HTML"""
        # Get text content
        text = ''
        children = list(elem)
        has_nested = False

        for child in elem:
            tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag
            if tag_local == 't':
                # Nested text element (unusual but possible)
                text += (child.text or '')
            elif tag_local == 'tbl':
                has_nested = True
            elif tag_local == 'img':
                has_nested = True

        if not text and elem.text:
            text = elem.text

        return text

    def _render_run(self, run_elem):
        """Render a <hp:run> element to HTML"""
        html_parts = []
        char_pr_id = run_elem.get('charPrIDRef', '')
        char_css = self._get_char_css(char_pr_id)

        for child in run_elem:
            tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag

            if tag_local == 't':
                text = child.text or ''
                if char_css:
                    html_parts.append(f'<span style="{char_css}">{self._escape_html(text)}</span>')
                else:
                    html_parts.append(self._escape_html(text))

            elif tag_local == 'tbl':
                html_parts.append(self._render_table(child))

            elif tag_local == 'img':
                html_parts.append(self._render_image(child))

            elif tag_local == 'secPr':
                # Section properties - extract page layout
                self._extract_page_props(child)

        # Also handle direct text in run (rare but happens)
        if run_elem.text and run_elem.text.strip():
            text = run_elem.text.strip()
            if char_css:
                html_parts.append(f'<span style="{char_css}">{self._escape_html(text)}</span>')
            else:
                html_parts.append(self._escape_html(text))

        return ''.join(html_parts)

    def _render_table(self, tbl_elem):
        """Render a <hp:tbl> element to HTML table"""
        # Table attributes
        border_fill_id = tbl_elem.get('borderFillIDRef', '')
        cell_spacing = tbl_elem.get('cellSpacing', '0')

        style_parts = ['border-collapse:collapse']
        if cell_spacing and cell_spacing != '0':
            style_parts.append(f'border-spacing:{int(cell_spacing)/100:.1f}pt')

        # Size
        sz = tbl_elem.find(qn('hp', 'sz'))
        if sz is not None:
            width = sz.get('width', '')
            if width:
                try:
                    w_mm = self._hwpunit_to_mm(width)
                    style_parts.append(f'width:{w_mm:.1f}mm')
                except:
                    pass

        table_style = ';'.join(style_parts)
        border_style = self._get_border_css(border_fill_id)

        html = [f'<table style="{table_style}">']

        for child in tbl_elem:
            tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag

            if tag_local == 'tr':
                html.append('<tr>')
                for tc in child:
                    tc_local = tc.tag.split('}')[1] if '}' in tc.tag else tc.tag
                    if tc_local == 'tc':
                        html.append(self._render_cell(tc, border_fill_id))
                html.append('</tr>')

        html.append('</table>')
        return ''.join(html)

    def _render_cell(self, tc_elem, table_border_id):
        """Render a <hp:tc> table cell"""
        # Cell span
        span = tc_elem.find(qn('hp', 'cellSpan'))
        colspan = span.get('colSpan', '1') if span is not None else '1'
        rowspan = span.get('rowSpan', '1') if span is not None else '1'

        # Cell border
        cell_border_id = tc_elem.get('borderFillIDRef', table_border_id)
        border_css = self._get_border_css(cell_border_id)

        # Cell size
        cell_sz = tc_elem.find(qn('hp', 'cellSz'))
        cell_style_parts = [border_css]
        if cell_sz is not None:
            w = cell_sz.get('width', '')
            if w:
                try:
                    cell_style_parts.append(f'width:{self._hwpunit_to_mm(w):.1f}mm')
                except:
                    pass

        cell_style = ';'.join(cell_style_parts)

        attrs = f'style="{cell_style}"'
        if colspan != '1':
            attrs += f' colspan="{colspan}"'
        if rowspan != '1':
            attrs += f' rowspan="{rowspan}"'

        # Cell content
        content = ''
        sub_list = tc_elem.find(qn('hp', 'subList'))
        if sub_list is not None:
            content = self._render_sublist(sub_list)

        return f'<td {attrs}>{content}</td>'

    def _render_sublist(self, sublist_elem):
        """Render a <hp:subList> (cell content)"""
        html = []
        for child in sublist_elem:
            tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag
            if tag_local == 'p':
                html.append(self._render_paragraph(child))
        return ''.join(html)

    def _render_image(self, img_elem):
        """Render an <hp:img> element"""
        # Try to extract image from the ZIP
        img_id = img_elem.get('id', '')
        style = 'max-width:100%'

        sz = img_elem.find(qn('hp', 'sz'))
        if sz is not None:
            w = sz.get('width', '')
            h = sz.get('height', '')
            if w:
                try:
                    style += f';width:{self._hwpunit_to_mm(w):.1f}mm'
                except:
                    pass

        # Try to find image binary in ZIP
        for name in self.zf.namelist():
            if 'image' in name.lower() or 'media' in name.lower():
                if img_id in name or name.endswith(('.png', '.jpg', '.jpeg', '.bmp', '.gif', '.emf', '.wmf')):
                    try:
                        data = self.zf.read(name)
                        b64 = base64.b64encode(data).decode('ascii')
                        ext = Path(name).suffix.lstrip('.')
                        mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                                'bmp': 'image/bmp', 'gif': 'image/gif', 'emf': 'image/x-emf',
                                'wmf': 'image/x-wmf'}.get(ext, 'image/png')
                        return f'<img src="data:{mime};base64,{b64}" style="{style}" />'
                    except:
                        pass

        return ''

    def _extract_page_props(self, sec_pr):
        """Extract page layout from section properties"""
        page_pr = sec_pr.find(f'.//{qn("hp", "pagePr")}')
        if page_pr is not None:
            self.page_props['landscape'] = page_pr.get('landscape', '')
            self.page_props['width'] = page_pr.get('width', '')
            self.page_props['height'] = page_pr.get('height', '')

        margin = sec_pr.find(f'.//{qn("hp", "margin")}')
        if margin is not None:
            self.page_props['margin_header'] = margin.get('header', '')
            self.page_props['margin_footer'] = margin.get('footer', '')
            self.page_props['margin_left'] = margin.get('left', '')
            self.page_props['margin_right'] = margin.get('right', '')
            self.page_props['margin_top'] = margin.get('top', '')
            self.page_props['margin_bottom'] = margin.get('bottom', '')

    def _render_paragraph(self, p_elem):
        """Render a <hp:p> paragraph element"""
        para_pr_id = p_elem.get('paraPrIDRef', '')
        style_id = p_elem.get('styleIDRef', '')
        para_css = self._get_para_css(para_pr_id)

        # Check if this is a heading style
        style_name = self.style_defs.get(style_id, '')
        is_heading = False
        heading_level = 2
        heading_names = ['제목', '머리말', 'title', 'heading', 'Heading']
        for hn in heading_names:
            if hn.lower() in style_name.lower():
                is_heading = True
                break

        # Render runs
        content_parts = []
        for child in p_elem:
            tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag
            if tag_local == 'run':
                content_parts.append(self._render_run(child))
            elif tag_local == 'ctrl':
                # Controls - skip for now
                pass
            elif tag_local == 'secPr':
                self._extract_page_props(child)

        content = ''.join(content_parts)

        # Also check for direct text
        if p_elem.text and p_elem.text.strip():
            content = self._escape_html(p_elem.text) + content

        if not content.strip():
            return '<p><br/></p>'

        style_attr = f' style="{para_css}"' if para_css else ''

        if is_heading:
            return f'<h{heading_level}{style_attr}>{content}</h{heading_level}>'
        else:
            return f'<p{style_attr}>{content}</p>'

    def _escape_html(self, text):
        """Escape HTML special characters"""
        return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def convert(self) -> str:
        """Convert HWPX to HTML, return HTML string"""
        # Find section files from content.hpf
        sections = []
        try:
            content_xml = self.zf.read('Contents/content.hpf')
            content_root = ET.fromstring(content_xml)
            spine = content_root.find('.//{http://www.idpf.org/2007/opf}spine')
            if spine is not None:
                for itemref in spine:
                    idref = itemref.get('idref', '')
                    if idref.startswith('section'):
                        sections.append(f'Contents/{idref}.xml')
        except KeyError:
            pass

        # Fallback: find section files directly
        if not sections:
            for name in sorted(self.zf.namelist()):
                if re.match(r'Contents/section\d+\.xml', name):
                    sections.append(name)

        # Render all sections
        body_parts = []
        for sec_path in sections:
            try:
                sec_xml = self.zf.read(sec_path)
            except KeyError:
                continue
            sec_root = ET.fromstring(sec_xml)

            for child in sec_root:
                tag_local = child.tag.split('}')[1] if '}' in child.tag else child.tag
                if tag_local == 'p':
                    body_parts.append(self._render_paragraph(child))

        # Build page CSS
        page_css_parts = ['@page {']
        if self.page_props.get('width') and self.page_props.get('height'):
            w_mm = self._hwpunit_to_mm(self.page_props['width'])
            h_mm = self._hwpunit_to_mm(self.page_props['height'])
            landscape = self.page_props.get('landscape', '')
            if landscape == 'WIDELY':
                page_css_parts.append(f'  size: {h_mm:.0f}mm {w_mm:.0f}mm;')
            else:
                page_css_parts.append(f'  size: {w_mm:.0f}mm {h_mm:.0f}mm;')

        for side in ['left', 'right', 'top', 'bottom']:
            val = self.page_props.get(f'margin_{side}', '')
            if val:
                mm = self._hwpunit_to_mm(val)
                page_css_parts.append(f'  margin-{side}: {mm:.1f}mm;')

        page_css_parts.append('}')
        page_css = '\n'.join(page_css_parts)

        # Build full HTML
        html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
{page_css}
body {{
    font-family: '맑은 고딕', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
    font-size: 10pt;
    line-height: 1.6;
    color: #000;
    margin: 0;
    padding: 20px;
}}
table {{
    border-collapse: collapse;
    margin: 8px 0;
    width: auto;
}}
td {{
    border: 1px solid #000;
    padding: 4px 8px;
    vertical-align: top;
    font-size: 10pt;
}}
p {{
    margin: 2px 0;
}}
h2 {{
    font-size: 16pt;
    margin: 12px 0 6px 0;
}}
</style>
</head>
<body>
{''.join(body_parts)}
</body>
</html>"""

        self.zf.close()
        return html


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} input.hwpx output.html", file=sys.stderr)
        sys.exit(1)

    hwpx_path = sys.argv[1]
    output_path = sys.argv[2]

    converter = HwpxConverter(hwpx_path)
    html = converter.convert()

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    main()
