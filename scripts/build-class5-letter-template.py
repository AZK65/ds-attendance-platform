#!/usr/bin/env python3
"""Reflow the recreated Class 5 contract onto true US Letter pages.

The source recreation was laid out on Legal paper. This builder removes only
empty horizontal bands, then scales both axes equally. Text, rules, and form
fields therefore keep their natural proportions.
"""

from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path

import pymupdf
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


SOURCE_WIDTH = 612.0
SOURCE_HEIGHT = 1008.0
LETTER_WIDTH, LETTER_HEIGHT = letter
SCALE = 0.93
LEFT = (LETTER_WIDTH - SOURCE_WIDTH * SCALE) / 2
TOP = 18.0

# Coordinates are measured from the top of each Legal source page. Every cut
# lies in verified whitespace and avoids all form widgets.
CUTS = {
    0: [
        (0, 10), (116, 120), (130, 132), (142, 147), (281, 283),
        (301, 305), (453, 463), (490, 492), (497, 505), (516, 520),
        (547, 551), (575, 579), (603, 606), (631, 641), (734, 736),
        (765, 768), (797, 813), (838, 841), (850, 857), (890, 963),
        (974, 979), (988, 1004),
    ],
    1: [
        (94, 124), (148, 155), (173, 183), (201, 209), (229, 234),
        (254, 259), (279, 284), (304, 319), (352, 368), (379, 383),
        (406, 410), (591, 673), (692, 695), (786, 824), (849, 855),
        (889, 920), (947, 950), (987, 990),
    ],
}


def removed_before(y: float, cuts: list[tuple[int, int]]) -> float:
    removed = 0.0
    for start, end in cuts:
        if y >= end:
            removed += end - start
        elif y > start:
            removed += y - start
            break
        else:
            break
    return removed


def compact_top(y: float, cuts: list[tuple[int, int]]) -> float:
    return y - removed_before(y, cuts)


def kept_segments(cuts: list[tuple[int, int]]) -> list[tuple[float, float]]:
    segments: list[tuple[float, float]] = []
    cursor = 0.0
    for start, end in cuts:
        if start > cursor:
            segments.append((cursor, float(start)))
        cursor = float(end)
    if cursor < SOURCE_HEIGHT:
        segments.append((cursor, SOURCE_HEIGHT))
    return segments


def build_background(source_path: Path) -> bytes:
    source = pymupdf.open(source_path)
    output = pymupdf.open()
    for page_index in range(len(source)):
        target = output.new_page(width=LETTER_WIDTH, height=LETTER_HEIGHT)
        cuts = CUTS[page_index]
        for start, end in kept_segments(cuts):
            destination_top = TOP + compact_top(start, cuts) * SCALE
            target.show_pdf_page(
                pymupdf.Rect(
                    LEFT,
                    destination_top,
                    LEFT + SOURCE_WIDTH * SCALE,
                    destination_top + (end - start) * SCALE,
                ),
                source,
                page_index,
                clip=pymupdf.Rect(0, start, SOURCE_WIDTH, end),
                keep_proportion=True,
            )
    result = output.tobytes(garbage=4, deflate=True)
    output.close()
    source.close()
    return result


def inherited(widget, key: str):
    current = widget
    while current is not None:
        value = current.get(key)
        if value is not None:
            return value
        parent = current.get('/Parent')
        current = parent.get_object() if parent is not None else None
    return None


def map_rect(rect, cuts: list[tuple[int, int]]) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = (float(value) for value in rect)
    source_top = SOURCE_HEIGHT - y2
    source_bottom = SOURCE_HEIGHT - y1
    mapped_top = TOP + compact_top(source_top, cuts) * SCALE
    mapped_bottom = TOP + compact_top(source_bottom, cuts) * SCALE
    return (
        LEFT + x1 * SCALE,
        LETTER_HEIGHT - mapped_bottom,
        (x2 - x1) * SCALE,
        mapped_bottom - mapped_top,
    )


def build_form_overlay(source: PdfReader) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    pdf.setTitle('Qazi Driving School - Official Class 5 Sales Contract')
    form = pdf.acroForm

    for page_index, page in enumerate(source.pages):
        cuts = CUTS[page_index]
        for annotation_ref in page.get('/Annots') or []:
            widget = annotation_ref.get_object()
            if widget.get('/Subtype') != '/Widget' or not widget.get('/Rect'):
                continue
            name = inherited(widget, '/T')
            field_type = inherited(widget, '/FT')
            if not name or not field_type:
                continue
            x, y, width, height = map_rect(widget['/Rect'], cuts)
            value = inherited(widget, '/V')

            if field_type == '/Btn':
                form.checkbox(
                    name=str(name),
                    tooltip=str(name),
                    x=x,
                    y=y,
                    size=min(width, height),
                    checked=str(value) not in ('None', '/Off'),
                    buttonStyle='check',
                    borderWidth=0.65,
                    borderColor=colors.HexColor('#777777'),
                    fillColor=colors.white,
                    textColor=colors.black,
                    forceBorder=True,
                )
            else:
                form.textfield(
                    name=str(name),
                    tooltip=str(name),
                    x=x,
                    y=y,
                    width=width,
                    height=height,
                    value='' if value is None else str(value),
                    fontName='Helvetica',
                    fontSize=max(6.5, min(8.0, height * 0.62)),
                    borderStyle='underlined',
                    borderWidth=0.55,
                    borderColor=colors.HexColor('#999999'),
                    fillColor=colors.white,
                    textColor=colors.black,
                    forceBorder=True,
                )
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def build(source_path: Path, output_path: Path) -> None:
    source = PdfReader(str(source_path))
    if len(source.pages) != 2:
        raise ValueError('Expected the two-page Legal source contract')

    background = PdfReader(BytesIO(build_background(source_path)))
    overlay = PdfReader(BytesIO(build_form_overlay(source)))
    writer = PdfWriter()
    writer.clone_document_from_reader(overlay)
    for index, page in enumerate(writer.pages):
        page.merge_page(background.pages[index], over=False)
        page.mediabox = RectangleObject([0, 0, LETTER_WIDTH, LETTER_HEIGHT])
        page.cropbox = RectangleObject([0, 0, LETTER_WIDTH, LETTER_HEIGHT])
        page.trimbox = RectangleObject([0, 0, LETTER_WIDTH, LETTER_HEIGHT])
    writer.add_metadata({
        '/Title': 'Qazi Driving School - Official Class 5 Sales Contract',
        '/Subject': 'Fillable bilingual SAAQ Class 5 sales contract - US Letter',
        '/Author': 'Qazi Driving School',
    })
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open('wb') as stream:
        writer.write(stream)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.source, args.output)


if __name__ == '__main__':
    main()
