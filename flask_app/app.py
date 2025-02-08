from flask import Flask, render_template

from trace_imports import build_import_graph

app = Flask(__name__)

file_to_inspect = 'file_to_trace.py'
traced_imports = build_import_graph(file_to_inspect)
graph_data = traced_imports.get_parent_child_dict()


# Root route to serve the HTML page
@app.route('/')
def home():
    return render_template('force_graph.html', graph_data=graph_data)


if __name__ == '__main__':
    app.run(port=5000)
