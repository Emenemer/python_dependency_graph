// Configuration and constants
const CONFIG = {
    nodeTypes: {
        types: ["root", "local", "third_party"],
        colors: ["red", "green", "blue"],
        radii: [12, 10, 8]
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

class ForceGraph {
    constructor(svgSelector) {
        this.svg = d3.select(svgSelector);
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
        const links = graphData.links
        const nodes = graphData.nodes

        this.links = this.graphContainer.selectAll(".link")
            .data(links)
            .join("line")
            .attr("class", "link")
            .attr("stroke", "#999")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrow)");

        this.nodes = this.graphContainer.selectAll(".node")
            .data(nodes)
            .join("circle")
            .attr("class", "node")
            .attr("r", d => nodeRadiusScale(d.type))
            .attr("stroke", "black")
            .attr("stroke-width", 1)
            .attr("fill", d => nodeTypeColorScale(d.type));

        this.labels = this.graphContainer.selectAll(".node-label")
            .data(nodes)
            .join("text")
            .attr("class", "node-label")
            .text(d => d.name)
            .attr("text-anchor", "middle");
    }

    startSimulation(graphData) {
        const { linkLength, linkForce, repelForce, centerForce } = CONFIG.initialSettings;

        // Stop any existing simulation
        this.simulation?.stop();

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
        this.graph.startSimulation(this.graphData);
    }

    updateRepelForce(value) {
        CONFIG.initialSettings.repelForce = -value;
        this.graph.startSimulation(this.graphData);
    }

    updateCenterForce(value) {
        CONFIG.initialSettings.centerForce = +value;
        this.graph.startSimulation(this.graphData);
    }

    updateLinkLength(value) {
        CONFIG.initialSettings.linkLength = +value;
        this.graph.svg.select("#arrow")
            .attr("refX", CONFIG.initialSettings.linkLength/2 + 20);
        this.graph.startSimulation(this.graphData);
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
    }
}

// Initialization
document.addEventListener("DOMContentLoaded", function() {
    const graph = new ForceGraph("svg");
    graph.set_initial_positions(graphData);
    graph.render(graphData);
    graph.startSimulation(graphData);
    const eventManager = new GraphEventManager(graph, graphData);
    eventManager.attachEventListeners();
});