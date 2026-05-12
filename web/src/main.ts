import {
  Board,
  BoardContactPhase,
  BoardContactType,
  type BoardContact,
} from "@harrishill/board-sdk";

type SurfaceContact = Pick<
  BoardContact,
  "contactId" | "x" | "y" | "orientation" | "type" | "phase" | "glyphId" | "isTouched"
>;

type Point = {
  x: number;
  y: number;
  pressure: number;
};

type Stroke = {
  id: number;
  color: string;
  width: number;
  points: Point[];
};

type StampConfig = {
  glyphId: number;
  label: string;
  src: string;
};

type Stamp = {
  id: number;
  glyphId: number;
  x: number;
  y: number;
  orientation: number;
  size: number;
};

type HistoryAction =
  | { type: "stroke"; stroke: Stroke }
  | { type: "stamp"; stamp: Stamp };

const stampConfigs: Readonly<Record<number, StampConfig>> = {
  1: {
    glyphId: 1,
    label: "Robot Orange",
    src: new URL("./stamps/Robot_Orange.png", import.meta.url).href,
  },
  2: {
    glyphId: 2,
    label: "Robot Pink",
    src: new URL("./stamps/Robot_Pink.png", import.meta.url).href,
  },
  3: {
    glyphId: 3,
    label: "Robot Purple",
    src: new URL("./stamps/Robot_Purple.png", import.meta.url).href,
  },
  4: {
    glyphId: 4,
    label: "Robot Yellow",
    src: new URL("./stamps/Robot_Yellow.png", import.meta.url).href,
  },
  5: {
    glyphId: 5,
    label: "Ship Orange",
    src: new URL("./stamps/Ship_Orange.png", import.meta.url).href,
  },
  6: {
    glyphId: 6,
    label: "Ship Pink",
    src: new URL("./stamps/Ship_Pink.png", import.meta.url).href,
  },
  7: {
    glyphId: 7,
    label: "Ship Purple",
    src: new URL("./stamps/Ship_Purple.png", import.meta.url).href,
  },
  8: {
    glyphId: 8,
    label: "Ship Yellow",
    src: new URL("./stamps/Ship_Yellow.png", import.meta.url).href,
  },
};

const stampSize = 92;
const minPressure = 0.35;

const surface = getElement<HTMLElement>("surface");
const stampCanvas = getElement<HTMLCanvasElement>("stamp-layer");
const inkCanvas = getElement<HTMLCanvasElement>("ink-layer");
const previewCanvas = getElement<HTMLCanvasElement>("preview-layer");
const statusEl = getElement<HTMLElement>("device-status");
const metricsEl = getElement<HTMLElement>("metrics");
const stampStripEl = getElement<HTMLElement>("stamp-strip");
const sizeInput = getElement<HTMLInputElement>("brush-size");
const sizeValueEl = getElement<HTMLOutputElement>("size-value");
const undoBtn = getElement<HTMLButtonElement>("undo-btn");
const clearInkBtn = getElement<HTMLButtonElement>("clear-ink-btn");
const clearStampsBtn = getElement<HTMLButtonElement>("clear-stamps-btn");

const stampCtx = canvasContext(stampCanvas);
const inkCtx = canvasContext(inkCanvas);
const previewCtx = canvasContext(previewCanvas);
const stampImages = preloadStampImages(stampConfigs);
const liveGlyphs = new Map<number, SurfaceContact>();
const stampedContactIds = new Set<number>();
const strokes: Stroke[] = [];
const stamps: Stamp[] = [];
const history: HistoryAction[] = [];

let brushColor = "#111827";
let brushSize = Number(sizeInput.value);
let activeStroke: Stroke | null = null;
let activePointerId: number | null = null;
let activeTouchId: number | null = null;
let pointerInputUntil = 0;
let lastInputLabel = "waiting";
let nextStrokeId = 1;
let nextStampId = 1;

renderStatus();
renderStampStrip();
resizeCanvases();
wireControls();
wireStylusDrawing();
wireBoardInput();
window.addEventListener("resize", resizeCanvases);

