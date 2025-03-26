// windowsize
const windowWidth = window.innerWidth
const windowHeight = window.innerHeight

// Initial node settings
const nodeRadius = 10

// Initial link settings
let linkLength = 100

// Initial force settings
let linkForce = 0.5
let repelForce = -1500
let centerForce = 0.02

// Define a color mapping based on node_type
const colorScale = d3.scaleOrdinal()
    .domain(["root", "local", "third_party"])
    .range(["red", "green", "blue"]);

const typeNodeRadius = d3.scaleOrdinal()
    .domain(["root", "local", "third_party"])
    .range([12, 10, 8]);

// Adjust the viewBox
const svg = d3.select("svg")
    .attr("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`)
    .attr("width", window.innerWidth)
    .attr("height", window.innerHeight);

// Create a container group for the entire graph that can be zoomed/panned
const graphContainer = svg.append("g");

// Add Arrowhead marker definition to svg
svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10") // Defines the arrow shape
    .attr("refX", linkLength/2 + 2*nodeRadius)  // Position of arrow relative to node
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0,-5 L 10,0 L 0,5") // Triangle shape
    .attr("fill", "black");  // Arrow color

// Add zoom functionality
const zoom = d3.zoom()
    .scaleExtent([0.1, 10])  // Limit zoom levels
    .on("zoom", (event) => {
        // Apply zoom transformation to the graph container
        graphContainer.attr("transform", event.transform);
    });

// Apply zoom to the entire SVG
svg.call(zoom);

// Global simulation variable
let simulation;

// Simulate graph function
function simulateGraph(nodes, links) {
    // Stop any existing simulation
    if (simulation) simulation.stop();

    // Clear existing graph elements
    graphContainer.selectAll("*").remove();

    // Restart the simulation with current parameters
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(linkLength).strength(linkForce))
        .force("repel_each_other", d3.forceManyBody().strength(repelForce))
        .force("center", d3.forceCenter(windowWidth / 2, windowHeight / 2).strength(centerForce));

    // Create links that have arrowheads
    const link = graphContainer.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#arrow)");

    // Create nodes
    const node = graphContainer.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", d => typeNodeRadius(d.type))
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", d => colorScale(d.type));

    // Create labels for the nodes with their name attribute
    const labels = graphContainer.selectAll("text")
        .data(nodes)
        .enter().append("text")
        .text(d => d.name) // Display the 'name' attribute
        .attr("text-anchor", "middle")
        .attr("class", "node-label")

    // Add drag functionality
    graphContainer.selectAll("circle").call(drag(simulation))

    // start simulation
    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("cx", d => d.x)
            .attr("cy", d => d.y)

        labels.attr("x", d => d.x)
              .attr("y", d => d.y - 15);
    });

    return simulation;
}

// Dragging functionality
function drag(simulation) {
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }
    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}

// Render the graph when the page loads
document.addEventListener("DOMContentLoaded", function() {
    // Set up slider event listeners
    document.getElementById('linkForceSlider').addEventListener('input', function() {
        linkForce = +this.value;
        simulateGraph(graphData.nodes, graphData.links);
    });

    document.getElementById('repelForceSlider').addEventListener('input', function() {
        repelForce = -this.value;
        simulateGraph(graphData.nodes, graphData.links);
    });

    document.getElementById('centerForceSlider').addEventListener('input', function() {
        centerForce = +this.value;
        simulateGraph(graphData.nodes, graphData.links);
    });

    document.getElementById('linkLengthSlider').addEventListener('input', function() {
        linkLength = +this.value;
        simulateGraph(graphData.nodes, graphData.links);
    });
    // Add reset zoom button functionality
    document.getElementById('resetZoomButton').addEventListener('click', function() {
        // Reset zoom to initial state
        svg.transition()
            .duration(500)
            .call(zoom.transform, d3.zoomIdentity);
    });
    // Initially fix all nodes at the center for a smooth startup
    graphData.nodes.forEach(d => {
        d.x = windowWidth / 2 + Math.random() * 100;
        d.y = windowHeight / 2 + Math.random() * 100;
        d.fx = d.x;
        d.fy = d.y;
    });
    // Unfix the nodes after initial fix around the center
    graphData.nodes.forEach(d => {
        d.fx = null;
        d.fy = null;
    });
    // Call the simulation
    simulateGraph(graphData.nodes, graphData.links);
});