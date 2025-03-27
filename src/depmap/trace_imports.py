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
class ImportNode:
    name: str
    conditional: bool


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
        self._root_node: str | None = None
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

    def set_root_node(self, starting_node: Node):
        self._root_node = starting_node.file_path

    def is_root(self, node_path: str) -> bool:
        return self._root_node == node_path


def categorize_nodes(node) -> list[ImportNode]:

    parent_node = getattr(node, 'parent', None)
    if parent_node is None:
        raise ImportError("Import has no parent.")

    import_nodes = []
    # anything not directly in the file is a conditonal import in our book
    is_conditional = not isinstance(node.parent, ast.Module)
    if isinstance(node, ast.Import):
        for alias in node.names:
            import_nodes.append(ImportNode(name=alias.name, conditional=is_conditional))
    elif isinstance(node, ast.ImportFrom):
        for alias in node.names:
            import_nodes.append(ImportNode(name=f"{node.module}.{alias.name}", conditional=is_conditional))
    else:
        raise ImportError(f"Could not categorize node as it is not an import, but a '{type(node)}':\n{node}")
    return import_nodes


def find_imports_in_file(file_path: str) -> list[ImportNode]:
    imports: list[ImportNode] = []

    # get the tree
    with open(file_path, "r") as f:
        tree = ast.parse(f.read(), filename=file_path)

    # loop through tree and set parent <-> child relationships for all nodes
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            child.parent = node

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imported_nodes = categorize_nodes(node)
            imports.extend(imported_nodes)
    return imports


def build_import_graph(input_path: str, track_conditionals: bool, track_third_party: bool) -> ImportTracker:
    """
    Builds a directed graph (parent -> child) of imports.
    """

    def get_imports_from_file(current_node: Node) -> None:
        """
        Parses a Python file to get all imports (both import module and from module import ...).
        """

        imports_in_file = find_imports_in_file(current_node.file_path)

        for import_node in imports_in_file:
            if not track_conditionals and import_node.conditional:
                continue
            split_import = import_node.name.split('.')

            root_package = split_import[0]
            if not (working_dir / root_package).is_dir() and not (working_dir / (root_package + '.py')).is_file():
                # this means it's a 3rd party import, stop after logging this import
                if not track_third_party:
                    continue
                child_node = Node(name=root_package, file_path=root_package, type=NodeType.THIRD_PARTY)
                graph_connections.add_connection(current_node, child_node)
                continue

            max_range = len(split_import) - 1
            for i in range(max_range):
                # if it's the last entry in the split import, check the .py file
                if i == max_range - 1:
                    possible_file = '/'.join(split_import[:i + 1]) + '.py'
                    if not (working_dir / possible_file).is_file():
                        continue
                    node_type = NodeType.ROOT if graph_connections.is_root(possible_file) else NodeType.LOCAL
                    child_node = Node(name=possible_file, file_path=possible_file, type=node_type)
                    graph_connections.add_connection(current_node, child_node)
                    # check if we have already checked this file
                    if possible_file not in graph_connections.checked_files:
                        get_imports_from_file(child_node)
                    continue
                # else check for existence of __init__, and trace it
                base_path = '/'.join(split_import[:i + 1])
                possible_file = base_path + '/__init__.py'
                if (working_dir / possible_file).is_file():
                    node_type = NodeType.ROOT if graph_connections.is_root(possible_file) else NodeType.LOCAL
                    child_node = Node(name=possible_file, file_path=possible_file, type=node_type)
                    graph_connections.add_connection(current_node, child_node)
                    if possible_file not in graph_connections.checked_files:
                        get_imports_from_file(child_node)

    graph_connections = ImportTracker()
    working_dir = Path.cwd()

    starting_node = Node(
        name=input_path,
        file_path=input_path,
        type=NodeType.ROOT
    )
    graph_connections.set_root_node(starting_node)
    get_imports_from_file(starting_node)
    return graph_connections
