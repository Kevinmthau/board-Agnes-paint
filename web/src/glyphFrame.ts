export type GlyphFrameHandlers<TContact> = {
  isEndedContact: (contact: TContact) => boolean;
  removeContact: (contact: TContact) => void;
  applyContact: (contact: TContact) => void;
};

export function processGlyphContactFrame<TContact>(
  contacts: ReadonlyArray<TContact>,
  handlers: GlyphFrameHandlers<TContact>,
): void {
  const activeContacts: TContact[] = [];

  for (const contact of contacts) {
    if (handlers.isEndedContact(contact)) {
      handlers.removeContact(contact);
    } else {
      activeContacts.push(contact);
    }
  }

  for (const contact of activeContacts) {
    handlers.applyContact(contact);
  }
}