function renderStatus(): void {
  const mode = Board.isOnDevice ? "Board" : "Preview";
  const bridgeVersion = Board.bridgeVersion ?? "n/a";
  statusEl.textContent = `${mode} / SDK ${Board.sdkVersion} / Bridge ${bridgeVersion} / ${lastInputLabel}`;
  document.body.classList.toggle("on-board", Board.isOnDevice);
}

function renderStampStrip(): void {
  stampStripEl.replaceChildren(
    ...Object.values(stampConfigs).map((config) => {
      const item = document.createElement("div");
      item.className = "stamp-token";
      item.title = `Glyph ${config.glyphId}: ${config.label}`;

      const image = document.createElement("img");
      image.src = config.src;
      image.alt = config.label;
      item.append(image);

      const label = document.createElement("span");
      label.textContent = String(config.glyphId);
      item.append(label);
      return item;
    }),
  );
}

function wireControls(): void {
  for (const swatch of document.querySelectorAll<HTMLButtonElement>(".swatch")) {
    const color = swatch.dataset.color;
    if (!color) {
      continue;
    }
    swatch.style.setProperty("--swatch-color", color);
    swatch.addEventListener("click", () => setBrushColor(color));
  }

  sizeInput.addEventListener("input", () => {
    brushSize = Number(sizeInput.value);
    renderToolState();
  });

  undoBtn.addEventListener("click", undoLastAction);
  clearInkBtn.addEventListener("click", clearInk);
  clearStampsBtn.addEventListener("click", clearStamps);
  setBrushColor(brushColor);
  renderToolState();
}

function setBrushColor(color: string): void {
  brushColor = color;
  renderToolState();
}

function renderToolState(): void {
  sizeValueEl.value = `${brushSize}px`;

  for (const swatch of document.querySelectorAll<HTMLButtonElement>(".swatch")) {
    const selected = swatch.dataset.color === brushColor;
    swatch.classList.toggle("selected", selected);
    swatch.setAttribute("aria-pressed", String(selected));
  }

  undoBtn.disabled = history.length === 0;
  clearInkBtn.disabled = strokes.length === 0;
  clearStampsBtn.disabled = stamps.length === 0;
  metricsEl.textContent = `${strokes.length} ink / ${stamps.length} stamps`;
}

