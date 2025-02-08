import ast
import hashlib
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path


class NodeType(StrEnum):
    ROOT = 'root'
    LOCAL = 'local'
    THIRD_PARTY = 'third_party'


@dataclass
class Node:
    name: str
    file_path: str
    type: NodeType

    def __hash__(self) -> int:
        self_as_string = f"{self.name}_{self.file_path}_{self.type}"
        return int(hashlib.sha1(self_as_string.encode("utf-8")).hexdigest(), 16)


class ImportTracker:
    def __init__(self):
        self._parent_nodes: set[Node] = set()
        self._child_nodes: set[Node] = set()
        self._connections: set[tuple[Node, Node]] = set()

    def add_connection(self, parent_node: Node, child_node: Node) -> None:
        self._parent_nodes.add(parent_node)
        self._child_nodes.add(child_node)
        self._connections.add((parent_node, child_node))

    @property
    def checked_files(self) -> set[str]:
        return {node.file_path for node in self._parent_nodes}

    def get_parent_child_dict(self) -> dict:
        all_nodes = self._parent_nodes | self._child_nodes

        graph_nodes = [{"id": node.file_path, "name": node.name, "type": node.type} for node in all_nodes]
        graph_connections = [{"source": parent_node.file_path, "target": child_node.file_path} for parent_node, child_node in self._connections]
        return {"nodes": graph_nodes, "links": graph_connections}


def find_imports_in_file(file_path: str) -> list[str]:
    imports = []

    with open(file_path, "r") as f:
        tree = ast.parse(f.read(), filename=file_path)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imports.append(f"{node.module}.{alias.name}")
    return imports


def build_import_graph(input_path: str) -> ImportTracker:
    """
    Builds a directed graph (parent -> child) of imports.
    """
    graph_connections = ImportTracker()

    def get_imports_from_file(current_node: Node) -> None:
        """
        Parses a Python file to get all imports (both import module and from module import ...).
        """

        imports_in_file = find_imports_in_file(current_node.file_path)

        for import_address in imports_in_file:
            split_import = import_address.split('.')

            root_package = split_import[0]
            if not Path(root_package).is_dir():
                # this means it's a 3rd party import, stop after logging this import
                child_node = Node(name=root_package, file_path=root_package, type=NodeType.THIRD_PARTY)
                graph_connections.add_connection(current_node, child_node)
                continue

            max_range = len(split_import) - 1
            for i in range(max_range):
                # if it's the last entry in the split import, check the .py file
                if i == max_range - 1:
                    possible_file = '/'.join(split_import[:i + 1]) + '.py'
                    child_node = Node(name=possible_file, file_path=possible_file, type=NodeType.LOCAL)
                    graph_connections.add_connection(current_node, child_node)
                    # check if we have already checked this file
                    if possible_file not in graph_connections.checked_files:
                        get_imports_from_file(child_node)
                    continue
                # else check for existence of __init__, and trace it
                base_path = '/'.join(split_import[:i + 1])
                if current_node.file_path.startswith(base_path):
                    # Prevent example_production/libs/pickle.py that imports from example_production/packages/test.py creating a link
                    # to the example_production init again. Could be left in, but its overly verbose IMO
                    continue
                possible_file = base_path + '/__init__.py'
                if Path(possible_file).is_file():
                    child_node = Node(name=possible_file, file_path=possible_file, type=NodeType.LOCAL)
                    graph_connections.add_connection(current_node, child_node)
                    if possible_file not in graph_connections.checked_files:
                        get_imports_from_file(child_node)

    starting_node = Node(
        name=input_path,
        file_path=input_path,
        type=NodeType.ROOT
    )
    get_imports_from_file(starting_node)
    return graph_connections


# Run the script with the desired directory
if __name__ == "__main__":
    directory = "file_to_trace.py"
    graph = build_import_graph(directory)
    pass
