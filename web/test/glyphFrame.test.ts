import assert from "node:assert/strict";
import test from "node:test";
import {
  clearEndedGlyphContact,
  clearUnconfiguredGlyphReading,
  type GlyphContactState,
} from "../src/glyphContactState";
import { processGlyphContactFrame } from "../src/glyphFrame";

type TestContact = {
  contactId: number;
  glyphId: number;
  phase: "active" | "ended";
  x: number;
  y: number;
};

const proximity = 69;

test("removes ended contacts before applying active glyph contacts in the same frame", () => {
  const liveGlyphs = new Map<number, TestContact>([
    [1, { contactId: 1, glyphId: 7, phase: "active", x: 100, y: 100 }],
  ]);
  const stampedContactIds = new Set<number>([1]);
  const suppressedContactIds = new Set<number>();
  const stamps: number[] = [];

  const newContact: TestContact = { contactId: 2, glyphId: 7, phase: "active", x: 104, y: 104 };
  const endedContact: TestContact = { contactId: 1, glyphId: 7, phase: "ended", x: 100, y: 100 };

  processGlyphContactFrame([newContact, endedContact], {
    isEndedContact: (contact) => contact.phase === "ended",
    removeContact: (contact) => {
      liveGlyphs.delete(contact.contactId);
      stampedContactIds.delete(contact.contactId);
      suppressedContactIds.delete(contact.contactId);
    },
    applyContact: (contact) => {
      liveGlyphs.set(contact.contactId, contact);
      if (isDuplicateCommittedLiveGlyphContact(contact, liveGlyphs, stampedContactIds)) {
        suppressedContactIds.add(contact.contactId);
        return;
      }
      stampedContactIds.add(contact.contactId);
      stamps.push(contact.contactId);
    },
  });

  assert.deepEqual(stamps, [2]);
  assert.equal(liveGlyphs.has(1), false);
  assert.equal(stampedContactIds.has(1), false);
});

test("suppressed higher-id duplicate does not block lower-id duplicate in the same frame", () => {
  const lowContact: TestContact = { contactId: 1, glyphId: 7, phase: "active", x: 100, y: 100 };
  const highContact: TestContact = { contactId: 2, glyphId: 7, phase: "active", x: 104, y: 104 };
  const liveGlyphs = new Map<number, TestContact>([
    [1, lowContact],
    [2, highContact],
  ]);
  const stampedContactIds = new Set<number>();
  const suppressedContactIds = new Set<number>();
  const stamps: number[] = [];

  processGlyphContactFrame([highContact, lowContact], {
    isEndedContact: (contact) => contact.phase === "ended",
    removeContact: (contact) => {
      liveGlyphs.delete(contact.contactId);
      stampedContactIds.delete(contact.contactId);
      suppressedContactIds.delete(contact.contactId);
    },
    applyContact: (contact) => {
      liveGlyphs.set(contact.contactId, contact);
      if (stampedContactIds.has(contact.contactId) || suppressedContactIds.has(contact.contactId)) {
        return;
      }
      if (isDuplicateCommittedLiveGlyphContact(contact, liveGlyphs, stampedContactIds)) {
        suppressedContactIds.add(contact.contactId);
        return;
      }
      stampedContactIds.add(contact.contactId);
      stamps.push(contact.contactId);
    },
  });

  assert.deepEqual(stamps, [1]);
  assert.equal(stampedContactIds.has(2), false);
  assert.equal(suppressedContactIds.has(2), true);
});

test("unconfigured glyph readings keep duplicate suppression until contact ends", () => {
  const contact: TestContact = { contactId: 2, glyphId: 7, phase: "active", x: 104, y: 104 };
  const state: GlyphContactState<TestContact, { glyphIds: number[] }> = {
    liveGlyphs: new Map([[contact.contactId, contact]]),
    stampedContactIds: new Set(),
    suppressedContactIds: new Set([contact.contactId]),
    pendingContactSamples: new Map([[contact.contactId, { glyphIds: [7] }]]),
  };

  clearUnconfiguredGlyphReading(contact.contactId, state);

  assert.equal(state.liveGlyphs.has(contact.contactId), false);
  assert.equal(state.pendingContactSamples.has(contact.contactId), false);
  assert.equal(state.suppressedContactIds.has(contact.contactId), true);

  clearEndedGlyphContact(contact.contactId, state);

  assert.equal(state.suppressedContactIds.has(contact.contactId), false);
});

function isDuplicateCommittedLiveGlyphContact(
  contact: TestContact,
  liveGlyphs: ReadonlyMap<number, TestContact>,
  stampedContactIds: ReadonlySet<number>,
): boolean {
  for (const glyph of liveGlyphs.values()) {
    if (
      glyph.contactId === contact.contactId ||
      glyph.glyphId !== contact.glyphId ||
      Math.hypot(contact.x - glyph.x, contact.y - glyph.y) > proximity
    ) {
      continue;
    }
    if (stampedContactIds.has(glyph.contactId)) {
      return true;
    }
    if (glyph.contactId < contact.contactId) {
      return true;
    }
  }
  return false;
}
