from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path('public/og-image.png')
W, H = 1200, 630
RED = (220, 38, 38)
DARK = (30, 41, 59)
MUTED = (100, 116, 139)
STONE = (250, 250, 249)
WHITE = (255, 255, 255)
BORDER = (254, 226, 226)

FONT_REGULAR = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FONT_BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
FONT_BLACK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def draw_shadow_card(base: Image.Image, box, radius=28, shadow=(15, 23, 42, 42)):
    x1, y1, x2, y2 = box
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x1, y1, x2, y2), radius=radius, fill=shadow)
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(layer, (0, 10))


def draw_icon(draw: ImageDraw.ImageDraw, cx: int, cy: int, label: str, kind: str):
    rounded_rect(draw, (cx - 58, cy - 58, cx + 58, cy + 58), 28, WHITE, BORDER, 2)
    if kind == 'doc':
        draw.rounded_rectangle((cx - 28, cy - 36, cx + 28, cy + 38), radius=8, outline=RED, width=5)
        draw.line((cx - 14, cy - 10, cx + 18, cy - 10), fill=RED, width=5)
        draw.line((cx - 14, cy + 8, cx + 18, cy + 8), fill=RED, width=5)
    elif kind == 'shield':
        pts = [(cx, cy - 40), (cx + 35, cy - 22), (cx + 28, cy + 28), (cx, cy + 44), (cx - 28, cy + 28), (cx - 35, cy - 22)]
        draw.line(pts + [pts[0]], fill=RED, width=5, joint='curve')
        draw.line((cx - 16, cy + 2, cx - 2, cy + 17, cx + 22, cy - 16), fill=RED, width=6)
    else:
        draw.ellipse((cx - 31, cy - 31, cx + 31, cy + 31), outline=RED, width=5)
        draw.line((cx, cy - 50, cx, cy - 31), fill=RED, width=5)
        draw.rounded_rectangle((cx - 35, cy + 38, cx + 35, cy + 50), radius=5, fill=RED)
    label_font = font(FONT_BOLD, 24)
    bbox = draw.textbbox((0, 0), label, font=label_font)
    draw.text((cx - (bbox[2] - bbox[0]) / 2, cy + 75), label, font=label_font, fill=DARK)


img = Image.new('RGBA', (W, H), STONE + (255,))
d = ImageDraw.Draw(img)

# soft background: keep the pattern subtle so social-card crops remain readable.
for i in range(0, 760, 18):
    d.line((i, 0, i - 300, H), fill=(254, 226, 226, 120), width=2)
for box, fill in [
    ((720, -360, 1440, 360), (254, 202, 202, 170)),
    ((-360, 190, 270, 820), (252, 165, 165, 120)),
]:
    d.ellipse(box, fill=fill)

# main copy
brand_font = font(FONT_BLACK, 34)
badge_font = font(FONT_BOLD, 24)
title_font = font(FONT_BLACK, 76)
subtitle_font = font(FONT_BOLD, 35)
body_font = font(FONT_REGULAR, 29)
small_font = font(FONT_BOLD, 24)

rounded_rect(d, (76, 72, 312, 126), 27, (254, 226, 226), None)
d.text((105, 86), 'PDF마스터', font=brand_font, fill=RED)
rounded_rect(d, (330, 78, 452, 122), 22, WHITE, BORDER, 2)
d.text((358, 85), 'KOREA', font=badge_font, fill=RED)

d.text((76, 170), '한국 문서 업무를 위한', font=subtitle_font, fill=RED)
d.text((76, 218), 'PDF 도구', font=title_font, fill=DARK)
d.text((76, 323), '한글 HWP PDF 변환 · 주민번호 마스킹 · 도장 삽입', font=body_font, fill=MUTED)

# feature chips
chip_y = 398
chips = [('HWP/HWPX 변환', 76), ('개인정보 보호', 282), ('브라우저 처리', 488)]
for text, x in chips:
    tw = d.textbbox((0, 0), text, font=small_font)[2]
    rounded_rect(d, (x, chip_y, x + tw + 44, chip_y + 54), 27, WHITE, BORDER, 2)
    d.text((x + 22, chip_y + 12), text, font=small_font, fill=DARK)

rounded_rect(d, (76, 505, 390, 566), 30, RED, None)
d.text((111, 519), 'pdfm.ponslink.com', font=small_font, fill=WHITE)

# right card
card = (720, 105, 1110, 550)
draw_shadow_card(img, card)
d = ImageDraw.Draw(img)
rounded_rect(d, card, 34, WHITE, (255, 228, 230), 2)
d.text((770, 150), '대표 기능', font=font(FONT_BLACK, 34), fill=DARK)

draw_icon(d, 820, 265, 'HWP 변환', 'doc')
draw_icon(d, 955, 265, '마스킹', 'shield')
draw_icon(d, 890, 435, '도장 삽입', 'stamp')

# small PDF sheet accent
rounded_rect(d, (990, 382, 1068, 472), 12, (254, 242, 242), (252, 165, 165), 2)
d.text((1008, 412), 'PDF', font=font(FONT_BLACK, 24), fill=RED)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.convert('RGB').save(OUT, 'PNG', optimize=True)
print(f'saved {OUT} {W}x{H}')