function wireStylusDrawing(): void {
  surface.addEventListener("pointerdown", (event) => {
    if (activeStroke || !canDrawWithPointer(event)) {
      return;
    }

    event.preventDefault();
    pointerInputUntil = performance.now() + 700;
    surface.setPointerCapture(event.pointerId);
    activePointerId = event.pointerId;
    activeStroke = createStroke(pointFromPointer(event));
    noteInput(`pointer ${event.pointerType || "unknown"}`);
    renderInk();
    renderToolState();
  });

  surface.addEventListener("pointermove", (event) => {
    if (!activeStroke || activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    pointerInputUntil = performance.now() + 700;
    const events = event.getCoalescedEvents?.() ?? [event];
    for (const coalescedEvent of events) {
      appendPointIfMoved(activeStroke, pointFromPointer(coalescedEvent));
    }
    renderInk();
  });

  surface.addEventListener("pointerup", endStroke);
  surface.addEventListener("pointercancel", endStroke);

  surface.addEventListener("touchstart", (event) => {
    if (performance.now() < pointerInputUntil || activeStroke || isMultiTouch(event)) {
      return;
    }

    const touch = event.changedTouches[0];
    const point = pointFromTouch(touch);
    if (isNearLiveGlyph(point)) {
      return;
    }

    event.preventDefault();
    activeTouchId = touch.identifier;
    activeStroke = createStroke(point);
    noteInput("touch fallback");
    renderInk();
    renderToolState();
  }, { passive: false });

  surface.addEventListener("touchmove", (event) => {
    if (performance.now() < pointerInputUntil || !activeStroke || activeTouchId === null) {
      return;
    }

    const touch = findChangedTouch(event, activeTouchId);
    if (!touch) {
      return;
    }

    event.preventDefault();
    appendPointIfMoved(activeStroke, pointFromTouch(touch));
    renderInk();
  }, { passive: false });

  surface.addEventListener("touchend", endTouchStroke, { passive: false });
  surface.addEventListener("touchcancel", endTouchStroke, { passive: false });
}

function canDrawWithPointer(event: PointerEvent): boolean {
  const point = pointFromPointer(event);
  if (isNearLiveGlyph(point)) {
    return false;
  }

  return event.pointerType === "pen" ||
    event.pointerType === "touch" ||
    event.pointerType === "mouse" ||
    event.pointerType === "";
}

function endStroke(event: PointerEvent): void {
  if (activePointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  activePointerId = null;
  activeStroke = null;
  if (surface.hasPointerCapture(event.pointerId)) {
    surface.releasePointerCapture(event.pointerId);
  }
}

function endTouchStroke(event: TouchEvent): void {
  if (activeTouchId === null || !findChangedTouch(event, activeTouchId)) {
    return;
  }

  event.preventDefault();
  activeTouchId = null;
  activeStroke = null;
}

function wireBoardInput(): void {
  if (!Board.isOnDevice) {
    return;
  }

  Board.input.subscribe((contacts) => {
    for (const contact of contacts) {
      if (contact.type === BoardContactType.Glyph) {
        applyGlyphContact(contact);
      }
    }
    // Board finger contacts mirror DOM pointer/touch events, so only glyphs are handled here.
    renderPreview();
  });
}

function applyGlyphContact(contact: SurfaceContact): void {
  if (contact.phase === BoardContactPhase.Ended || contact.phase === BoardContactPhase.Canceled) {
    liveGlyphs.delete(contact.contactId);
    stampedContactIds.delete(contact.contactId);
    return;
  }

  if (!stampConfigs[contact.glyphId]) {
    liveGlyphs.delete(contact.contactId);
    return;
  }

  liveGlyphs.set(contact.contactId, contact);
  if (!stampedContactIds.has(contact.contactId)) {
    stampedContactIds.add(contact.contactId);
    addStampFromGlyph(contact);
  }
}

function addStampFromGlyph(contact: SurfaceContact): void {
  const stamp: Stamp = {
    id: nextStampId,
    glyphId: contact.glyphId,
    x: contact.x,
    y: contact.y,
    orientation: contact.orientation,
    size: stampSize,
  };
  nextStampId += 1;
  stamps.push(stamp);
  history.push({ type: "stamp", stamp });
  renderStamps();
  renderToolState();
}

function createStroke(firstPoint: Point): Stroke {
  const stroke: Stroke = {
    id: nextStrokeId,
    color: brushColor,
    width: brushSize,
    points: [firstPoint],
  };
  nextStrokeId += 1;
  strokes.push(stroke);
  history.push({ type: "stroke", stroke });
  return stroke;
}

function appendPointIfMoved(stroke: Stroke, point: Point): void {
  const previous = stroke.points[stroke.points.length - 1];
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 1) {
    stroke.points.push(point);
  }
}

function undoLastAction(): void {
  const action = history.pop();
  if (!action) {
    return;
  }

  if (action.type === "stroke") {
    removeById(strokes, action.stroke.id);
    renderInk();
  } else {
    removeById(stamps, action.stamp.id);
    renderStamps();
  }

  renderToolState();
}

function clearInk(): void {
  strokes.length = 0;
  removeHistoryActions("stroke");
  renderInk();
  renderToolState();
}

function clearStamps(): void {
  stamps.length = 0;
  removeHistoryActions("stamp");
  renderStamps();
  renderToolState();
}

function resizeCanvases(): void {
  const rect = surface.getBoundingClientRect();
  for (const canvas of [stampCanvas, inkCanvas, previewCanvas]) {
    canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }

  for (const ctx of [stampCtx, inkCtx, previewCtx]) {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  renderAll();
}

function renderAll(): void {
  renderStamps();
  renderInk();
  renderPreview();
}

function renderInk(): void {
  clearCanvas(inkCtx);
  for (const stroke of strokes) {
    drawStroke(stroke);
  }
}

function renderStamps(): void {
  clearCanvas(stampCtx);
  for (const stamp of stamps) {
    drawStamp(stampCtx, stamp, 1);
  }
}

function renderPreview(): void {
  clearCanvas(previewCtx);
  for (const contact of liveGlyphs.values()) {
    const stamp: Stamp = {
      id: 0,
      glyphId: contact.glyphId,
      x: contact.x,
      y: contact.y,
      orientation: contact.orientation,
      size: stampSize,
    };
    drawStamp(previewCtx, stamp, 0.42);
  }
}

function drawStroke(stroke: Stroke): void {
  if (stroke.points.length === 0) {
    return;
  }

  inkCtx.strokeStyle = stroke.color;
  inkCtx.fillStyle = stroke.color;
  inkCtx.lineCap = "round";
  inkCtx.lineJoin = "round";

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    inkCtx.beginPath();
    inkCtx.arc(point.x, point.y, (stroke.width * normalizedPressure(point.pressure)) / 2, 0, Math.PI * 2);
    inkCtx.fill();
    return;
  }

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previous = stroke.points[index - 1];
    const current = stroke.points[index];
    inkCtx.lineWidth = stroke.width * normalizedPressure(current.pressure);
    inkCtx.beginPath();
    inkCtx.moveTo(previous.x, previous.y);
    inkCtx.lineTo(current.x, current.y);
    inkCtx.stroke();
  }
}

