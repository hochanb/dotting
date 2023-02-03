import {
  addPoints,
  convertCartesianToScreen,
  diffPoints,
  directionPoints,
  distPoints,
  getScreenPoint,
  getWorldPoint,
  gradientPoints,
} from "./math";
import EventDispatcher from "./eventDispatcher";
import { Coord, PanZoom } from "./types";
import { addEvent, removeEvent, touchy, TouchyEvent } from "./touch";

export default class Canvas extends EventDispatcher {
  private MAX_SCALE = 1.2;

  private MIN_SCALE = 0.9;

  private ZOOM_SENSITIVITY = 300;

  private element: HTMLCanvasElement;

  private gridSquareLength: number = 20;

  private origin = { x: 0, y: 0 };

  private columnCount = 5;

  private rowCount = 5;

  private pinchZoomPrevDiff = 0;

  private data = new Map<
    // this number is rowIndex
    number,
    Map<
      // this number is columnIndex
      number,
      {
        color: string;
      }
    >
  >();

  private history: Array<{
    rowIndex: number;
    columnIndex: number;
    action: "color" | "erase";
  }> = [];

  private panZoom: PanZoom = {
    scale: 1,
    offset: this.origin,
  };

  private panPoint: { lastMousePos: Coord } = {
    lastMousePos: this.origin,
  };

  private width = 0;

  private height = 0;

