// Configuration and constants
const CONFIG = {
    nodeTypes: {
        types: ["root", "local", "third_party", "group"],  // Added group type
        colors: ["red", "green", "blue", "#ff9900"],       // Group color (orange)
        radii: [12, 10, 8, 16]                            // Group radius (larger)
    },
    initialSettings: {
        linkForce: 0.5,
        repelForce: -1500,
        centerForce: 0.02,
        linkLength: 100
    }
};

const nodeTypeColorScale = d3.scaleOrdinal()
    .domain(CONFIG.nodeTypes.types)
    .range(CONFIG.nodeTypes.colors);

const nodeRadiusScale = d3.scaleOrdinal()
    .domain(CONFIG.nodeTypes.types)
    .range(CONFIG.nodeTypes.radii);

// Node Group Manager Class
class NodeGroupManager {
    constructor(graphData) {
        this.originalNodes = [];
        this.originalLinks = [];
        this.groups = {};
        this.isGrouped = false;
        this.currentGraphData = graphData;
    }

    // Save the original graph structure
    saveOriginalGraph() {
        // Create deep copies to avoid reference issues
        this.originalNodes = JSON.parse(JSON.stringify(this.currentGraphData.nodes));
        this.originalLinks = JSON.parse(JSON.stringify(this.currentGraphData.links)).map(link => {
            // Ensure links have proper source and target as IDs, not objects
            return {
                ...link,
                source: typeof link.source === 'object' ? link.source.id : link.source,
                target: typeof link.target === 'object' ? link.target.id : link.target
            };
        });
    }

    // Get prefix for grouping
    getGroupPrefix(node) {
        const splitString = node.name.split("/");
        const nameStrings = splitString.slice(0, splitString.length-1);

        return nameStrings.join('/');
    }

