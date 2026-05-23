#!/usr/bin/env python3
"""
Simple Markdown to HTML converter using only Python stdlib.
Supports: headings, bold, italic, links, images, lists, code blocks, tables, horizontal rules.
For HwpForge Markdown output format.
"""

import sys
import re
import html

def md_to_html(md_text: str) -> str:
    lines = md_text.split('\n')
    html_lines = []
    in_code_block = False
    in_list = False
    list_type = None  # 'ul' or 'ol'
    in_table = False
    table_rows = []

    for line in lines:
        # Code blocks
        if line.strip().startswith('```'):
            if in_code_block:
                html_lines.append('</code></pre>')
                in_code_block = False
            else:
                lang = line.strip()[3:].strip()
                cls = f' class="language-{lang}"' if lang else ''
                html_lines.append(f'<pre><code{cls}>')
                in_code_block = True
            continue

        if in_code_block:
            html_lines.append(html.escape(line))
            continue

        # Close list if not a list item
        stripped = line.strip()
        if in_list and not stripped.startswith(('- ', '* ', '+ ')) and not re.match(r'\d+\.', stripped):
            html_lines.append(f'</{list_type}>')
            in_list = False

        # Horizontal rule
        if re.match(r'^---+$', stripped) or re.match(r'^\*\*\*+$', stripped) or re.match(r'^___+$', stripped):
            html_lines.append('<hr>')
            continue

        # Headings
        heading_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if heading_match:
            level = len(heading_match.group(1))
            content = inline_format(heading_match.group(2))
            html_lines.append(f'<h{level}>{content}</h{level}>')
            continue

        # Table rows
        if '|' in stripped and stripped.startswith('|'):
            cells = [c.strip() for c in stripped.split('|')[1:-1]]
            if all(re.match(r'^[-:]+$', c) for c in cells):
                continue  # skip separator row
            if not in_table:
                in_table = True
                table_rows = []
            row_cells = ''.join(f'<td>{inline_format(c)}</td>' for c in cells)
            table_rows.append(f'<tr>{row_cells}</tr>')
            continue
        elif in_table:
            html_lines.append('<table>' + ''.join(table_rows) + '</table>')
            in_table = False
            table_rows = []

        # Unordered list
        if stripped.startswith('- ') or stripped.startswith('* ') or stripped.startswith('+ '):
            if not in_list or list_type != 'ul':
                if in_list:
                    html_lines.append(f'</{list_type}>')
                html_lines.append('<ul>')
                in_list = True
                list_type = 'ul'
            content = inline_format(stripped[2:])
            html_lines.append(f'<li>{content}</li>')
            continue

        # Ordered list
        ol_match = re.match(r'\d+\.\s+(.+)$', stripped)
        if ol_match:
            if not in_list or list_type != 'ol':
                if in_list:
                    html_lines.append(f'</{list_type}>')
                html_lines.append('<ol>')
                in_list = True
                list_type = 'ol'
            content = inline_format(ol_match.group(1))
            html_lines.append(f'<li>{content}</li>')
            continue

        # Blockquote
        if stripped.startswith('> '):
            content = inline_format(stripped[2:])
            html_lines.append(f'<blockquote>{content}</blockquote>')
            continue

        # Empty line
        if not stripped:
            html_lines.append('')
            continue

        # Regular paragraph
        html_lines.append(f'<p>{inline_format(stripped)}</p>')

    # Close any remaining open tags
    if in_code_block:
        html_lines.append('</code></pre>')
    if in_list:
        html_lines.append(f'</{list_type}>')
    if in_table:
        html_lines.append('<table>' + ''.join(table_rows) + '</table>')

    return '\n'.join(html_lines)


def inline_format(text: str) -> str:
    """Process inline Markdown formatting."""
    # Images
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', r'<img src="\2" alt="\1">', text)
    # Links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__(.+?)__', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    text = re.sub(r'_(.+?)_', r'<em>\1</em>', text)
    # Inline code
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return text


def main():
    if len(sys.argv) < 3:
        print("Usage: md2html.py input.md output.html")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]

    with open(input_path, 'r', encoding='utf-8') as f:
        md_text = f.read()

    body = md_to_html(md_text)

    html_doc = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {{ font-family: "Noto Sans KR", "Malgun Gothic", sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #333; }}
  table {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}
  td, th {{ border: 1px solid #ddd; padding: 8px 12px; text-align: left; }}
  th {{ background: #f5f5f5; }}
  h1, h2, h3 {{ color: #1a1a1a; }}
  img {{ max-width: 100%; }}
  code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
  pre {{ background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }}
  blockquote {{ border-left: 4px solid #ddd; padding-left: 16px; color: #666; margin-left: 0; }}
</style>
</head>
<body>
{body}
</body>
</html>'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html_doc)

    print(f"Converted: {input_path} -> {output_path}")


if __name__ == '__main__':
    main()
