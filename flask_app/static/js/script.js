const width = window.innerWidth
const height = window.innerHeight

const svg = d3.select("svg")
    .attr("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`)  // Adjust the viewBox

function simulateGraph(nodes, links) {
    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(100).strength(0.8))
        .force("repel_each_other", d3.forceManyBody().strength(-1000))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(0.01));

    const link = svg.selectAll("line")
        .data(links)
        .enter().append("line")
        .attr("stroke", "#999")
        .attr("stroke-width", 2);

    // Define a color mapping based on node_type
    const colorScale = d3.scaleOrdinal()
        .domain(["root", "local", "third_party"])
        .range(["red", "green", "blue"]);

    const node = svg.selectAll("circle")
        .data(nodes)
        .enter().append("circle")
        .attr("r", 10)
        .attr("stroke", "black")
        .attr("stroke-width", 1)
        .attr("fill", d => colorScale(d.type))
        .call(drag(simulation));

    // Add labels (text) for each node
    const labels = svg.selectAll("text")
        .data(nodes)
        .enter().append("text")
        .text(d => d.name) // Display the 'name' attribute
        .attr("text-anchor", "middle") // Center the text
        .style("font-size", "12px")
        .style("fill", "black");

    // Unfix the nodes
    nodes.forEach(d => {
        d.fx = null;
        d.fy = null;
    });

    // start simulation
    simulation.on("tick", () => {
        link.attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node.attr("cx", d => d.x)
            .attr("cy", d => d.y);

        labels.attr("x", d => d.x)
              .attr("y", d => d.y - 15);
    });

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
    // Initially fix all nodes at the center
    graphData.nodes.forEach(d => {
        d.x = width / 2 + Math.random() * 100;
        d.y = height / 2 + Math.random() * 100;
        d.fx = d.x;
        d.fy = d.y;
    });
    // Call the simultion
    simulateGraph(graphData.nodes, graphData.links);
});
