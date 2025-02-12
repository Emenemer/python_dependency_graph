// -- constants --
// windowsize
const window_width = window.innerWidth
const window_height = window.innerHeight
// text related
const node_name_fontsize = "20px"
// node settings
const node_radius = 10
// link settings
const link_length = 100
// force settings
const link_force = 0.8
const repel_force = -1000
const center_force = 0.02

// Define a color mapping based on node_type
const colorScale = d3.scaleOrdinal()
    .domain(["root", "local", "third_party"])
    .range(["red", "green", "blue"]);

const typeNodeRadius = d3.scaleOrdinal()
    .domain(["root", "local", "third_party"])
    .range([12, 10, 8]);


function simulateGraph(nodes, links) {
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(link_length).strength(link_force))
        .force("repel_each_other", d3.forceManyBody().strength(repel_force))
        .force("center", d3.forceCenter(window_width / 2, window_height / 2).strength(center_force));

    // Create Links with Arrowheads
    const link = svg.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 2)
        .attr("marker-end", "url(#arrow)");

    // Create nodes
    const node = svg.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", d => typeNodeRadius(d.type))
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", d => colorScale(d.type))
        .call(drag(simulation));

    // Create labels for the nodes with their name attribute
    const labels = svg.selectAll("text")
        .data(nodes)
        .enter().append("text")
        .text(d => d.name) // Display the 'name' attribute
        .attr("text-anchor", "middle")
        .style("font-size", node_name_fontsize)
        .style("fill", "black")
        .style("font-family", "Trebuchet MS")
        .style("user-select", "none") // Remove any interaction with the text elements
        .style("pointer-events", "none");

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

}

// Dragging functionality
function drag(simulation) {
    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.5).restart();
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

// Adjust the viewBox. The 0.99 multiplier circumvents a scrollbar from appearing
const svg = d3.select("svg")
    .attr("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight*0.99}`)

// Add Arrowhead Marker Definition**
svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10") // Defines the arrow shape
    .attr("refX", link_length/2 + node_radius)  // Position of arrow relative to node
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M 0,-5 L 10,0 L 0,5") // Triangle shape
    .attr("fill", "black");  // Arrow color

// Render the graph when the page loads
document.addEventListener("DOMContentLoaded", function() {
    // Initially fix all nodes at the center for a smooth startup
    graphData.nodes.forEach(d => {
        d.x = window_width / 2 + Math.random() * 100;
        d.y = window_height / 2 + Math.random() * 100;
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
