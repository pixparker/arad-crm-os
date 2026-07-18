// UUIDv7 (ADR-002): time-ordered ids for index locality on append-heavy
// tables (ledger, activities, events). App-generated — no DB extension needed.

import { randomBytes } from 'node:crypto';

export const uuidv7 = (): string => {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6); // 48-bit unix-millis timestamp
  b.writeUInt8((b.readUInt8(6) & 0x0f) | 0x70, 6); // version 7
  b.writeUInt8((b.readUInt8(8) & 0x3f) | 0x80, 8); // RFC 4122 variant
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
