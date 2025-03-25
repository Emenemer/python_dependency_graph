import argparse
import webbrowser

from flask import Flask, render_template

from trace_imports import build_import_graph


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--filepath", type=str)
    parser.add_argument("--track_conditional_imports", action='store_true')
    args = parser.parse_args()
    file_to_inspect = args.filepath
    display_conditional = args.track_conditional_imports

    traced_imports = build_import_graph(file_to_inspect, display_conditional)
    graph_data = traced_imports.get_parent_child_dict()
    app = Flask(__name__)

    # Root route to serve the HTML page
    @app.route('/')
    def home():
        return render_template('force_graph.html', graph_data=graph_data)

    host_address = '127.0.0.1'
    port = 5000
    full_address = f"http://{host_address}:{str(port)}"
    webbrowser.open(full_address)
    app.run(host=host_address, port=port)


if __name__ == '__main__':
    main()
