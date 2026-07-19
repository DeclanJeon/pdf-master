use std::env;
use std::fs;
use std::path::Path;

use rhwp::model::bin_data::{BinData, BinDataCompression, BinDataContent, BinDataStatus, BinDataType};
use rhwp::model::control::Control;
use rhwp::model::document::{DocProperties, Document, FileHeader, HwpVersion, Preview, Section};
use rhwp::model::image::{CropInfo, ImageAttr, ImageEffect, Picture};
use rhwp::model::page::{PageBorderFill, PageDef};
use rhwp::model::paragraph::{CharShapeRef, LineSeg, Paragraph};
use rhwp::model::shape::{
    CommonObjAttr, DrawingObjAttr, HorzRelTo, RectangleShape, ShapeComponentAttr, ShapeObject,
    SizeCriterion, TextBox, TextWrap, VertAlign, VertRelTo,
};
use rhwp::model::table::{Cell, Table, TablePageBreak, VerticalAlign};
use rhwp::model::style::{
    Alignment, BorderFill, BorderLine, BorderLineType, CharShape, DiagonalLine, Fill, FillType, Font, ImageFill,
    ImageFillMode, ParaShape, ShapeBorderLine, SolidFill, Style, TabDef,
};
use rhwp::model::Padding;
use rhwp::parser::ingest::schema::{IngestDocument, Media, StemBlock};
use serde::Deserialize;
use serde::Deserializer;

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}


fn usage() {
    eprintln!("Usage: rhwp-ingest-exporter <ingest.json> [--media-dir <dir>] -o <output.hwp|output.hwpx> [--format hwp|hwpx]");
}

fn mm_to_hwpunit(mm: f32) -> u32 {
    ((mm as f64 / 25.4) * 7200.0).round() as u32
}

fn default_hwp_header() -> FileHeader {
    FileHeader {
        version: HwpVersion {
            major: 5,
            minor: 0,
            build: 1,
            revision: 1,
        },
        // Bit 0 = compressed (matches common Hancom-authored HWP5 files).
        flags: 0x1,
        compressed: true,
        encrypted: false,
        distribution: false,
        raw_data: None,
    }
}

fn default_compat_extra_streams() -> Vec<(String, Vec<u8>)> {
    // Minimal scripts streams observed in real Hancom HWP5 files. These are
    // not required for rhwp rendering, but some consumers reject sparse CFBs.
    vec![
        (
            "/Scripts/DefaultJScript".to_string(),
            vec![
                0x63, 0x60, 0x40, 0x05, 0xff, 0x81, 0x00, 0x00, 0x6e, 0xbb, 0x6e, 0xd1, 0x14, 0x00,
                0x00, 0x00,
            ],
        ),
        (
            "/Scripts/JScriptVersion".to_string(),
            vec![0x63, 0x64, 0x80, 0x00, 0x00, 0xf7, 0xdf, 0x88, 0xa9, 0x08, 0x00, 0x00, 0x00],
        ),
        ("/DocOptions/_LinkDoc".to_string(), vec![0u8; 524]),
    ]
}

fn apply_hancom_compat(doc: &mut Document, ingest: &IngestDocument) {
    doc.header = default_hwp_header();

    let mut preview_text = String::new();
    for question in &ingest.questions {
        if !question.stem.trim().is_empty() {
            if !preview_text.is_empty() {
                preview_text.push('\n');
            }
            preview_text.push_str(question.stem.trim());
        }
        for block in &question.stem_blocks {
            if let StemBlock::Text { text } = block {
                if !text.trim().is_empty() {
                    if !preview_text.is_empty() {
                        preview_text.push('\n');
                    }
                    preview_text.push_str(text.trim());
                }
            }
        }
    }
    // Prefer document body text when exam-style stem fields are empty
    // (PDF layout path does not populate questions).
    if preview_text.is_empty() {
        for section in &doc.sections {
            for para in &section.paragraphs {
                let t = para.text.trim();
                if !t.is_empty() {
                    if !preview_text.is_empty() {
                        preview_text.push('\n');
                    }
                    preview_text.push_str(t);
                }
                if preview_text.chars().count() >= 200 {
                    break;
                }
            }
            if preview_text.chars().count() >= 200 {
                break;
            }
        }
    }
    if preview_text.is_empty() {
        preview_text = "PDF Master".to_string();
    }
    // Keep preview short (UTF-16 storage grows quickly).
    let short: String = preview_text.chars().take(200).collect();
    doc.preview = Some(Preview {
        image: None,
        text: Some(short),
    });

    if doc.extra_streams.is_empty() {
        doc.extra_streams = default_compat_extra_streams();
    }
}

fn default_font_faces(default_font: &str) -> Vec<Vec<Font>> {
    (0..7)
        .map(|_| {
            vec![Font {
                raw_data: None,
                name: default_font.to_string(),
                alt_type: 0,
                alt_name: None,
                default_name: None,
            }]
        })
        .collect()
}

fn default_char_shape() -> CharShape {
    CharShape {
        font_ids: [0; 7],
        ratios: [100; 7],
        spacings: [0; 7],
        relative_sizes: [100; 7],
        char_offsets: [0; 7],
        base_size: 1100,
        text_color: 0x00000000,
        underline_color: 0x00000000,
        shade_color: 0x00FFFFFF,
        shadow_color: 0x00B2B2B2,
        strike_color: 0x00000000,
        ..Default::default()
    }
}

#[derive(Debug, Deserialize)]
struct PdfLayoutRoot {
    #[serde(default)]
    pdf_layout: Option<PdfLayout>,
}

