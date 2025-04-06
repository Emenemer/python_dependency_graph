import argparse
import os
import re
import webbrowser
from pathlib import Path

from depmap.trace_imports import build_import_graph

from jinja2 import Environment, FileSystemLoader, select_autoescape


def create_html_with_jinja(graph_data: dict) -> str:
    def inline_file(filepath: Path):
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()

    root_path = Path(__file__).parent
    css_content = inline_file(root_path / "static" / "css" / "styles.css")
    js_content = inline_file(root_path / "static" / "js" / "simulate_graph.js")

    # Set up Jinja environment manually
    env = Environment(
        loader=FileSystemLoader(root_path / "templates"),
        autoescape=select_autoescape(["html", "xml"])
    )

    rendered = env.get_template("force_graph.html").render(graph_data=graph_data)

    # Inline the static files
    rendered = re.sub(
        r'<link rel="stylesheet" href=".*?styles\.css"\s*/?>',
        f'<style>\n{css_content}\n</style>',
        rendered
    )
    rendered = re.sub(
        r'<script src=".*?simulate_graph\.js"\s*></script>',
        f'<script>\n{js_content}\n</script>',
        rendered
    )

    return rendered


def main():
    # parse args
    parser = argparse.ArgumentParser()
    parser.add_argument("filepath", type=str)
    parser.add_argument("--include_conditional_imports", action='store_true')
    parser.add_argument("--include_third_party", action='store_true')
    args = parser.parse_args()

    # trace imports
    traced_imports = build_import_graph(
        args.filepath,
        args.include_conditional_imports,
        args.include_third_party
    )
    graph_data = traced_imports.get_parent_child_dict()

    rendered_html = create_html_with_jinja(graph_data)

    # TODO: save to tempfile, delete after opening
    # Save the rendered HTML to a file
    output_path = r"C:\Users\Michiel Nijmeijer\Documents\temp\output.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rendered_html)

    file_url = f"file://{os.path.abspath(output_path)}"
    webbrowser.open(file_url)