    // Create groups based on node name prefixes
    createGroups() {
        this.groups = {};

        // Categorize nodes into groups
        this.originalNodes.forEach(node => {
            const prefix = this.getGroupPrefix(node);
            if (!this.groups[prefix]) {
                this.groups[prefix] = {
                    nodes: [],
                    externalConnections: []
                };
            }
            this.groups[prefix].nodes.push(node);
        });

        // Remove single-node groups
        Object.keys(this.groups).forEach(prefix => {
            if (this.groups[prefix].nodes.length < 2) {
                delete this.groups[prefix];
            }
        });

        // Identify external connections for each group
        this.originalLinks.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            const sourceNode = this.originalNodes.find(n => n.id === sourceId);
            const targetNode = this.originalNodes.find(n => n.id === targetId);

            if (!sourceNode || !targetNode) return;

            const sourcePrefix = this.getGroupPrefix(sourceNode);
            const targetPrefix = this.getGroupPrefix(targetNode);

            // If link connects different groups, record as external connection
            if (this.groups[sourcePrefix] && this.groups[targetPrefix] && sourcePrefix !== targetPrefix) {
                this.groups[sourcePrefix].externalConnections.push({
                    groupNodeId: sourceId,
                    externalNodeId: targetId,
                    externalNodePrefix: targetPrefix,
                    originalLink: {...link}
                });

                this.groups[targetPrefix].externalConnections.push({
                    groupNodeId: targetId,
                    externalNodeId: sourceId,
                    externalNodePrefix: sourcePrefix,
                    originalLink: {...link}
                });
            }
            // If link connects a group node to a non-group node
            else if (this.groups[sourcePrefix] && !this.groups[targetPrefix]) {
                this.groups[sourcePrefix].externalConnections.push({
                    groupNodeId: sourceId,
                    externalNodeId: targetId,
                    externalNodePrefix: null,
                    originalLink: {...link}
                });
            }
            else if (!this.groups[sourcePrefix] && this.groups[targetPrefix]) {
                this.groups[targetPrefix].externalConnections.push({
                    groupNodeId: targetId,
                    externalNodeId: sourceId,
                    externalNodePrefix: null,
                    originalLink: {...link}
                });
            }
        });
    }

    // Apply grouping to the graph
    applyGrouping() {
        if (this.isGrouped) return this.currentGraphData;

        // Save original state if not already saved
        if (this.originalNodes.length === 0) {
            this.saveOriginalGraph();
        }

        this.createGroups();

        // Create new grouped nodes and links
        const newNodes = [];
        const newLinks = [];

        // Add nodes that aren't part of any group
        this.originalNodes.forEach(node => {
            const prefix = this.getGroupPrefix(node);
            if (!this.groups[prefix]) {
                newNodes.push({...node});
            }
        });

        // Create group nodes
        Object.keys(this.groups).forEach(prefix => {
            const group = this.groups[prefix];

            // Create a group node
            const groupNode = {
                id: `group_${prefix}`,
                name: `${prefix}... (${group.nodes.length})`,
                type: "group",
                isGroup: true,
                expandedState: false,
                prefix: prefix,
                members: group.nodes.map(n => n.id)
            };
            newNodes.push(groupNode);
        });

        // Add internal links for ungrouped nodes
        this.originalLinks.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            const sourceNode = this.originalNodes.find(n => n.id === sourceId);
            const targetNode = this.originalNodes.find(n => n.id === targetId);

            if (!sourceNode || !targetNode) return;

            const sourcePrefix = this.getGroupPrefix(sourceNode);
            const targetPrefix = this.getGroupPrefix(targetNode);

            // If both nodes are not in any group, keep the link
            if (!this.groups[sourcePrefix] && !this.groups[targetPrefix]) {
                newLinks.push({
                    source: sourceId,
                    target: targetId,
                    isGroupLink: false
                });
            }
        });

        // Create external connections between groups and non-groups
        Object.keys(this.groups).forEach(prefix => {
            const group = this.groups[prefix];
            const processedConnections = new Set();

            group.externalConnections.forEach(conn => {
                // Preserve original direction of the link
                const sourcePrefix = this.getGroupPrefix(this.originalNodes.find(n => n.id === conn.groupNodeId));
                const targetPrefix = conn.externalNodePrefix;

                // Create a unique key for this connection
                const originalSource = typeof conn.originalLink.source === 'object' ?
                    conn.originalLink.source.id : conn.originalLink.source;
                const originalTarget = typeof conn.originalLink.target === 'object' ?
                    conn.originalLink.target.id : conn.originalLink.target;
                const connectionKey = `${originalSource}-${originalTarget}`;

                // Skip if we've already processed this connection
                if (processedConnections.has(connectionKey)) return;
                processedConnections.add(connectionKey);

                // Determine the actual source and target IDs
                let realSourceId, realTargetId;

                if (originalSource === conn.groupNodeId) {
                    // This node is the source in the original link
                    realSourceId = `group_${sourcePrefix}`;
                    realTargetId = targetPrefix ? `group_${targetPrefix}` : conn.externalNodeId;
                } else {
                    // This node is the target in the original link
                    realSourceId = targetPrefix ? `group_${targetPrefix}` : conn.externalNodeId;
                    realTargetId = `group_${sourcePrefix}`;
                }

                // Only create the link if both ends exist in the new nodes list
                const sourceExists = newNodes.some(n => n.id === realSourceId);
                const targetExists = newNodes.some(n => n.id === realTargetId);

                if (sourceExists && targetExists) {
                    // Create the link with the correct direction
                    newLinks.push({
                        source: realSourceId,
                        target: realTargetId,
                        isGroupLink: true,
                        originalLink: conn.originalLink
                    });
                }
            });
        });

        // Update the current graph data
        this.currentGraphData = {
            nodes: newNodes,
            links: newLinks
        };

        this.isGrouped = true;
        return this.currentGraphData;
    }

    // Toggle expansion/collapse of a group
    toggleGroup(groupId) {
        const groupNode = this.currentGraphData.nodes.find(n => n.id === groupId);
        if (!groupNode || !groupNode.isGroup) return this.currentGraphData;

        const prefix = groupNode.prefix;
        const group = this.groups[prefix];

        if (groupNode.expandedState) {
            // Collapse the group
            return this.collapseGroup(groupNode, group);
        } else {
            // Expand the group
            return this.expandGroup(groupNode, group);
        }
    }

    // Expand a collapsed group
    expandGroup(groupNode, group) {
        // Add individual nodes from this group
        const newNodes = [...this.currentGraphData.nodes];
        const expandedNodes = group.nodes.map(node => ({...node}));

        // Remove the group node
        const groupIndex = newNodes.findIndex(n => n.id === groupNode.id);
        if (groupIndex !== -1) {
            newNodes.splice(groupIndex, 1);
        }

        // Add the expanded individual nodes
        newNodes.push(...expandedNodes);

        // Handle links
        const newLinks = [...this.currentGraphData.links];

        // Remove links connected to the group node
        const linksToRemove = newLinks.filter(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            return source === groupNode.id || target === groupNode.id;
        });

        for (const linkToRemove of linksToRemove) {
            const index = newLinks.indexOf(linkToRemove);
            if (index !== -1) {
                newLinks.splice(index, 1);
            }
        }

        // Add internal links within the group
        this.originalLinks.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            const sourceNode = this.originalNodes.find(n => n.id === sourceId);
            const targetNode = this.originalNodes.find(n => n.id === targetId);

            if (!sourceNode || !targetNode) return;

            const sourcePrefix = this.getGroupPrefix(sourceNode);
            const targetPrefix = this.getGroupPrefix(targetNode);

            // If both nodes are in this group, add the internal link
            if (sourcePrefix === targetPrefix && sourcePrefix === groupNode.prefix) {
                newLinks.push({
                    source: sourceId,
                    target: targetId,
                    isGroupLink: false
                });
            }

            // If one node is in this group and the other is visible, add the link
            else if (sourcePrefix === groupNode.prefix || targetPrefix === groupNode.prefix) {
                const otherNodeId = sourcePrefix === groupNode.prefix ? targetId : sourceId;
                const otherNodeInGraph = newNodes.some(n => n.id === otherNodeId);

                if (otherNodeInGraph) {
                    newLinks.push({
                        source: sourceId,
                        target: targetId,
                        isGroupLink: false
                    });
                }
            }
        });

        // Mark group as expanded (for future reference)
        groupNode.expandedState = true;

        // Update the current graph data
        this.currentGraphData = {
            nodes: newNodes,
            links: newLinks
        };

        return this.currentGraphData;
    }

    // Collapse an expanded group
    collapseGroup(groupNode, group) {
        // We'll rebuild the current graph with this group collapsed
        let tempGrouped = this.isGrouped;
        this.isGrouped = false; // Temporarily set isGrouped to false to force reapply
        const result = this.applyGrouping();
        this.isGrouped = tempGrouped;
        return result;
    }

    // Revert to the original ungrouped graph
    revertToOriginal() {
        if (!this.isGrouped) return this.currentGraphData;

        // Create new objects to ensure proper simulation
        const newNodes = this.originalNodes.map(node => ({...node}));
        const newLinks = this.originalLinks.map(link => ({
            source: typeof link.source === 'object' ? link.source.id : link.source,
            target: typeof link.target === 'object' ? link.target.id : link.target,
            isGroupLink: false
        }));

        this.currentGraphData = {
            nodes: newNodes,
            links: newLinks
        };

        this.isGrouped = false;
        return this.currentGraphData;
    }
}

