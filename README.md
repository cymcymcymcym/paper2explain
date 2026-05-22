# paper2explain — interactive paper explainers

Long, beginner-friendly walk-throughs of recent machine-learning papers, with
interactive canvas widgets you can drag, animations rendered in manim, and the
real paper figures inline.

**Live site → https://cymcymcymcym.github.io/paper2explain/**

Each blog is a single, self-contained HTML file — vanilla JS / Canvas widgets,
KaTeX for math, embedded MP4 from manim. No build step, no dependencies.

## Adding a blog

1. Drop the blog folder in as `<slug>/index.html` (with its `assets/`).
2. Append one entry to [`blogs.js`](blogs.js).
3. Run `python scripts/strip-metadata.py .` to strip metadata from any new images.
4. Commit and push — GitHub Pages redeploys automatically.
