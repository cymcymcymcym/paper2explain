#!/usr/bin/env python3
"""Strip metadata from JPEG and PNG images, in place.

Removes EXIF (including GPS), XMP, IPTC, JFIF, comments, and PNG text/time
chunks by deleting those segments/chunks from the file. The compressed image
data and the ICC colour profile are never touched, so this is lossless:
pixels render bit-identically before and after.

Run this on any new blog images before committing them to the public repo.

Usage:
    python scripts/strip-metadata.py [directory]   # default: current dir
"""
import os
import sys


# ---- JPEG --------------------------------------------------------------
# Drop COM and the metadata APPn segments. Keep APP2 when it carries an ICC
# colour profile, and keep APP14 (Adobe colour-transform) so colours decode
# correctly. The image data (after SOS) is copied verbatim.
def strip_jpeg(data):
    if data[:2] != b"\xff\xd8":
        return data  # not a JPEG -- leave alone
    out = bytearray(b"\xff\xd8")
    i, n = 2, len(data)
    while i + 1 < n:
        if data[i] != 0xFF:
            out.extend(data[i:])              # malformed -- copy rest, stop
            return bytes(out)
        while i + 1 < n and data[i + 1] == 0xFF:
            i += 1                            # skip 0xFF fill bytes
        marker = data[i + 1]
        if marker == 0xDA:                    # SOS -- scan data follows
            out.extend(data[i:])
            return bytes(out)
        if marker == 0xD9:                    # EOI
            out.extend(b"\xff\xd9")
            return bytes(out)
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            out.extend(data[i:i + 2])         # standalone marker, no payload
            i += 2
            continue
        if i + 4 > n:
            out.extend(data[i:])
            return bytes(out)
        seg_len = (data[i + 2] << 8) | data[i + 3]
        payload = data[i + 4:i + 2 + seg_len]
        if marker in (0xFE, 0xE0, 0xE1):              # COM, APP0 JFIF, APP1 EXIF/XMP
            drop = True
        elif marker == 0xE2:                          # APP2 -- ICC profile or MPF
            drop = not payload.startswith(b"ICC_PROFILE")
        elif 0xE3 <= marker <= 0xED or marker == 0xEF:  # APP3..APP13, APP15
            drop = True
        else:                                         # APP14 + all image segments
            drop = False
        if not drop:
            out.extend(data[i:i + 2 + seg_len])
        i += 2 + seg_len
    out.extend(data[i:])
    return bytes(out)


# ---- PNG ---------------------------------------------------------------
# Drop text / EXIF / timestamp chunks; keep everything rendering-relevant
# (IHDR, PLTE, IDAT, IEND, iCCP, sRGB, gAMA, tRNS, ...).
PNG_SIG = b"\x89PNG\r\n\x1a\n"
PNG_DROP = {b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"}


def strip_png(data):
    if data[:8] != PNG_SIG:
        return data
    out = bytearray(PNG_SIG)
    i, n = 8, len(data)
    while i + 12 <= n:
        length = int.from_bytes(data[i:i + 4], "big")
        ctype = data[i + 4:i + 8]
        end = i + 12 + length                 # len(4) + type(4) + data + crc(4)
        if ctype not in PNG_DROP:
            out.extend(data[i:end])
        i = end
        if ctype == b"IEND":
            break
    return bytes(out)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    scanned = changed = 0
    for dirpath, _, files in os.walk(root):
        for name in sorted(files):
            ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
            if ext not in ("jpg", "jpeg", "png"):
                continue
            path = os.path.join(dirpath, name)
            scanned += 1
            with open(path, "rb") as fh:
                data = fh.read()
            new = strip_png(data) if ext == "png" else strip_jpeg(data)
            if new != data:
                with open(path, "wb") as fh:
                    fh.write(new)
                changed += 1
                print(f"  stripped {path}  (-{len(data) - len(new)} bytes)")
    print(f"\n{changed} of {scanned} image(s) had metadata removed.")


if __name__ == "__main__":
    main()
