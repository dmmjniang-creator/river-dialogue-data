#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
记忆工具 · 建docx
功能：把一份 JSON 内容生成带中文样式的 Word 文档。
目的：以前每生成一次 docx 都要重写字体、样式、保存后校验那几段，重复；固化一次，后面只填内容。
用法：python 建docx.py <内容.json> <输出.docx>
边界：只写指定的输出文件，不改输入；样式固定六种，不开放自定义。
最后改：2026-11-06

内容 JSON 是一个数组，每项 {"t": 类型, "x": 文本}：
  title  文档大标题
  h1     一级小节
  body   加粗小标题（段首句）
  say    口播正文（首行缩进两字、1.4 倍行距）
  note   灰色小字（说明、不念）
  cue    橙色小字（剪辑/镜头提示，不念）
"""
import json
import sys

from docx import Document
from docx.shared import Pt, RGBColor
from docx.oxml.ns import qn

FONT = "Microsoft YaHei"
GRAY = RGBColor(0x80, 0x80, 0x80)
ORANGE = RGBColor(0xC0, 0x50, 0x00)


def _font(run, size=None, color=None):
    run.font.name = FONT
    run._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    if size:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color


def build(items, dst):
    doc = Document()

    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(11)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    for name in ("Title", "Heading 1", "Heading 2"):
        st = doc.styles[name]
        st.font.name = FONT
        st.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    for it in items:
        t, x = it.get("t"), it.get("x", "")
        if t == "title":
            p = doc.add_heading(x, level=0)
            for r in p.runs:
                _font(r)
        elif t == "h1":
            p = doc.add_heading(x, level=1)
            for r in p.runs:
                _font(r)
        elif t == "body":
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            _font(p.add_run(x))
            for r in p.runs:
                r.bold = True
        elif t == "say":
            p = doc.add_paragraph(x)
            p.paragraph_format.first_line_indent = Pt(22)
            p.paragraph_format.space_after = Pt(8)
            p.paragraph_format.line_spacing = 1.4
            for r in p.runs:
                _font(r)
        elif t == "note":
            p = doc.add_paragraph()
            _font(p.add_run(x), 9, GRAY)
        elif t == "cue":
            p = doc.add_paragraph()
            _font(p.add_run(x), 9, ORANGE)
        else:
            raise SystemExit("未知类型: %r" % (t,))

    doc.save(dst)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("用法：python 建docx.py <内容.json> <输出.docx>")
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8-sig") as f:
        items = json.load(f)
    build(items, dst)
    # 校验：重新打开，报段落数
    d2 = Document(dst)
    print("saved:", dst)
    print("段落数:", len([p for p in d2.paragraphs if p.text.strip()]))


if __name__ == "__main__":
    main()