class ForceGraph {
    constructor(svgSelector, nodeGroupManager) {
        this.svg = d3.select(svgSelector);
        this.nodeGroupManager = nodeGroupManager;
        this.windowWidth = window.innerWidth;
        this.windowHeight = window.innerHeight;

        this.initializeSVG();
        this.setupZoom();
        this.createArrowMarker();

        this.graphContainer = this.svg.append("g");
    }

    initializeSVG() {
        this.svg
            .attr("viewBox", `0 0 ${this.windowWidth} ${this.windowHeight}`)
            .attr("width", this.windowWidth)
            .attr("height", this.windowHeight);
    }

    setupZoom() {
        this.zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                this.graphContainer.attr("transform", event.transform);
            });

        this.svg.call(this.zoom);
    }

    createArrowMarker() {
        this.svg.append("defs").append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", CONFIG.initialSettings.linkLength/2 + 20)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M 0,-5 L 10,0 L 0,5")
            .attr("fill", "black");
    }

    set_initial_positions(graphData) {
        const centerX = this.windowWidth / 2;
        const centerY = this.windowHeight / 2;

        graphData.nodes.forEach(node => {
            node.x = centerX + (Math.random() - 0.5) * 200;
            node.y = centerY + (Math.random() - 0.5) * 200;
            node.fx = node.x;
            node.fy = node.y;
        });

        // Defer unfixing to next event loop to ensure initial positioning
        requestAnimationFrame(() => {
            graphData.nodes.forEach(node => {
                node.fx = null;
                node.fy = null;
            });
        });
    }

    render(graphData) {
        // Store the current data reference
        this.currentGraphData = graphData;

        this.nodeGroupManager.currentGraphData = graphData;

        const links = graphData.links;
        const nodes = graphData.nodes;

        this.links = this.graphContainer.selectAll(".link")
            .data(links)
            .join("line")
            .attr("class", "link")
            .attr("stroke", d => d.isGroupLink ? "#ff6600" : "#999")  // Highlight group links
            .attr("stroke-width", d => d.isGroupLink ? 3 : 2)         // Make group links thicker
            .attr("stroke-dasharray", d => d.isGroupLink ? "5,5" : null) // Dashed line for group links
            .attr("marker-end", "url(#arrow)");

        const nodesSelection = this.graphContainer.selectAll(".node")
            .data(nodes, d => d.id);

        // Remove old nodes
        nodesSelection.exit().remove();

        // Create new nodes
        const enterNodes = nodesSelection.enter()
            .append("circle")
            .attr("class", "node")
            .attr("r", d => nodeRadiusScale(d.type))
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("fill", d => nodeTypeColorScale(d.type))
            .on("click", (event, d) => {
                if (d.isGroup) {
                    const updatedGraphData = this.nodeGroupManager.toggleGroup(d.id);
                    this.render(updatedGraphData);
                    this.startSimulation(updatedGraphData);
                }
            });

        // Update all nodes
        this.nodes = enterNodes.merge(nodesSelection);

        const labelsSelection = this.graphContainer.selectAll(".node-label")
            .data(nodes, d => d.id);

        // Remove old labels
        labelsSelection.exit().remove();

        // Create new labels
        const enterLabels = labelsSelection.enter()
            .append("text")
            .attr("class", "node-label")
            .attr("text-anchor", "middle")
            .text(d => d.name);

        // Update all labels
        this.labels = enterLabels.merge(labelsSelection);
    }

    startSimulation(graphData) {
        const { linkLength, linkForce, repelForce, centerForce } = CONFIG.initialSettings;

        // Stop any existing simulation
        if (this.simulation) this.simulation.stop();

        // Create simulation
        this.simulation = d3.forceSimulation(graphData.nodes)
            .force("connectionLinks",
                d3.forceLink(graphData.links)
                    .id(d => d.id)
                    .distance(linkLength)
                    .strength(linkForce)
            )
            .force("nodeRepulsion",
                d3.forceManyBody().strength(repelForce)
            )
            .force("graphCenter",
                d3.forceCenter(
                    this.windowWidth / 2,
                    this.windowHeight / 2
                ).strength(centerForce)
            );

        const updatePositions = () => {
            this.links
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            this.nodes
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            this.labels
                .attr("x", d => d.x)
                .attr("y", d => d.y - 15);
        };

        this.simulation.on("tick", updatePositions);
        this.nodes.call(this.drag());
    }

    drag() {
        const dragstarted = (event, d) => {
            if (!event.active) this.simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        };

        const dragged = (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
        };

        const dragended = (event, d) => {
            if (!event.active) this.simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        };

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    resetZoom() {
        this.svg.transition()
            .duration(500)
            .call(this.zoom.transform, d3.zoomIdentity);
    }

    toggleGrouping() {
        let updatedGraphData;
        if (this.nodeGroupManager.isGrouped) {
            updatedGraphData = this.nodeGroupManager.revertToOriginal();
        } else {
            updatedGraphData = this.nodeGroupManager.applyGrouping();
        }

        // Set initial positions for new nodes to ensure proper animation
        this.set_initial_positions(updatedGraphData);

        this.render(updatedGraphData);
        this.startSimulation(updatedGraphData);

        return this.nodeGroupManager.isGrouped;
    }
}