#[derive(Debug, Deserialize)]
struct PdfLayout {
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    visual_mode: Option<String>,
    #[serde(default)]
    pages: Vec<PdfLayoutPage>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutPage {
    width: f32,
    height: f32,
    #[serde(default)]
    background: Option<PdfLayoutBackground>,
    #[serde(default, deserialize_with = "null_as_default")]
    images: Vec<PdfLayoutImage>,
    #[serde(default, deserialize_with = "null_as_default")]
    lines: Vec<PdfLayoutLine>,
    #[serde(default, deserialize_with = "null_as_default")]
    boxes: Vec<PdfLayoutBox>,
    #[serde(default, deserialize_with = "null_as_default")]
    tables: Vec<PdfLayoutTable>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutTable {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    #[serde(default)]
    columns: Vec<f32>,
    #[serde(default)]
    row_heights: Vec<f32>,
    #[serde(default)]
    cells: Vec<PdfLayoutTableCell>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutTableCell {
    row: usize,
    col: usize,
    #[serde(default)]
    row_span: usize,
    #[serde(default)]
    col_span: usize,
    #[serde(default)]
    text: String,
    #[serde(default)]
    font_family: Option<String>,
    #[serde(default)]
    font_size: Option<f32>,
    #[serde(default)]
    bold: bool,
    #[serde(default)]
    color: Option<String>,
    #[serde(default)]
    style: Option<PdfLayoutTableCellStyle>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutTableCellStyle {
    #[serde(default)]
    stroke: Option<String>,
    #[serde(default)]
    fill: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutBackground {
    id: String,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutImage {
    id: String,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutLine {
    text: String,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    /// PDF text baseline (origin y), same unit as x/y.
    #[serde(default)]
    baseline: Option<f32>,
    /// Measured natural text width in source units (optional; used for letter-spacing).
    #[serde(default)]
    natural_width: Option<f32>,
    #[serde(default)]
    font_family: Option<String>,
    #[serde(default)]
    font_size: Option<f32>,
    #[serde(default)]
    bold: bool,
    #[serde(default)]
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PdfLayoutBox {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    #[serde(default)]
    stroke: Option<String>,
    #[serde(default)]
    fill: Option<String>,
    /// PDF stroke width in the same unit as page coordinates (usually points).
    #[serde(default)]
    stroke_width: Option<f32>,
}

fn parse_pdf_layout(input_bytes: &[u8]) -> Option<PdfLayout> {
    serde_json::from_slice::<PdfLayoutRoot>(input_bytes)
        .ok()
        .and_then(|root| root.pdf_layout)
        .filter(|layout| layout.pages.iter().any(|page| page.background.is_some() || !page.images.is_empty() || !page.lines.is_empty() || !page.boxes.is_empty() || !page.tables.is_empty()))
}

fn box_is_inside_table(b: &PdfLayoutBox, tables: &[PdfLayoutTable]) -> bool {
    let cx = b.x + b.width / 2.0;
    let cy = b.y + b.height / 2.0;
    tables.iter().any(|table| {
        cx >= table.x
            && cx <= table.x + table.width
            && cy >= table.y
            && cy <= table.y + table.height
    })
}

fn table_raw_ctrl_data(common: &CommonObjAttr) -> Vec<u8> {
    let mut data = Vec::with_capacity(42);
    data.extend_from_slice(&common.attr.to_le_bytes());
    data.extend_from_slice(&common.vertical_offset.to_le_bytes());
    data.extend_from_slice(&common.horizontal_offset.to_le_bytes());
    data.extend_from_slice(&common.width.to_le_bytes());
    data.extend_from_slice(&common.height.to_le_bytes());
    data.extend_from_slice(&common.z_order.to_le_bytes());
    data.extend_from_slice(&common.margin.left.to_le_bytes());
    data.extend_from_slice(&common.margin.right.to_le_bytes());
    data.extend_from_slice(&common.margin.top.to_le_bytes());
    data.extend_from_slice(&common.margin.bottom.to_le_bytes());
    data.extend_from_slice(&common.instance_id.to_le_bytes());
    data.extend_from_slice(&common.prevent_page_break.to_le_bytes());
    data.extend_from_slice(&0u16.to_le_bytes());
    data
}

fn table_anchor_paragraph(table: Table, y: i32, height: i32) -> Paragraph {
    Paragraph {
        text: String::new(),
        char_count: 9,
        control_mask: 0x00000800,
        char_offsets: vec![],
        char_shapes: vec![CharShapeRef {
            start_pos: 0,
            char_shape_id: 0,
        }],
        line_segs: vec![LineSeg {
            text_start: 0,
            vertical_pos: y,
            line_height: height.max(200),
            text_height: height.max(200),
            baseline_distance: (height.max(200) * 850) / 1000,
            line_spacing: 0,
            column_start: 0,
            segment_width: 0,
            tag: 0x00060000,
        }],
        para_shape_id: 0,
        style_id: 0,
        controls: vec![Control::Table(Box::new(table))],
        ctrl_data_records: vec![None],
        has_para_text: true,
        ..Default::default()
    }
}

fn normalize_font_name(font: &str, fallback: &str) -> String {
    let trimmed = font.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let without_subset = trimmed
        .split_once('+')
        .map(|(_, name)| name)
        .unwrap_or(trimmed)
        .replace('-', " ");
    let name = without_subset.trim();
    if name.is_empty() {
        return fallback.to_string();
    }
    let lower = name.to_ascii_lowercase();
    // Map common PDF base fonts onto widely installed metric-compatible faces so
    // glyph widths stay closer to the source PDF during rhwp/HWP rendering.
    if lower.contains("helv") || lower == "helvetica" || lower.contains("nimbus sans") {
        // URW Nimbus Sans is the metric-compatible Helvetica clone shipped as OTF.
        return "Nimbus Sans".to_string();
    }
    if lower.contains("arial") {
        return "Nimbus Sans".to_string();
    }
    if lower.contains("times") || lower.contains("nimbus roman") {
        return "Nimbus Roman".to_string();
    }
    if lower.contains("courier") || lower.contains("nimbus mono") {
        return "Nimbus Mono PS".to_string();
    }
    if lower.contains("liberation sans") {
        return "Nimbus Sans".to_string();
    }
    if lower.contains("liberation serif") {
        return "Nimbus Roman".to_string();
    }
    if lower.contains("liberation mono") {
        return "Nimbus Mono PS".to_string();
    }
    name.to_string()
}

fn html_color_to_hwp_color(value: Option<&str>) -> u32 {
    let Some(value) = value else { return 0x00000000; };
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return 0x00000000;
    }
    match u32::from_str_radix(hex, 16) {
        Ok(rgb) => {
            let r = (rgb >> 16) & 0xff;
            let g = (rgb >> 8) & 0xff;
            let b = rgb & 0xff;
            (b << 16) | (g << 8) | r
        }
        Err(_) => 0x00000000,
    }
}

fn table_cell_border_fill_id(doc: &mut Document, style: Option<&PdfLayoutTableCellStyle>) -> u16 {
    let stroke = style.and_then(|s| s.stroke.as_deref());
    let fill = style.and_then(|s| s.fill.as_deref());
    let border = if stroke.is_some() {
        BorderLine {
            line_type: BorderLineType::Solid,
            width: 1,
            color: html_color_to_hwp_color(stroke),
        }
    } else {
        BorderLine {
            line_type: BorderLineType::None,
            width: 0,
            color: 0x00FFFFFF,
        }
    };
    let fill = fill.map(|value| Fill {
        fill_type: FillType::Solid,
        solid: Some(SolidFill {
            background_color: html_color_to_hwp_color(Some(value)),
            pattern_color: 0x00000000,
            pattern_type: 0,
        }),
        alpha: 0,
        ..Default::default()
    }).unwrap_or_default();
    doc.doc_info.border_fills.push(BorderFill {
        raw_data: None,
        attr: 0,
        borders: [border; 4],
        diagonal: DiagonalLine::default(),
        fill,
    });
    doc.doc_info.border_fills.len() as u16
}

fn text_paragraph(text: &str, char_shape_id: u32, line_height: i32, width: i32) -> Paragraph {
    let utf16_len = text.encode_utf16().count() as u32;
    Paragraph {
        text: text.to_string(),
        char_count: utf16_len + 1,
        char_offsets: (0..utf16_len).collect(),
        char_shapes: vec![CharShapeRef {
            start_pos: 0,
            char_shape_id,
        }],
        line_segs: vec![LineSeg {
            text_start: 0,
            vertical_pos: 0,
            line_height,
            text_height: line_height,
            baseline_distance: (line_height * 850) / 1000,
            line_spacing: 0,
            column_start: 0,
            segment_width: width,
            tag: 0x00060000,
        }],
        para_shape_id: 0,
        style_id: 0,
        has_para_text: true,
        ..Default::default()
    }
}

fn spacer_paragraph(height: i32, width: i32) -> Paragraph {
    text_paragraph("", 0, height.max(1), width)
}

fn shape_anchor_paragraph(shape: ShapeObject, y: i32, height: i32) -> Paragraph {
    Paragraph {
        text: String::new(),
        char_count: 9,
        control_mask: 0x00000800,
        char_offsets: vec![],
        char_shapes: vec![CharShapeRef {
            start_pos: 0,
            char_shape_id: 0,
        }],
        line_segs: vec![LineSeg {
            text_start: 0,
            vertical_pos: y,
            line_height: height.max(200),
            text_height: height.max(200),
            baseline_distance: (height.max(200) * 850) / 1000,
            line_spacing: 0,
            column_start: 0,
            segment_width: 0,
            tag: 0x00060000,
        }],
        para_shape_id: 0,
        style_id: 0,
        controls: vec![Control::Shape(Box::new(shape))],
        ctrl_data_records: vec![None],
        has_para_text: true,
        ..Default::default()
    }
}

fn make_textbox_shape(
    line: &PdfLayoutLine,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    char_shape_id: u32,
    z_order: i32,
) -> ShapeObject {
    let ctrl_id = 0x24726563; // "$rec"
    let instance_id = 0x40000000u32
        .wrapping_add((z_order as u32).wrapping_mul(0x100))
        .wrapping_add(x.wrapping_mul(3))
        .wrapping_add(y.wrapping_mul(7))
        .wrapping_add(width)
        .wrapping_add(height.wrapping_mul(0x1b));

    let common = CommonObjAttr {
        ctrl_id,
        vertical_offset: y,
        horizontal_offset: x,
        width,
        height,
        z_order,
        instance_id,
        treat_as_char: false,
        vert_rel_to: VertRelTo::Paper,
        vert_align: VertAlign::Top,
        horz_rel_to: HorzRelTo::Paper,
        text_wrap: TextWrap::InFrontOfText,
        width_criterion: SizeCriterion::Absolute,
        height_criterion: SizeCriterion::Absolute,
        description: "PDF editable text box".to_string(),
        ..Default::default()
    };

    let drawing = DrawingObjAttr {
        shape_attr: ShapeComponentAttr {
            ctrl_id,
            is_two_ctrl_id: true,
            original_width: width,
            original_height: height,
            current_width: width,
            current_height: height,
            local_file_version: 1,
            rotation_center: rhwp::model::Point {
                x: (width / 2) as i32,
                y: (height / 2) as i32,
            },
            render_sx: 1.0,
            render_sy: 1.0,
            ..Default::default()
        },
        border_line: ShapeBorderLine {
            color: 0,
            width: 0,
            attr: 0,
            outline_style: 0,
        },
        text_box: Some(TextBox {
            list_attr: 0x20,
            vertical_align: rhwp::model::table::VerticalAlign::Top,
            margin_left: 0,
            margin_right: 0,
            margin_top: 0,
            margin_bottom: 0,
            max_width: width,
            raw_list_header_extra: vec![0u8; 13],
            paragraphs: vec![text_paragraph(&line.text, char_shape_id, height as i32, width as i32)],
        }),
        inst_id: (instance_id & 0x3FFFFFFF) + 1,
        ..Default::default()
    };

    ShapeObject::Rectangle(RectangleShape {
        common,
        drawing,
        round_rate: 0,
        x_coords: [0, width as i32, width as i32, 0],
        y_coords: [0, 0, height as i32, height as i32],
    })
}

fn make_border_shape(
    b: &PdfLayoutBox,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    z_order: i32,
) -> ShapeObject {
    let ctrl_id = 0x24726563; // "$rec"
    let instance_id = 0x50000000u32
        .wrapping_add((z_order as u32).wrapping_mul(0x100))
        .wrapping_add(x.wrapping_mul(3))
        .wrapping_add(y.wrapping_mul(7))
        .wrapping_add(width)
        .wrapping_add(height.wrapping_mul(0x1b));

    let stroke = html_color_to_hwp_color(b.stroke.as_deref());
    let common = CommonObjAttr {
        ctrl_id,
        vertical_offset: y,
        horizontal_offset: x,
        width,
        height,
        z_order,
        instance_id,
        treat_as_char: false,
        vert_rel_to: VertRelTo::Paper,
        vert_align: VertAlign::Top,
        horz_rel_to: HorzRelTo::Paper,
        text_wrap: TextWrap::InFrontOfText,
        width_criterion: SizeCriterion::Absolute,
        height_criterion: SizeCriterion::Absolute,
        description: "PDF border/vector box".to_string(),
        ..Default::default()
    };

    let drawing = DrawingObjAttr {
        shape_attr: ShapeComponentAttr {
            ctrl_id,
            is_two_ctrl_id: true,
            original_width: width,
            original_height: height,
            current_width: width,
            current_height: height,
            local_file_version: 1,
            rotation_center: rhwp::model::Point {
                x: (width / 2) as i32,
                y: (height / 2) as i32,
            },
            render_sx: 1.0,
            render_sy: 1.0,
            ..Default::default()
        },
        border_line: ShapeBorderLine {
            color: stroke,
            // 100 HWPUNIT ≈ 1 PDF point. Preserve source stroke thickness.
            width: if b.stroke.is_some() {
                b.stroke_width
                    .map(|w| ((w.max(0.1) as f64) * 100.0).round() as i32)
                    .unwrap_or(100)
                    .clamp(20, 800)
            } else {
                0
            },
            attr: if b.stroke.is_some() { 0xD1000041 } else { 0 },
            outline_style: 0,
        },
        fill: b.fill.as_ref().map(|fill| Fill {
            fill_type: FillType::Solid,
            solid: Some(rhwp::model::style::SolidFill {
                background_color: html_color_to_hwp_color(Some(fill)),
                pattern_color: 0x00000000,
                pattern_type: 0,
            }),
            alpha: 0,
            ..Default::default()
        }).unwrap_or_default(),
        inst_id: (instance_id & 0x3FFFFFFF) + 1,
        ..Default::default()
    };

    ShapeObject::Rectangle(RectangleShape {
        common,
        drawing,
        round_rate: 0,
        x_coords: [0, width as i32, width as i32, 0],
        y_coords: [0, 0, height as i32, height as i32],
    })
}

fn build_background_shape_paragraph(
    bin_data_id: u16,
    image_bytes: Vec<u8>,
    extension: &str,
    page_width: u32,
    page_height: u32,
    doc: &mut Document,
    z_order: i32,
    text_wrap: TextWrap,
    description: &str,
) -> Paragraph {
    doc.bin_data_content.push(BinDataContent {
        id: bin_data_id,
        data: image_bytes,
        extension: extension.to_string(),
    });
    doc.doc_info.bin_data_list.push(BinData {
        raw_data: None,
        attr: 0x0101,
        data_type: BinDataType::Embedding,
        compression: BinDataCompression::Default,
        status: BinDataStatus::Success,
        abs_path: None,
        rel_path: None,
        storage_id: bin_data_id,
        extension: Some(extension.to_string()),
    });

    let ctrl_id = 0x24726563; // "$rec"
    let instance_id = 0x70000000u32
        .wrapping_add((z_order as u32).wrapping_mul(0x100))
        .wrapping_add(page_width)
        .wrapping_add(page_height.wrapping_mul(0x1b));

    let common = CommonObjAttr {
        ctrl_id,
        vertical_offset: 0,
        horizontal_offset: 0,
        width: page_width,
        height: page_height,
        z_order,
        instance_id,
        treat_as_char: false,
        vert_rel_to: VertRelTo::Paper,
        vert_align: VertAlign::Top,
        horz_rel_to: HorzRelTo::Paper,
        text_wrap,
        width_criterion: SizeCriterion::Absolute,
        height_criterion: SizeCriterion::Absolute,
        description: description.to_string(),
        ..Default::default()
    };

    let drawing = DrawingObjAttr {
        shape_attr: ShapeComponentAttr {
            ctrl_id,
            is_two_ctrl_id: true,
            original_width: page_width,
            original_height: page_height,
            current_width: page_width,
            current_height: page_height,
            local_file_version: 1,
            rotation_center: rhwp::model::Point {
                x: (page_width / 2) as i32,
                y: (page_height / 2) as i32,
            },
            render_sx: 1.0,
            render_sy: 1.0,
            ..Default::default()
        },
        border_line: ShapeBorderLine {
            color: 0x00FFFFFF,
            width: 0,
            attr: 0,
            outline_style: 0,
        },
        fill: Fill {
            fill_type: FillType::Image,
            image: Some(ImageFill {
                fill_mode: ImageFillMode::FitToSize,
                brightness: 0,
                contrast: 0,
                effect: 0,
                bin_data_id,
            }),
            alpha: 255,
            ..Default::default()
        },
        inst_id: (instance_id & 0x3FFFFFFF) + 1,
        ..Default::default()
    };

    let shape = ShapeObject::Rectangle(RectangleShape {
        common,
        drawing,
        round_rate: 0,
        x_coords: [0, page_width as i32, page_width as i32, 0],
        y_coords: [0, 0, page_height as i32, page_height as i32],
    });

    shape_anchor_paragraph(shape, 0, 200)
}

fn build_image_shape_paragraph(
    bin_data_id: u16,
    image_bytes: Vec<u8>,
    extension: &str,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    doc: &mut Document,
    z_order: i32,
    description: &str,
) -> Paragraph {
    doc.bin_data_content.push(BinDataContent {
        id: bin_data_id,
        data: image_bytes,
        extension: extension.to_string(),
    });
    doc.doc_info.bin_data_list.push(BinData {
        raw_data: None,
        attr: 0x0101,
        data_type: BinDataType::Embedding,
        compression: BinDataCompression::Default,
        status: BinDataStatus::Success,
        abs_path: None,
        rel_path: None,
        storage_id: bin_data_id,
        extension: Some(extension.to_string()),
    });

    let ctrl_id = 0x24726563; // "$rec"
    let instance_id = 0x71000000u32
        .wrapping_add((z_order as u32).wrapping_mul(0x100))
        .wrapping_add(x.wrapping_mul(3))
        .wrapping_add(y.wrapping_mul(7))
        .wrapping_add(width)
        .wrapping_add(height.wrapping_mul(0x1b));

    let common = CommonObjAttr {
        ctrl_id,
        vertical_offset: y,
        horizontal_offset: x,
        width,
        height,
        z_order,
        instance_id,
        treat_as_char: false,
        vert_rel_to: VertRelTo::Paper,
        vert_align: VertAlign::Top,
        horz_rel_to: HorzRelTo::Paper,
        text_wrap: TextWrap::InFrontOfText,
        width_criterion: SizeCriterion::Absolute,
        height_criterion: SizeCriterion::Absolute,
        description: description.to_string(),
        ..Default::default()
    };

    let drawing = DrawingObjAttr {
        shape_attr: ShapeComponentAttr {
            ctrl_id,
            is_two_ctrl_id: true,
            original_width: width,
            original_height: height,
            current_width: width,
            current_height: height,
            local_file_version: 1,
            rotation_center: rhwp::model::Point {
                x: (width / 2) as i32,
                y: (height / 2) as i32,
            },
            render_sx: 1.0,
            render_sy: 1.0,
            ..Default::default()
        },
        border_line: ShapeBorderLine {
            color: 0x00FFFFFF,
            width: 0,
            attr: 0,
            outline_style: 0,
        },
        fill: Fill {
            fill_type: FillType::Image,
            image: Some(ImageFill {
                fill_mode: ImageFillMode::FitToSize,
                brightness: 0,
                contrast: 0,
                effect: 0,
                bin_data_id,
            }),
            alpha: 255,
            ..Default::default()
        },
        inst_id: (instance_id & 0x3FFFFFFF) + 1,
        ..Default::default()
    };

    let shape = ShapeObject::Rectangle(RectangleShape {
        common,
        drawing,
        round_rate: 0,
        x_coords: [0, width as i32, width as i32, 0],
        y_coords: [0, 0, height as i32, height as i32],
    });

    shape_anchor_paragraph(shape, 0, 200)
}

fn install_page_background_image(
    section: &mut Section,
    doc: &mut Document,
    image_bytes: Vec<u8>,
    extension: &str,
) {
    let bin_data_id = (doc.doc_info.bin_data_list.len() + 1) as u16;
    doc.bin_data_content.push(BinDataContent {
        id: bin_data_id,
        data: image_bytes,
        extension: extension.to_string(),
    });
    doc.doc_info.bin_data_list.push(BinData {
        raw_data: None,
        attr: 0x0101,
        data_type: BinDataType::Embedding,
        compression: BinDataCompression::Default,
        status: BinDataStatus::Success,
        abs_path: None,
        rel_path: None,
        storage_id: bin_data_id,
        extension: Some(extension.to_string()),
    });

    let no_border = BorderLine {
        line_type: BorderLineType::None,
        width: 0,
        color: 0x00FFFFFF,
    };
    doc.doc_info.border_fills.push(BorderFill {
        raw_data: None,
        attr: 0,
        borders: [no_border; 4],
        diagonal: Default::default(),
        fill: Fill {
            fill_type: FillType::Image,
            image: Some(ImageFill {
                fill_mode: ImageFillMode::FitToSize,
                brightness: 0,
                contrast: 0,
                effect: 0,
                bin_data_id,
            }),
            alpha: 255,
            ..Default::default()
        },
    });

    section.section_def.page_border_fill = PageBorderFill {
        attr: 0,
        spacing_left: 0,
        spacing_right: 0,
        spacing_top: 0,
        spacing_bottom: 0,
        border_fill_id: doc.doc_info.border_fills.len() as u16,
    };
}

fn build_picture_paragraph(
    bin_data_id: u16,
    image_bytes: Vec<u8>,
    extension: &str,
    natural_w: u32,
    natural_h: u32,
    target_w_mm: f32,
    doc: &mut Document,
    body_width: i32,
    para_shape_id: u16,
    char_shape_id: u32,
    description: &str,
) -> rhwp::model::paragraph::Paragraph {
    let width = mm_to_hwpunit(target_w_mm);
    let height = ((width as f64) * (natural_h as f64 / natural_w.max(1) as f64)).round() as u32;

    doc.bin_data_content.push(BinDataContent {
        id: bin_data_id,
        data: image_bytes,
        extension: extension.to_string(),
    });
    doc.doc_info.bin_data_list.push(BinData {
        raw_data: None,
        attr: 0x0101,
        data_type: BinDataType::Embedding,
        compression: BinDataCompression::Default,
        status: BinDataStatus::Success,
        abs_path: None,
        rel_path: None,
        storage_id: bin_data_id,
        extension: Some(extension.to_string()),
    });

    let common = CommonObjAttr {
        ctrl_id: 0x67736F20, // "gso "
        attr: 0,
        treat_as_char: false,
        vertical_offset: 0,
        horizontal_offset: 0,
        vert_rel_to: VertRelTo::Paper,
        horz_rel_to: HorzRelTo::Paper,
        text_wrap: TextWrap::InFrontOfText,
        width_criterion: SizeCriterion::Absolute,
        height_criterion: SizeCriterion::Absolute,
        width,
        height,
        z_order: 0,
        description: description.to_string(),
        ..Default::default()
    };

    let shape_attr = ShapeComponentAttr {
        original_width: width,
        original_height: height,
        current_width: width,
        current_height: height,
        local_file_version: 1,
        render_sx: 1.0,
        render_sy: 1.0,
        ..Default::default()
    };

    let pic = Picture {
        common,
        shape_attr,
        border_color: 0,
        border_width: 0,
        border_attr: ShapeBorderLine::default(),
        border_x: [0, 0, width as i32, 0],
        border_y: [width as i32, height as i32, 0, height as i32],
        crop: CropInfo {
            left: 0,
            top: 0,
            right: (natural_w.max(1) * 75) as i32,
            bottom: (natural_h.max(1) * 75) as i32,
        },
        image_attr: ImageAttr {
            bin_data_id,
            brightness: 0,
            contrast: 0,
            effect: ImageEffect::RealPic,
            external_path: None,
        },
        ..Default::default()
    };

    rhwp::model::paragraph::Paragraph {
        text: String::new(),
        char_count: 9,
        control_mask: 0x00000800,
        char_offsets: vec![],
        char_shapes: vec![CharShapeRef {
            start_pos: 0,
            char_shape_id,
        }],
        line_segs: vec![LineSeg {
            text_start: 0,
            line_height: height as i32,
            text_height: height as i32,
            baseline_distance: (height as i32 * 850) / 1000,
            line_spacing: 600,
            column_start: 0,
            segment_width: body_width,
            tag: 0x00060000,
            ..Default::default()
        }],
        para_shape_id,
        style_id: 0,
        controls: vec![Control::Picture(Box::new(pic))],
        ctrl_data_records: vec![None],
        has_para_text: true,
        ..Default::default()
    }
}

fn media_extension(id: &str) -> &str {
    Path::new(id)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("png")
}

fn find_media<'a>(ingest: &'a IngestDocument, id: &str) -> Option<&'a Media> {
    ingest
        .questions
        .iter()
        .flat_map(|question| question.media.iter())
        .find(|media| media.id == id)
}

fn replace_image_placeholders(doc: &mut Document, ingest: &IngestDocument, media_dir: Option<&str>, body_width: i32) {
    let Some(media_dir) = media_dir else { return; };
    let mut next_bin_data_id = 1u16;

    for section_idx in 0..doc.sections.len() {
        let old_paragraphs = std::mem::take(&mut doc.sections[section_idx].paragraphs);
        let mut new_paragraphs = Vec::with_capacity(old_paragraphs.len());

        for para in old_paragraphs {
            let text = para.text.trim();
            if let Some(id) = text.strip_prefix("[이미지: ").and_then(|value| value.strip_suffix(']')) {
                if let Some(media) = find_media(ingest, id) {
                    let image_path = Path::new(media_dir).join(&media.id);
                    match fs::read(&image_path) {
                        Ok(bytes) => {
                            let target_w_mm = media.target_w_mm.unwrap_or(170.0);
                            new_paragraphs.push(build_picture_paragraph(
                                next_bin_data_id,
                                bytes,
                                media_extension(&media.id),
                                media.natural_w,
                                media.natural_h,
                                target_w_mm,
                                doc,
                                body_width,
                                para.para_shape_id,
                                para.char_shapes.first().map(|cs| cs.char_shape_id).unwrap_or(0),
                                &format!("PDF page image: {}", media.id),
                            ));
                            next_bin_data_id = next_bin_data_id.saturating_add(1);
                            continue;
                        }
                        Err(err) => {
                            eprintln!("warning: failed to read media '{}': {err}", image_path.display());
                        }
                    }
                }
            }
            new_paragraphs.push(para);
        }

        doc.sections[section_idx].paragraphs = new_paragraphs;
    }
}

fn normalize_document_for_hwp(doc: &mut Document, ingest: &IngestDocument, media_dir: Option<&str>) {
    let page_width = mm_to_hwpunit(ingest.page_size.width_mm);
    let page_height = mm_to_hwpunit(ingest.page_size.height_mm);
    let margin_left = mm_to_hwpunit(20.0);
    let margin_right = mm_to_hwpunit(20.0);
    let margin_top = mm_to_hwpunit(15.0);
    let margin_bottom = mm_to_hwpunit(15.0);
    let margin_header = mm_to_hwpunit(10.0);
    let margin_footer = mm_to_hwpunit(10.0);
    let body_width = page_width
        .saturating_sub(margin_left)
        .saturating_sub(margin_right) as i32;

    doc.header = default_hwp_header();

    if doc.sections.is_empty() {
        doc.sections.push(Section::default());
    }

    doc.doc_properties = DocProperties {
        section_count: doc.sections.len() as u16,
        page_start_num: 1,
        footnote_start_num: 1,
        endnote_start_num: 1,
        picture_start_num: 1,
        table_start_num: 1,
        equation_start_num: 1,
        raw_data: None,
        caret_list_id: 0,
        caret_para_id: 0,
        caret_char_pos: 0,
    };

    doc.doc_info.font_faces = default_font_faces(&ingest.default_font);
    doc.doc_info.border_fills = vec![BorderFill::default()];
    doc.doc_info.char_shapes = vec![default_char_shape()];
    doc.doc_info.tab_defs = vec![TabDef {
        auto_tab_left: true,
        auto_tab_right: true,
        ..Default::default()
    }];
    doc.doc_info.para_shapes = vec![ParaShape {
        line_spacing: 160,
        line_spacing_v2: 160,
        alignment: Alignment::Left,
        tab_def_id: 0,
        border_fill_id: 0,
        ..Default::default()
    }];
    doc.doc_info.styles = vec![Style {
        local_name: "바탕글".to_string(),
        english_name: "Normal".to_string(),
        style_type: 0,
        next_style_id: 0,
        para_shape_id: 0,
        char_shape_id: 0,
        ..Default::default()
    }];
    doc.doc_info.raw_stream = None;
    doc.doc_info.raw_stream_dirty = true;
    doc.bin_data_content.clear();

    replace_image_placeholders(doc, ingest, media_dir, body_width);

    for section in &mut doc.sections {
        section.section_def.page_def = PageDef {
            width: page_width,
            height: page_height,
            margin_left,
            margin_right,
            margin_top,
            margin_bottom,
            margin_header,
            margin_footer,
            margin_gutter: 0,
            attr: 0,
            landscape: false,
            binding: Default::default(),
        };
        section.section_def.page_border_fill = PageBorderFill {
            border_fill_id: 0,
            ..Default::default()
        };
        section.raw_stream = None;

        let mut vertical_pos = (margin_top + margin_header) as i32;
        for para in &mut section.paragraphs {
            let utf16_len = para.text.encode_utf16().count() as u32;
            para.char_count = utf16_len + 1;
            para.char_offsets = (0..utf16_len).collect();
            para.char_shapes = vec![CharShapeRef {
                start_pos: 0,
                char_shape_id: 0,
            }];
            para.para_shape_id = 0;
            para.style_id = 0;
            para.has_para_text = true;

            para.line_segs = vec![LineSeg {
                text_start: 0,
                vertical_pos,
                line_height: 1000,
                text_height: 1000,
                baseline_distance: 850,
                line_spacing: 600,
                column_start: 0,
                segment_width: body_width,
                tag: 0x00060000,
            }];
            vertical_pos += 1600;
        }

        if let Some(last_para) = section.paragraphs.last_mut() {
            last_para.controls.retain(|ctrl| !matches!(ctrl, Control::SectionDef(_)));
            last_para
                .controls
                .push(Control::SectionDef(Box::new(section.section_def.clone())));
        }
    }
}

fn build_pdf_layout_document(ingest: &IngestDocument, layout: &PdfLayout, media_dir: Option<&str>) -> Document {
    let visual_mode = layout.visual_mode.as_deref().unwrap_or("source-image-top");
    let text_above_background = visual_mode == "clean-background-visible-text";
    let page_width = mm_to_hwpunit(ingest.page_size.width_mm);
    let page_height = mm_to_hwpunit(ingest.page_size.height_mm);
    let mut doc = rhwp::document_core::builders::exam_paper::build_exam_paper(ingest);

    doc.header = default_hwp_header();

    doc.sections.clear();
    doc.doc_properties = DocProperties {
        section_count: layout.pages.len().max(1) as u16,
        page_start_num: 1,
        footnote_start_num: 1,
        endnote_start_num: 1,
        picture_start_num: 1,
        table_start_num: 1,
        equation_start_num: 1,
        raw_data: None,
        caret_list_id: 0,
        caret_para_id: 0,
        caret_char_pos: 0,
    };

    let mut font_names: Vec<String> = vec![ingest.default_font.clone()];
    for page in &layout.pages {
        for line in &page.lines {
            let font_name = normalize_font_name(line.font_family.as_deref().unwrap_or(&ingest.default_font), &ingest.default_font);
            if !font_names.iter().any(|name| name == &font_name) {
                font_names.push(font_name);
            }
        }
        for table in &page.tables {
            for cell in &table.cells {
                let font_name = normalize_font_name(cell.font_family.as_deref().unwrap_or(&ingest.default_font), &ingest.default_font);
                if !font_names.iter().any(|name| name == &font_name) {
                    font_names.push(font_name);
                }
            }
        }
    }

    doc.doc_info.font_faces = (0..7)
        .map(|_| {
            font_names
                .iter()
                .map(|name| Font {
                    raw_data: None,
                    name: name.clone(),
                    alt_type: 0,
                    alt_name: None,
                    default_name: None,
                })
                .collect()
        })
        .collect();
    doc.doc_info.border_fills = vec![BorderFill::default()];
    doc.doc_info.tab_defs = vec![TabDef {
        auto_tab_left: true,
        auto_tab_right: true,
        ..Default::default()
    }];
    doc.doc_info.para_shapes = vec![ParaShape {
        line_spacing: 100,
        line_spacing_v2: 100,
        alignment: Alignment::Left,
        tab_def_id: 0,
        border_fill_id: 0,
        ..Default::default()
    }];
    doc.doc_info.styles = vec![Style {
        local_name: "바탕글".to_string(),
        english_name: "Normal".to_string(),
        style_type: 0,
        next_style_id: 0,
        para_shape_id: 0,
        char_shape_id: 0,
        ..Default::default()
    }];
    doc.doc_info.raw_stream = None;
    doc.doc_info.raw_stream_dirty = true;
    doc.bin_data_content.clear();
    doc.doc_info.bin_data_list.clear();

    let mut char_shapes: Vec<CharShape> = Vec::new();
    let mut char_shape_id_for = |font_name: &str, font_size: i32, bold: bool, color: u32, ratio: u8, spacing: i8| -> u32 {
        let font_id = font_names
            .iter()
            .position(|name| name == font_name)
            .unwrap_or(0) as u16;
        let candidate = CharShape {
            font_ids: [font_id; 7],
            ratios: [ratio; 7],
            spacings: [spacing; 7],
            relative_sizes: [100; 7],
            char_offsets: [0; 7],
            base_size: font_size,
            text_color: color,
            underline_color: 0x00000000,
            shade_color: 0x00FFFFFF,
            shadow_color: 0x00B2B2B2,
            strike_color: 0x00000000,
            bold,
            ..Default::default()
        };
        if let Some(idx) = char_shapes.iter().position(|shape| *shape == candidate) {
            idx as u32
        } else {
            char_shapes.push(candidate);
            (char_shapes.len() - 1) as u32
        }
    };

    for page in &layout.pages {
        let mut section = Section::default();
        section.section_def.page_def = PageDef {
            width: page_width,
            height: page_height,
            margin_left: 0,
            margin_right: 0,
            margin_top: 0,
            margin_bottom: 0,
            margin_header: 0,
            margin_footer: 0,
            margin_gutter: 0,
            attr: 0,
            landscape: page_width > page_height,
            binding: Default::default(),
        };
        section.section_def.page_border_fill = PageBorderFill {
            border_fill_id: 0,
            ..Default::default()
        };
        section.raw_stream = None;

        let sx = if page.width > 0.0 { page_width as f32 / page.width } else { 1.0 };
        let sy = if page.height > 0.0 { page_height as f32 / page.height } else { 1.0 };
        let word_level_layout = layout.unit.as_deref() == Some("pdfbbox");
        let glyph_level_layout = layout.unit.as_deref() == Some("pdfglyph");
        let mut z_order = if text_above_background { 1000i32 } else { 0i32 };

        // Add the PDF page visual layer. In the editable clean mode this must be
        // a true page background, not a full-page drawing object, so the body text
        // remains directly selectable/editable and clicks are not intercepted by
        // a background shape. Non-clean compatibility mode keeps the old
        // shape/z-order path because it intentionally paints the exact source
        // raster over coordinate text boxes for maximum visual fidelity.
        if let (Some(background), Some(media_dir)) = (&page.background, media_dir) {
            let image_path = Path::new(media_dir).join(&background.id);
            match fs::read(&image_path) {
                Ok(bytes) => {
                    if text_above_background {
                        install_page_background_image(
                            &mut section,
                            &mut doc,
                            bytes,
                            media_extension(&background.id),
                        );
                    } else {
                        let next_bin_data_id = (doc.doc_info.bin_data_list.len() + 1) as u16;
                        section.paragraphs.push(build_background_shape_paragraph(
                            next_bin_data_id,
                            bytes,
                            media_extension(&background.id),
                            page_width,
                            page_height,
                            &mut doc,
                            10000,
                            TextWrap::InFrontOfText,
                            &format!("PDF original page visual layer: {}", background.id),
                        ));
                    }
                }
                Err(err) => {
                    eprintln!("warning: failed to read PDF page background '{}': {err}", image_path.display());
                }
            }
        }

        // When a cleaned PDF page background exists, the original vector/table borders
        // are already preserved in that image. Do not add heuristic border boxes on top;
        // they can drift or duplicate lines and make the visual result less faithful.
        if page.background.is_none() {
            for b in &page.boxes {
                if box_is_inside_table(b, &page.tables) {
                    continue;
                }
                let x = (b.x.max(0.0) * sx).round() as u32;
                let y = (b.y.max(0.0) * sy).round() as u32;
                let w = (b.width.max(0.4) * sx).round().max(20.0) as u32;
                let h = (b.height.max(0.4) * sy).round().max(20.0) as u32;
                let shape = make_border_shape(b, x, y, w, h, z_order);
                section.paragraphs.push(shape_anchor_paragraph(shape, 0, 200));
                z_order += 1;
            }
        }

        if let Some(media_dir) = media_dir {
            for image in &page.images {
                let image_path = Path::new(media_dir).join(&image.id);
                match fs::read(&image_path) {
                    Ok(bytes) => {
                        let x = (image.x.max(0.0) * sx).round() as u32;
                        let y = (image.y.max(0.0) * sy).round() as u32;
                        let w = (image.width.max(1.0) * sx).round().max(20.0) as u32;
                        let h = (image.height.max(1.0) * sy).round().max(20.0) as u32;
                        let next_bin_data_id = (doc.doc_info.bin_data_list.len() + 1) as u16;
                        section.paragraphs.push(build_image_shape_paragraph(
                            next_bin_data_id,
                            bytes,
                            media_extension(&image.id),
                            x,
                            y,
                            w,
                            h,
                            &mut doc,
                            z_order,
                            &format!("PDF native image: {}", image.id),
                        ));
                        z_order += 1;
                    }
                    Err(err) => {
                        eprintln!("warning: failed to read PDF native image '{}': {err}", image_path.display());
                    }
                }
            }
        }

        let mut table_line_keys = std::collections::HashSet::new();
        if !page.tables.is_empty() {
            for table in &page.tables {
                for cell in &table.cells {
                    let normalized = cell.text.split_whitespace().collect::<String>().to_lowercase();
                    if !normalized.is_empty() {
                        table_line_keys.insert(normalized);
                    }
                }
            }
            for table in &page.tables {
                    let row_count = table.row_heights.len().max(1) as u16;
                    let col_count = table.columns.len().max(1) as u16;
                    let col_width_units: Vec<u32> = if table.columns.is_empty() {
                        vec![(table.width.max(1.0) * sx).round().max(20.0) as u32]
                    } else {
                        table.columns.iter().map(|w| (w.max(0.5) * sx).round().max(20.0) as u32).collect()
                    };
                    let row_height_units: Vec<u32> = if table.row_heights.is_empty() {
                        vec![(table.height.max(1.0) * sy).round().max(20.0) as u32]
                    } else {
                        table.row_heights.iter().map(|h| (h.max(0.5) * sy).round().max(20.0) as u32).collect()
                    };

                    let mut cells: Vec<Cell> = table.cells.iter().map(|src_cell| {
                        let row = src_cell.row.min(row_count.saturating_sub(1) as usize) as u16;
                        let col = src_cell.col.min(col_count.saturating_sub(1) as usize) as u16;
                        let row_span = src_cell.row_span.max(1).min(row_count as usize - row as usize) as u16;
                        let col_span = src_cell.col_span.max(1).min(col_count as usize - col as usize) as u16;
                        let width = (0..col_span as usize)
                            .map(|i| *col_width_units.get(col as usize + i).unwrap_or(&col_width_units[0]))
                            .sum::<u32>();
                        let height = (0..row_span as usize)
                            .map(|i| *row_height_units.get(row as usize + i).unwrap_or(&row_height_units[0]))
                            .sum::<u32>();
                        let text = src_cell.text.trim();
                        let font_name = normalize_font_name(src_cell.font_family.as_deref().unwrap_or(&ingest.default_font), &ingest.default_font);
                        let font_size = src_cell.font_size
                            .map(|size| (size * sx).round() as i32)
                            .unwrap_or(1000)
                            .clamp(600, 7200);
                        let color = html_color_to_hwp_color(src_cell.color.as_deref());
                        let char_shape_id = char_shape_id_for(&font_name, font_size, src_cell.bold, color, 100, 0);
                        let line_height = ((font_size * 135) / 100).clamp(600, (height as i32).max(600));
                        Cell {
                            col,
                            row,
                            col_span,
                            row_span,
                            width,
                            height,
                            padding: Padding {
                                left: 900,
                                right: 360,
                                top: 360,
                                bottom: 180,
                            },
                            border_fill_id: table_cell_border_fill_id(&mut doc, src_cell.style.as_ref()),
                            paragraphs: vec![text_paragraph(text, char_shape_id, line_height, (width as i32).max(200))],
                            vertical_align: VerticalAlign::Center,
                            apply_inner_margin: true,
                            ..Default::default()
                        }
                    }).collect();
                    eprintln!("[DBG] table.cells={} cells_out={} row_count={} col_count={}", table.cells.len(), cells.len(), row_count, col_count);
                    cells.sort_by_key(|c| (c.row, c.col));

                    let table_x = (table.x.max(0.0) * sx).round() as u32;
                    let table_y = (table.y.max(0.0) * sy).round() as u32;
                    let table_width = col_width_units.iter().sum::<u32>();
                    let table_height = row_height_units.iter().sum::<u32>();
                    let table_instance_id = 0x7c150000u32
                        .wrapping_add(row_count as u32 * 0x1000)
                        .wrapping_add(col_count as u32 * 0x100)
                        .wrapping_add(table_x.wrapping_mul(3))
                        .wrapping_add(table_y.wrapping_mul(7))
                        .wrapping_add(table_width)
                        .wrapping_add(table_height.wrapping_mul(0x1b));
                    let table_common = CommonObjAttr {
                        attr: 0x006A0000,
                        horizontal_offset: table_x,
                        vertical_offset: table_y,
                        width: table_width,
                        height: table_height,
                        z_order,
                        instance_id: if table_instance_id == 0 { 0x7c154b69 } else { table_instance_id },
                        treat_as_char: false,
                        vert_rel_to: VertRelTo::Paper,
                        horz_rel_to: HorzRelTo::Paper,
                        text_wrap: TextWrap::InFrontOfText,
                        width_criterion: SizeCriterion::Absolute,
                        height_criterion: SizeCriterion::Absolute,
                        description: String::new(),
                        ..Default::default()
                    };
                    let raw_ctrl_data = table_raw_ctrl_data(&table_common);

                    let mut native_table = Table {
                        attr: table_common.attr,
                        row_count,
                        col_count,
                        row_sizes: row_height_units.iter().map(|h| (*h).min(i16::MAX as u32) as i16).collect(),
                        cells,
                        cell_grid: Vec::new(),
                        page_break: TablePageBreak::None,
                        common: table_common,
                        raw_ctrl_data,
                        raw_table_record_attr: 0x04000006,
                        raw_table_record_extra: vec![0u8; 2],
                        ..Default::default()
                    };
                    native_table.rebuild_grid();
                    let table_height = (native_table.common.height as i32).max(600);
                section.paragraphs.push(table_anchor_paragraph(native_table, table_y as i32, table_height));
            }
        }

        if text_above_background {
            // In the default PDF→HWP mode, the cleaned PDF raster is a behind-text
            // visual guide and the extracted text is emitted as ordinary HWP body
            // paragraphs. That makes the text directly selectable/editable instead
            // of forcing users to edit text inside drawing objects.
            let mut cursor_y = if page.background.is_some() { 200i32 } else { 0i32 };
            let mut direct_lines = page.lines.iter().collect::<Vec<_>>();
            direct_lines.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal)));

            for line in direct_lines {
                let text = line.text.trim();
                if text.is_empty() {
                    continue;
                }
                let line_key = text.split_whitespace().collect::<String>().to_lowercase();
                if !line_key.is_empty() && table_line_keys.contains(&line_key) {
                    continue;
                }
                let font_name = normalize_font_name(line.font_family.as_deref().unwrap_or(&ingest.default_font), &ingest.default_font);
                let scaled_font = line.font_size
                    .map(|size| (size * sx).round() as i32)
                    .unwrap_or_else(|| (line.height * sy * 0.70).round().max(900.0) as i32);
                let font_size = scaled_font.clamp(600, 7200);
                let color = html_color_to_hwp_color(line.color.as_deref());
                let x = (line.x.max(0.0) * sx).round() as i32;
                let y = (line.y.max(0.0) * sy).round() as i32;
                let h = (line.height.max(1.0) * sy * 1.02).round().max(600.0) as i32;
                let gap = y.saturating_sub(cursor_y);
                if gap > 80 {
                    section.paragraphs.push(spacer_paragraph(gap, page_width as i32));
                }

                let para_shape_id = doc.doc_info.para_shapes.len() as u16;
                doc.doc_info.para_shapes.push(ParaShape {
                    margin_left: x.max(0),
                    margin_right: 0,
                    line_spacing: 100,
                    line_spacing_v2: 100,
                    alignment: Alignment::Left,
                    tab_def_id: 0,
                    border_fill_id: 0,
                    ..Default::default()
                });

                let char_shape_id = char_shape_id_for(&font_name, font_size, line.bold, color, 100, 0);
                let mut paragraph = text_paragraph(text, char_shape_id, h, (page_width as i32 - x.max(0)).max(200));
                paragraph.para_shape_id = para_shape_id;
                section.paragraphs.push(paragraph);
                cursor_y = y.saturating_add(h);
            }
        } else {
            for line in &page.lines {
                // Glyph layout must keep pure spaces so word gaps match the PDF.
                let text = if glyph_level_layout {
                    line.text.clone()
                } else {
                    line.text.trim().to_string()
                };
                if text.is_empty() {
                    continue;
                }
                if !glyph_level_layout && text.chars().all(|c| c.is_whitespace()) {
                    continue;
                }
                let line_key = text.split_whitespace().collect::<String>().to_lowercase();
                if !line_key.is_empty() && table_line_keys.contains(&line_key) {
                    continue;
                }
                let font_name = normalize_font_name(line.font_family.as_deref().unwrap_or(&ingest.default_font), &ingest.default_font);
                let scaled_font = line.font_size
                    .map(|size| (size * sx).round() as i32)
                    .unwrap_or_else(|| (line.height * sy * 0.70).round().max(900.0) as i32);
                let font_size = scaled_font.clamp(600, 7200);
                let color = html_color_to_hwp_color(line.color.as_deref());
                let x = (line.x.max(0.0) * sx).round() as u32;
                let target_w = (line.width.max(1.0) * sx).round().max(200.0) as u32;
                let ratio = 100;
                // Fit letter-spacing to source width when natural width is known.
                let spacing: i8 = if let (Some(natural), Some(_size)) = (line.natural_width, line.font_size) {
                    if natural > 0.5 && line.width > 0.5 && line.text.chars().count() > 1 {
                        let factor = (line.width / natural) - 1.0;
                        (factor * 100.0).round().clamp(-50.0, 50.0) as i8
                    } else {
                        0
                    }
                } else {
                    0
                };
                let char_shape_id = char_shape_id_for(&font_name, font_size, line.bold, color, ratio, spacing);
                // Keep textbox geometry tight to the source PDF bbox / glyph box.
                let w = if word_level_layout {
                    (target_w as f32 * 1.01).round().max(200.0) as u32
                } else if glyph_level_layout {
                    // Exact glyph advance box — do not inflate or clipping/overlap worsens.
                    target_w.max(80)
                } else {
                    target_w
                };
                let h = if glyph_level_layout {
                    (line.height.max(1.0) * sy).round().max(400.0) as u32
                } else {
                    (line.height.max(1.0) * sy * if word_level_layout { 1.08 } else { 1.02 })
                        .round()
                        .max(600.0) as u32
                };
                // rhwp text baseline ≈ top + 0.85 * box_height (see LineSeg baseline_distance).
                // Place top so that rendered baseline lands on the PDF text origin.
                let y = if let Some(baseline) = line.baseline {
                    let box_h_page = (h as f32) / sy.max(1.0);
                    let top = baseline - 0.85 * box_h_page;
                    (top.max(0.0) * sy).round() as u32
                } else {
                    (line.y.max(0.0) * sy).round() as u32
                };
                let shape = make_textbox_shape(line, x, y, w, h, char_shape_id, z_order);
                section.paragraphs.push(shape_anchor_paragraph(shape, 0, 200));
                z_order += 1;
            }
        }

        if section.paragraphs.is_empty() {
            section.paragraphs.push(text_paragraph(
                "PDF에서 추출 가능한 텍스트가 없습니다. 스캔 이미지 PDF는 OCR 단계가 필요합니다.",
                0,
                1000,
                page_width as i32,
            ));
        }

        if let Some(last_para) = section.paragraphs.last_mut() {
            last_para.controls.retain(|ctrl| !matches!(ctrl, Control::SectionDef(_)));
            last_para
                .controls
                .push(Control::SectionDef(Box::new(section.section_def.clone())));
            last_para.ctrl_data_records.push(None);
        }

        doc.sections.push(section);
    }

    if doc.sections.is_empty() {
        doc.sections.push(Section::default());
    }

    if char_shapes.is_empty() {
        char_shapes.push(default_char_shape());
    }
    doc.doc_info.char_shapes = char_shapes;
    doc
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.iter().any(|arg| arg == "-V" || arg == "--version") {
        println!("rhwp-ingest-exporter 0.1.0");
        return;
    }
    if args.is_empty() || args.iter().any(|arg| arg == "-h" || arg == "--help") {
        usage();
        return;
    }

    let mut input_path: Option<String> = None;
    let mut output_path: Option<String> = None;
    let mut media_dir: Option<String> = None;
    let mut format: Option<String> = None;

    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-o" | "--output" => {
                if i + 1 >= args.len() {
                    eprintln!("error: -o/--output requires a path");
                    std::process::exit(2);
                }
                output_path = Some(args[i + 1].clone());
                i += 2;
            }
            "--media-dir" => {
                if i + 1 >= args.len() {
                    eprintln!("error: --media-dir requires a directory");
                    std::process::exit(2);
                }
                media_dir = Some(args[i + 1].clone());
                i += 2;
            }
            "--format" => {
                if i + 1 >= args.len() {
                    eprintln!("error: --format requires hwp or hwpx");
                    std::process::exit(2);
                }
                format = Some(args[i + 1].clone());
                i += 2;
            }
            other => {
                if input_path.is_none() {
                    input_path = Some(other.to_string());
                } else {
                    eprintln!("warning: ignoring unknown argument '{other}'");
                }
                i += 1;
            }
        }
    }

    let input = input_path.unwrap_or_else(|| {
        eprintln!("error: missing ingest JSON path");
        usage();
        std::process::exit(2);
    });
    let output = output_path.unwrap_or_else(|| {
        eprintln!("error: missing -o/--output path");
        usage();
        std::process::exit(2);
    });

    if let Some(dir) = &media_dir {
        if !Path::new(dir).exists() {
            eprintln!("warning: media directory does not exist: {dir}");
        }
    }

    let input_bytes = fs::read(&input).unwrap_or_else(|err| {
        eprintln!("error: failed to read ingest JSON '{input}': {err}");
        std::process::exit(1);
    });
    let layout = parse_pdf_layout(&input_bytes);
    let ingest = rhwp::parser::ingest::parse_ingest_bytes(&input_bytes).unwrap_or_else(|err| {
        eprintln!("error: failed to parse ingest JSON '{input}': {err}");
        std::process::exit(1);
    });

    let mut doc = if let Some(layout) = layout.as_ref() {
        build_pdf_layout_document(&ingest, layout, media_dir.as_deref())
    } else {
        let mut doc = rhwp::document_core::builders::exam_paper::build_exam_paper(&ingest);
        normalize_document_for_hwp(&mut doc, &ingest, media_dir.as_deref());
        doc
    };
    apply_hancom_compat(&mut doc, &ingest);
    let inferred_format = if output.to_ascii_lowercase().ends_with(".hwpx") { "hwpx" } else { "hwp" };
    let target_format = format.as_deref().unwrap_or(inferred_format);

    let output_bytes = match target_format {
        "hwp" => rhwp::serializer::serialize_hwp(&doc).unwrap_or_else(|err| {
            eprintln!("error: HWP serialization failed: {err}");
            std::process::exit(1);
        }),
        "hwpx" => rhwp::serializer::serialize_hwpx(&doc).unwrap_or_else(|err| {
            eprintln!("error: HWPX serialization failed: {err}");
            std::process::exit(1);
        }),
        other => {
            eprintln!("error: unsupported format '{other}', expected hwp or hwpx");
            std::process::exit(2);
        }
    };

    fs::write(&output, &output_bytes).unwrap_or_else(|err| {
        eprintln!("error: failed to write output '{output}': {err}");
        std::process::exit(1);
    });

    println!(
        "saved: {output} ({} bytes, format={target_format}, questions={}, paragraphs={})",
        output_bytes.len(),
        ingest.questions.len(),
        doc.sections.iter().map(|section| section.paragraphs.len()).sum::<usize>()
    );
}