function drawStamp(ctx: CanvasRenderingContext2D, stamp: Stamp, alpha: number): void {
  const image = stampImages.get(stamp.glyphId);
  const halfSize = stamp.size / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(stamp.x, stamp.y);
  ctx.rotate((stamp.orientation * Math.PI) / 180);

  if (image?.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, -halfSize, -halfSize, stamp.size, stamp.size);
  } else {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(-halfSize, -halfSize, stamp.size, stamp.size);
  }

  ctx.restore();
}

function preloadStampImages(configs: Readonly<Record<number, StampConfig>>): Map<number, HTMLImageElement> {
  const images = new Map<number, HTMLImageElement>();
  for (const config of Object.values(configs)) {
    const image = new Image();
    image.decoding = "async";
    image.src = config.src;
    image.addEventListener("load", renderAll);
    images.set(config.glyphId, image);
  }
  return images;
}

function pointFromPointer(event: PointerEvent): Point {
  const rect = surface.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: event.pressure,
  };
}

function pointFromTouch(touch: Touch): Point {
  const rect = surface.getBoundingClientRect();
  const force = "force" in touch && typeof touch.force === "number" ? touch.force : 0.7;
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
    pressure: force,
  };
}

function isNearLiveGlyph(point: Point): boolean {
  for (const glyph of liveGlyphs.values()) {
    if (Math.hypot(point.x - glyph.x, point.y - glyph.y) <= stampSize * 0.75) {
      return true;
    }
  }
  return false;
}

function isMultiTouch(event: TouchEvent): boolean {
  return event.touches.length > 1 || event.changedTouches.length > 1;
}

function findChangedTouch(event: TouchEvent, identifier: number): Touch | null {
  for (const touch of event.changedTouches) {
    if (touch.identifier === identifier) {
      return touch;
    }
  }
  return null;
}

function noteInput(label: string): void {
  lastInputLabel = label;
  renderStatus();
}

function normalizedPressure(pressure: number): number {
  return pressure > 0 ? Math.max(minPressure, pressure) : 0.7;
}

function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, surface.clientWidth, surface.clientHeight);
}

function removeById<T extends { id: number }>(items: T[], id: number): void {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) {
    items.splice(index, 1);
  }
}

function removeHistoryActions(type: HistoryAction["type"]): void {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].type === type) {
      history.splice(index, 1);
    }
  }
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(`Canvas 2D context is unavailable for #${canvas.id}`);
  }
  return context;
}
