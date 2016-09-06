import React, { PropTypes } from 'react';
import { Subject, Observable, ReplaySubject } from 'rxjs';
import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

import VizSlice from 'viz-client/streamGL/graphVizApp/VizSlice';
import { init as initRenderer } from 'viz-client/streamGL/renderer';
import { RenderingScheduler } from 'viz-client/streamGL/graphVizApp/canvas';

function assignCanvasRefToRenderer(renderer) {
    return function(canvas) {
        renderer.canvasElement = canvas;
    }
}

class Renderer extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.autoCenter = false;
        this.autoSimulateCount = 0;
        this.autoSimulateTotal = 10;
        this.assignCanvasRef = assignCanvasRefToRenderer(this);
    }
    shouldComponentUpdate(nextProps) {

        const { camera: nextCamera,
                canvas: nextCanvas,
                simulating: nextSimulating,
                canvas: { hints: nextHints }} = nextProps;
        const { camera: currCamera,
                canvas: currCanvas,
                simulating: currSimulating,
                canvas: { hints: currHints }} = this.props;

        if (currSimulating !== nextSimulating) {
            return true;
        }

        if (!shallowEqual(currHints, nextHints)) {
            return true;
        }

        const { edges: nextEdges, points: nextPoints } = nextCamera;
        const { edges: currEdges, points: currPoints } = currCamera;

        if (!shallowEqual(currEdges, nextEdges)) {
            return true;
        }

        if (!shallowEqual(currPoints, nextPoints)) {
            return true;
        }

        if (!shallowEqual(currCamera, nextCamera)) {
            return true;
        }

        return !shallowEqual(currCanvas, nextCanvas);
    }
    updateDirtyScene(cameraDirty = false, layoutDirty = false) {

        const { camera, simulating } = this.props;
        const { layoutScene, layoutCamera } = this.props;

        if (cameraDirty) {

            const { center } = camera;
            const { renderState } = this;
            const cameraInstance = renderState.camera;

            layoutCamera({
                cameraInstance,
                points: this.curPoints,
                center:(this.autoCenter =
                        this.autoSimulateCount++ < this.autoSimulateTotal) || (
                        center.x === 0.5 && center.y === 0.5),
                camera: {
                    ...camera,
                    width: cameraInstance.width,
                    height: cameraInstance.height
                },
            });
        }

        if (layoutDirty && false) {
            if (this.autoCenter) {
                layoutScene({
                    simulating:
                    this.autoCenter = simulating &&
                    this.autoSimulateCount++ < this.autoSimulateTotal
                });
            } else {
                layoutScene({ simulating });
            }
        }
    }
    componentWillUpdate(nextProps) {

        const { simulateOn } = this;
        const { renderState, renderingScheduler } = this;
        const { simulating: nextSimulating, canvas: { hints: nextHints } } = nextProps;
        const { simulating: currSimulating, canvas: { hints: currHints } } = this.props;

        if (nextSimulating !== currSimulating) {
            simulateOn.next(nextSimulating);
        }

        if (!shallowEqual(currHints, nextHints)) {
            renderingScheduler.attemptToAllocateBuffersOnHints(
                nextProps.canvas, renderState, nextHints
            );
        }
    }
    componentDidUpdate(prevProps) {

        const { camera: prevCamera } = prevProps;
        const { camera: currCamera, simulating } = this.props;

        this.updateDirtyScene(
            this.autoCenter,// || !shallowEqual(prevCamera, currCamera),
            simulating
        );
    }
    componentDidMount() {

        const { props, canvasElement } = this;
        const { camera, canvas, socket, simulating,
                play = 10, handleVboUpdates, ...restProps } = props;

        const { hints } = canvas;
        const uri = { href: '/graph/', pathname: '' };

        const simulateOn = new ReplaySubject(1);
        const isAnimating = new ReplaySubject(1);
        const hitmapUpdates = new ReplaySubject(1);
        const activeSelection = new ReplaySubject(1);

        isAnimating.next(false);
        simulateOn.next(simulating);
        activeSelection.next(new VizSlice([]));

        const renderState = initRenderer({ ...canvas, camera }, canvasElement, restProps);
        const { vboUpdates, vboVersions } = handleVboUpdates(socket, uri, renderState);

        const renderingScheduler = new RenderingScheduler(renderState, vboUpdates,
                                                          vboVersions, hitmapUpdates,
                                                          isAnimating, simulateOn,
                                                          activeSelection, hints);

        this.autoSimulateTotal = play;
        this.renderState = renderState;
        this.renderingScheduler = renderingScheduler;

        this.vboUpdates = vboUpdates;
        this.vboVersions = vboVersions;
        this.simulateOn = simulateOn;
        this.isAnimating = isAnimating;
        this.hitmapUpdates = hitmapUpdates;
        this.activeSelection = activeSelection;
        this.curPoints = renderState.hostBuffers.curPoints;

        vboUpdates
            .filter((update) => update === 'received')
            .take(1).subscribe(() => {
                this.updateDirtyScene(
                    this.autoCenter = this.props.simulating,
                    this.props.simulating
                );
            });
    }
    componentWillUnmount() {

        debugger

        const {
            curPoints,
            vboUpdates,
            vboVersions,
            simulateOn,
            isAnimating,
            hitmapUpdates,
            activeSelection,
        } = this;

        this.curPoints = null;
        this.vboUpdates = null;
        this.renderState = null;
        this.vboVersions = null;
        this.simulateOn = null;
        this.isAnimating = null;
        this.hitmapUpdates = null;
        this.activeSelection = null;
        this.renderingScheduler = null;

        curPoints && curPoints.unsubscribe();
        vboUpdates && vboUpdates.unsubscribe();
        vboVersions && vboVersions.unsubscribe();
        simulateOn && simulateOn.unsubscribe();
        isAnimating && isAnimating.unsubscribe();
        hitmapUpdates && hitmapUpdates.unsubscribe();
        activeSelection && activeSelection.unsubscribe();
    }
    render() {
        return (
            <canvas ref={this.assignCanvasRef} id='simulation' style={{
                width: `100%`,
                height:`100%`,
                top: 0, left: 0,
                right: 0, bottom: 0,
                position:`absolute` }}>
                WebGL not supported
            </canvas>
        );
    }
}

Renderer = compose(
    getContext({
        play: PropTypes.number,
        socket: PropTypes.object,
        pixelRatio: PropTypes.number,
        handleVboUpdates: PropTypes.func
    })
)(Renderer);

export { Renderer };