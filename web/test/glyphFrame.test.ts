import assert from "node:assert/strict";
import test from "node:test";
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
  const stamps: number[] = [];

  const newContact: TestContact = { contactId: 2, glyphId: 7, phase: "active", x: 104, y: 104 };
  const endedContact: TestContact = { contactId: 1, glyphId: 7, phase: "ended", x: 100, y: 100 };

  processGlyphContactFrame([newContact, endedContact], {
    isEndedContact: (contact) => contact.phase === "ended",
    removeContact: (contact) => {
      liveGlyphs.delete(contact.contactId);
      stampedContactIds.delete(contact.contactId);
    },
    applyContact: (contact) => {
      liveGlyphs.set(contact.contactId, contact);
      if (isDuplicateLiveGlyphContact(contact, liveGlyphs)) {
        stampedContactIds.add(contact.contactId);
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

function isDuplicateLiveGlyphContact(
  contact: TestContact,
  liveGlyphs: ReadonlyMap<number, TestContact>,
): boolean {
  for (const glyph of liveGlyphs.values()) {
    if (
      glyph.contactId !== contact.contactId &&
      glyph.glyphId === contact.glyphId &&
      Math.hypot(contact.x - glyph.x, contact.y - glyph.y) <= proximity
    ) {
      return true;
    }
  }
  return false;
}
