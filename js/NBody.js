define(["Q", "glMatrix"], function(Q, glMatrix) {
	var elementsPerPoint = 2;

	/**
	 * Create a new N-body graph and return a promise for the graph object
	 *
	 * @param simulator - the module of the simulator backend to use
	 * @param renderer - the module of the rendering backend to use
	 * @param canvas - the canvas DOM element to draw the graph in
	 * @param [dimensions=\[1,1\]] - a two element array [width,height] used for internal posituin calculations.
	 */
	function create(simulator, renderer, canvas, dimensions) {
		dimensions = dimensions || [1,1];

		return renderer.create(canvas, dimensions)
		.then(function(rend) {
			return simulator.create(rend, dimensions).then(function(sim) {
				var graph = {
					"renderer": rend,
					"simulator": sim
				};
				graph.setPoints = setPoints.bind(this, graph);
				graph.setEdges = setEdges.bind(this, graph);
				graph.setPhysics = setPhysics.bind(this, graph);
				graph.tick = tick.bind(this, graph);
				graph.stepNumber = 0;
				graph.dimensions = dimensions;
				graph.events = {
					"simulateBegin": function() { },
					"simulateEnd": function() { },
					"renderBegin": function() { },
					"renderEnd": function() { },
					"tickBegin": function() { },
					"tickEnd": function() { }
				};
				// This attribute indicates if a call to tick() will be the first time it is called
				// (useful because our first tick() should render the graph in its inital state,
				// and so not run the simulator.)
				graph.firstTick = true;

				return graph;
			});
		});
	}


	function setPoints(graph, points) {
		// FIXME: If there is already data loaded, we should to free it before loading new data
		if(!(points instanceof Float32Array)) {
			points = _toFloatArray(points);
		}

		graph.firstTick = true;
		return graph.simulator.setData(points);
	}


	function setEdges(graph, edges) {
		return Q.fcall(function() {
			return graph;
		});
	}
	
	function setPhysics(graph, opts) {
	    graph.simulator.setPhysics(opts);
	}


	// Turns an array of vec3's into a Float32Array with elementsPerPoint values for each element in
	// the input array.
	function _toFloatArray(array) {
		var floats = new Float32Array(array.length * elementsPerPoint);

		for(var i = 0; i < array.length; i++) {
			var ii = i * elementsPerPoint;
			floats[ii + 0] = array[i][0];
			floats[ii + 1] = array[i][1];
		}

		return floats;
	}


	function tick(graph) {
		graph.events.tickBegin();

		if(graph.firstTick) {
			graph.firstTick = false;
			graph.events.renderBegin();

			return graph.renderer.render()
			.then(function() {
				graph.events.renderEnd();
				graph.events.tickEnd();

				return graph;
			});
		} else {
			graph.events.simulateBegin();

			return graph.simulator.tick(graph.stepNumber++)
			.then(function() {
				graph.events.simulateEnd();
				graph.events.renderBegin();

				return graph.renderer.render();
			})
			.then(function() {
				graph.events.renderEnd();
				graph.events.tickEnd();

				return graph;
			});
		}
	}


	return {
		"elementsPerPoint": elementsPerPoint,
		"create": create,
		"setPoints": setPoints,
		"setEdges": setEdges,
		"tick": tick
	};
});
