import argparse
import logging
import multiprocessing
import sys
import threading
import time
import webbrowser

from flask import Flask, render_template
from waitress import serve

from depmap.trace_imports import build_import_graph


def create_app(graph_data: dict) -> Flask:
    app = Flask(__name__)
    app.logger.setLevel("DEBUG")

    # Root route to serve the HTML page
    @app.route('/')
    def home():
        return render_template('force_graph.html', graph_data=graph_data)

    return app


def open_browser(url: str) -> None:
    """Open browser after a delay to ensure server is up."""
    def _open_browser():
        time.sleep(0.5)
        webbrowser.open(url)

    browser_thread = threading.Thread(target=_open_browser)
    browser_thread.daemon = True
    browser_thread.start()


def main():
    # silence waitress output
    logger = logging.getLogger('waitress')
    logger.setLevel(logging.ERROR)

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

    # create app and serve
    app = create_app(graph_data)

    host_address = '127.0.0.1'
    port = 5000
    full_address = f"http://{host_address}:{str(port)}"
    open_browser(full_address)

    try:
        serve(app, host=host_address, port=port)
    except KeyboardInterrupt:
        # Allow keyboard interrupts
        print("\nShutting down server...")
        sys.exit(0)


if __name__ == '__main__':
    main()
