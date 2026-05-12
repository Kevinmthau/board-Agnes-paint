type StylusPointerSnapshot = Pick<PointerEvent, "pointerType" | "buttons" | "pressure">;

const primaryContactButton = 1;

export function isPenContactEvent(event: StylusPointerSnapshot): boolean {
  return event.pointerType === "pen" && ((event.buttons & primaryContactButton) !== 0 || event.pressure > 0);
}

export function isPenSessionActive(now: number, lastPenContactAt: number, graceMs: number): boolean {
  return now - lastPenContactAt < graceMs;
}
