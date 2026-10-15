"""claude.ai 아티팩트로 올릴 한 파일짜리 HTML을 만든다.

CSS·JS·폰트를 모두 한 파일 안에 넣는다. (아티팩트는 외부 파일 불러오기가 막혀 있다.)
사용법: python3 build_artifact.py <출력 파일 경로>
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def font_data_uri(match):
    path = ROOT / match.group(1)
    data = base64.b64encode(path.read_bytes()).decode()
    return f"url('data:font/woff2;base64,{data}')"


def main(out_path):
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    css = re.sub(r"url\('(fonts/[^']+\.woff2)'\)", font_data_uri, css)

    head = html.split("<!-- BUILD:HEAD-START -->")[1].split("<!-- BUILD:HEAD-END -->")[0]
    head = re.sub(r'\s*<link rel="stylesheet" href="style.css[^"]*">', "", head)
    body = html.split("<body>")[1].split("</body>")[0]
    scripts_block = body.split("<!-- BUILD:SCRIPTS-START -->")[1].split("<!-- BUILD:SCRIPTS-END -->")[0]
    # ?v=... 는 브라우저 캐시를 피하려고 붙인 것이라 파일 이름에서 뗀다
    names = [n.split("?")[0] for n in re.findall(r'<script src="([^"]+)"></script>', scripts_block)]
    inline = "<script>window.__ARTIFACT__ = true;</script>\n" + "\n".join(
        "<script>\n" + (ROOT / n).read_text(encoding="utf-8") + "\n</script>" for n in names
    )
    body = body.replace(
        body[body.index("<!-- BUILD:SCRIPTS-START -->"): body.index("<!-- BUILD:SCRIPTS-END -->") + len("<!-- BUILD:SCRIPTS-END -->")],
        inline,
    )

    page = head.strip() + "\n<style>\n" + css + "\n</style>\n" + body.strip() + "\n"
    pathlib.Path(out_path).write_text(page, encoding="utf-8")
    print(f"wrote {out_path} ({len(page) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