  private dpr = 1;

  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    super();
    this.element = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.initialize();
  }

  drawRects() {}

  drawGrids() {
    const isColumnCountEven = this.columnCount % 2;
    const isRowCountEven = this.rowCount % 2;
    const leftTopPoint: Coord = {
      x: isColumnCountEven
        ? -((this.columnCount / 2) * this.gridSquareLength)
        : -(
            Math.floor(this.columnCount / 2) * this.gridSquareLength +
            this.gridSquareLength * 0.5
          ),
      y: isRowCountEven
        ? -((this.rowCount / 2) * this.gridSquareLength)
        : -(
            Math.floor(this.rowCount / 2) * this.gridSquareLength +
            this.gridSquareLength * 0.5
          ),
    };
    const ctx = this.ctx;
    const correctedPosition = getScreenPoint(leftTopPoint, this.panZoom);

    const leftTopScreenPoint = convertCartesianToScreen(
      this.element,
      correctedPosition,
      this.dpr
    );
    ctx.save();
    ctx.lineWidth = 1;
    // {
    //   ctx.beginPath();
    //   ctx.moveTo(leftTopScreenPoint.x, leftTopScreenPoint.y);
    //   ctx.lineTo(
    //     leftTopScreenPoint.x,
    //     leftTopScreenPoint.y + this.rowCount * this.gridSquareLength
    //   );
    //   ctx.stroke();
    //   ctx.closePath();
    // }
    // {
    //   ctx.beginPath();
    //   ctx.moveTo(leftTopScreenPoint.x, leftTopScreenPoint.y);
    //   ctx.lineTo(
    //     leftTopScreenPoint.x + this.columnCount * this.gridSquareLength,
    //     leftTopScreenPoint.y
    //   );
    //   ctx.stroke();
    //   ctx.closePath();
    // }
    for (let i = 0; i <= this.columnCount; i++) {
      ctx.beginPath();
      ctx.moveTo(
        leftTopScreenPoint.x + i * this.gridSquareLength,
        leftTopScreenPoint.y
      );
      ctx.lineTo(
        leftTopScreenPoint.x + i * this.gridSquareLength,
        leftTopScreenPoint.y + this.rowCount * this.gridSquareLength
      );
      ctx.stroke();
      ctx.closePath();
    }
    for (let j = 0; j <= this.rowCount; j++) {
      ctx.beginPath();
      ctx.moveTo(
        leftTopScreenPoint.x,
        leftTopScreenPoint.y + j * this.gridSquareLength
      );
      ctx.lineTo(
        leftTopScreenPoint.x + this.columnCount * this.gridSquareLength,
        leftTopScreenPoint.y + j * this.gridSquareLength
      );
      ctx.stroke();
      ctx.closePath();
    }
    ctx.restore();
  }

  getData() {
    return this.data;
  }

  reset() {
    this.scale(1, 1);
    this.panZoom = {
      scale: 1,
      offset: this.origin,
    };
    this.clear();
  }

  getContext() {
    return this.ctx;
  }

  getPanZoom() {
    return this.panZoom;
  }

  getCanvasElement() {
    return this.element;
  }

  getDpr() {
    return this.dpr;
  }

  initialize() {
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);

    // add event listeners
    touchy(this.element, addEvent, "mousedown", this.onMouseDown);
    touchy(this.element, addEvent, "mouseup", this.onMouseUp);
    touchy(this.element, addEvent, "mouseout", this.onMouseOut);
    touchy(this.element, addEvent, "mousemove", this.onMouseMove);
    this.element.addEventListener("wheel", this.handleWheel);
  }

  onMouseDown(evt: TouchyEvent) {
    evt.preventDefault();
    const point = this.getPointFromTouchyEvent(evt);
    const pointCoord = { x: point.offsetX, y: point.offsetY };
    this.panPoint.lastMousePos = { x: point.offsetX, y: point.offsetY };

    if (window.TouchEvent && evt instanceof TouchEvent) {
      const touchCount = evt.touches.length;
      if (touchCount >= 2) {
        const firstTouch = evt.touches[0];
        const secondTouch = evt.touches[1];
        const pinchZoomCurrentDiff =
          Math.abs(firstTouch.clientX - secondTouch.clientX) +
          Math.abs(firstTouch.clientY - secondTouch.clientY);
        this.pinchZoomPrevDiff = pinchZoomCurrentDiff;
      }
    }
    touchy(this.element, addEvent, "mousemove", this.handlePanning);
    touchy(this.element, addEvent, "mousemove", this.handlePinchZoom);
  }

  onMouseMove(evt: TouchyEvent) {
    evt.preventDefault();
    const point = this.getPointFromTouchyEvent(evt);
    const pointCoord = { x: point.offsetX, y: point.offsetY };
  }

  onMouseUp() {
    touchy(this.element, removeEvent, "mousemove", this.handlePanning);
    touchy(this.element, removeEvent, "mousemove", this.handlePinchZoom);
  }

  onMouseOut() {
    touchy(this.element, removeEvent, "mousemove", this.handlePanning);
    touchy(this.element, removeEvent, "mousemove", this.handlePinchZoom);
  }

  setPanZoom(param: Partial<PanZoom>) {
    this.emit("setIsPanZoomed");
    const { scale, offset } = param;

    if (scale) {
      this.panZoom.scale = scale;
      this.gridSquareLength = this.gridSquareLength * scale;
    }
    if (offset) {
      this.panZoom.offset = offset;
    }

    this.render();
    //reset the offset
    // this.panZoom.offset = [0, 0];
  }

  async startResetPanZoom() {
    this.destroy();
    this.initialize();
  }

  handlePanning = (evt: TouchyEvent) => {
    const lastMousePos = this.panPoint.lastMousePos;
    if (window.TouchEvent && evt instanceof TouchEvent) {
      if (evt.touches.length > 1) {
        return;
      }
    }
    const point = this.getPointFromTouchyEvent(evt);

    const currentMousePos: Coord = { x: point.offsetX, y: point.offsetY };
    this.panPoint.lastMousePos = currentMousePos;
    const mouseDiff = diffPoints(lastMousePos, currentMousePos);
    const offset = diffPoints(this.panZoom.offset, mouseDiff);
    this.panZoom.offset = offset;
    this.setPanZoom({ offset });
    return;
  };

  returnScrollOffsetFromMouseOffset = (
    mouseOffset: Coord,
    panZoom: PanZoom,
    newScale: number
  ) => {
    const diffPointsOfMouseOffset = diffPoints(mouseOffset, {
      x: this.element.width / this.dpr / 2,
      y: this.element.height / this.dpr / 2,
    });
    const worldPos = getWorldPoint(
      {
        x: diffPointsOfMouseOffset.x,
        y: diffPointsOfMouseOffset.y,
      },
      this.panZoom
    );
    const newMousePos = getScreenPoint(worldPos, {
      scale: newScale,
      offset: addPoints(panZoom.offset, {
        x: this.element.width / this.dpr / 2,
        y: this.element.height / this.dpr / 2,
      }),
    });
    const scaleOffset = diffPoints(mouseOffset, newMousePos);
    const offset = addPoints(panZoom.offset, scaleOffset);
    return offset;
  };

  handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      const { deltaY } = e;
      const zoom = 1 - deltaY / this.ZOOM_SENSITIVITY;
      const newScale = this.panZoom.scale * zoom;

      if (newScale > this.MAX_SCALE || newScale < this.MIN_SCALE) {
        return;
      }
      console.log(newScale, "newScale");
      const mouseOffset = { x: e.offsetX, y: e.offsetY };
      const newOffset = this.returnScrollOffsetFromMouseOffset(
        { x: mouseOffset.x, y: mouseOffset.y },
        this.panZoom,
        newScale
      );

      this.setPanZoom({ scale: newScale, offset: newOffset });
    } else {
      const offset = diffPoints(this.panZoom.offset, {
        x: e.deltaX,
        y: e.deltaY,
      });
      this.setPanZoom({ offset });
    }
  };

  handlePinchZoom = (evt: TouchyEvent) => {
    if (window.TouchEvent && evt instanceof TouchEvent) {
      const touchCount = evt.touches.length;
      if (!(touchCount >= 2)) {
        return;
      }
      const firstTouch = evt.touches[0];
      const secondTouch = evt.touches[1];
      const pinchZoomCurrentDiff =
        Math.abs(firstTouch.clientX - secondTouch.clientX) +
        Math.abs(firstTouch.clientY - secondTouch.clientY);
      const firstTouchPoint = this.getPointFromTouch(firstTouch);
      const secondTouchPoint = this.getPointFromTouch(secondTouch);
      const touchCenterPos = {
        x: (firstTouchPoint.offsetX + secondTouchPoint.offsetX) / 2,
        y: (firstTouchPoint.offsetY + secondTouchPoint.offsetY) / 2,
      } as Coord;

      const deltaX = this.pinchZoomPrevDiff - pinchZoomCurrentDiff;
      const zoom = 1 - (deltaX * 2) / this.ZOOM_SENSITIVITY;
      const newScale = this.panZoom.scale * zoom;
      if (this.MIN_SCALE > newScale || newScale > this.MAX_SCALE) {
        return;
      }
      const newOffset = this.returnScrollOffsetFromMouseOffset(
        touchCenterPos,
        this.panZoom,
        newScale
      );
      this.setPanZoom({ scale: newScale, offset: newOffset });
      this.pinchZoomPrevDiff = pinchZoomCurrentDiff;
    }
  };

  getPointFromTouch(touch: Touch) {
    const r = this.element.getBoundingClientRect();
    const offsetX = touch.clientX - r.left;
    const offsetY = touch.clientY - r.top;
    return {
      offsetX: offsetX,
      offsetY: offsetY,
    };
  }

  getPointFromTouchyEvent(evt: TouchyEvent) {
    if (window.TouchEvent && evt instanceof TouchEvent) {
      return this.getPointFromTouch(evt.touches[0]);
      // }
    } else {
      // this is for PC
      // offsetX = evt.offsetX;
      // offsetY = evt.offsetY;
      // originY += window.scrollY;
      // originX += window.scrollX;
      return {
        //   y: originY - this.panZoom.offset.y,
        //   x: originX - this.panZoom.offset.x,
        offsetX: evt.offsetX,
        offsetY: evt.offsetY,
      };
    }
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  setWidth(width: number, devicePixelRatio?: number) {
    this.width = width;
    this.element.width = devicePixelRatio ? width * devicePixelRatio : width;
    this.element.style.width = `${width}px`;
  }

  setHeight(height: number, devicePixelRatio?: number) {
    this.height = height;
    this.element.height = devicePixelRatio ? height * devicePixelRatio : height;
    this.element.style.height = `${height}px`;
  }

  setSize(width: number, height: number, devicePixelRatio?: number) {
    this.setWidth(width, devicePixelRatio);
    this.setHeight(height, devicePixelRatio);
    this.dpr = devicePixelRatio ? devicePixelRatio : this.dpr;
  }

  scale(x: number, y: number) {
    this.ctx.scale(x, y);
  }

  renderGraph(userId: number) {
    this.reset();
  }

  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    const ctx = this.ctx;
    // if (width < 2 * radius) radius = width / 2;
    // if (height < 2 * radius) radius = height / 2;
    ctx.save();
    ctx.fillStyle = "#FF7C7C";
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  render() {
    this.clear();
    this.ctx.save();
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
    this.drawGrids();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  destroy() {
    touchy(this.element, removeEvent, "mouseup", this.onMouseUp);
    touchy(this.element, removeEvent, "mouseout", this.onMouseOut);
    touchy(this.element, removeEvent, "mousedown", this.onMouseDown);
    touchy(this.element, removeEvent, "mousemove", this.onMouseMove);
    touchy(this.element, removeEvent, "mousemove", this.handlePanning);
    touchy(this.element, removeEvent, "mousemove", this.handlePinchZoom);
    this.element.removeEventListener("wheel", this.handleWheel);
  }
}