// Centralized event management
class GraphEventManager {
    constructor(graph, graphData) {
        this.graph = graph;
        this.graphData = graphData;
        this.sliderMapping = {
            'linkForceSlider': this.updateLinkForce.bind(this),
            'repelForceSlider': this.updateRepelForce.bind(this),
            'centerForceSlider': this.updateCenterForce.bind(this),
            'linkLengthSlider': this.updateLinkLength.bind(this)
        };
    }

    updateLinkForce(value) {
        CONFIG.initialSettings.linkForce = +value;
        this.graph.startSimulation(this.graph.currentGraphData);
    }

    updateRepelForce(value) {
        CONFIG.initialSettings.repelForce = -value;
        this.graph.startSimulation(this.graph.currentGraphData);
    }

    updateCenterForce(value) {
        CONFIG.initialSettings.centerForce = +value;
        this.graph.startSimulation(this.graph.currentGraphData);
    }

    updateLinkLength(value) {
        CONFIG.initialSettings.linkLength = +value;
        this.graph.svg.select("#arrow")
            .attr("refX", CONFIG.initialSettings.linkLength/2 + 20);
        this.graph.startSimulation(this.graph.currentGraphData);
    }

    toggleGrouping() {
        const isGrouped = this.graph.toggleGrouping();
        const groupToggleButton = document.getElementById('toggleGroupingButton');
        groupToggleButton.textContent = isGrouped ? 'Ungroup Nodes' : 'Group Nodes';
    }

    attachEventListeners() {
        Object.entries(this.sliderMapping).forEach(([sliderId, handler]) => {
            const slider = document.getElementById(sliderId);
            if (slider) {
                slider.addEventListener('input', () => handler(slider.value));
            }
        });

        const resetZoomButton = document.getElementById('resetZoomButton');
        if (resetZoomButton) {
            resetZoomButton.addEventListener('click', () => this.graph.resetZoom());
        }

        // Create and add toggle grouping button
        const groupToggleButton = document.getElementById('toggleGroupingButton');
        groupToggleButton.addEventListener('click', () => this.toggleGrouping());
    }
}

// Initialization
document.addEventListener("DOMContentLoaded", function() {
    const graph = new ForceGraph("svg", new NodeGroupManager(graphData));
    graph.set_initial_positions(graphData);
    graph.render(graphData);
    graph.startSimulation(graphData);
    const eventManager = new GraphEventManager(graph, graphData);
    eventManager.attachEventListeners();
});