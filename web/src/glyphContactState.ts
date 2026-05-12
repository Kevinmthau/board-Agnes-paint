export type GlyphContactState<TContact, TSamples> = {
  liveGlyphs: Map<number, TContact>;
  stampedContactIds: Set<number>;
  suppressedContactIds: Set<number>;
  pendingContactSamples: Map<number, TSamples>;
};

export function clearEndedGlyphContact<TContact, TSamples>(
  contactId: number,
  state: GlyphContactState<TContact, TSamples>,
): void {
  state.liveGlyphs.delete(contactId);
  state.stampedContactIds.delete(contactId);
  state.suppressedContactIds.delete(contactId);
  state.pendingContactSamples.delete(contactId);
}

export function clearUnconfiguredGlyphReading<TContact, TSamples>(
  contactId: number,
  state: Pick<GlyphContactState<TContact, TSamples>, "liveGlyphs" | "pendingContactSamples">,
): void {
  state.liveGlyphs.delete(contactId);
  state.pendingContactSamples.delete(contactId);
}
