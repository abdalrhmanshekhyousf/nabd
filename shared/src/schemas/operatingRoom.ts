import { z } from 'zod';
import { requiredText } from './common.js';

/**
 * The seven operating room states, matching the OperatingRoomStatus enum: one
 * cycle of six plus OUT_OF_SERVICE, set by the admin for maintenance. Who may
 * move a room to which state is task 2.19.
 */
export const OPERATING_ROOM_STATUSES = [
  'AVAILABLE',
  'BOOKED',
  'PREPARING',
  'IN_SURGERY',
  'AWAITING_STERILIZATION',
  'STERILIZING',
  'OUT_OF_SERVICE',
] as const;
export type OperatingRoomStatus = (typeof OPERATING_ROOM_STATUSES)[number];

/** States in which the admin may rename, delete or take a room out of service. */
export const OPERATING_ROOM_IDLE: readonly OperatingRoomStatus[] = ['AVAILABLE', 'OUT_OF_SERVICE'];

/** POST /operating-rooms and PATCH /operating-rooms/:id */
export const operatingRoomSchema = z.object({
  name: requiredText(60),
});

/** PATCH /operating-rooms/:id/service: maintenance on or off. */
export const operatingRoomServiceSchema = z.object({
  outOfService: z.boolean(),
});

export type OperatingRoomInput = z.input<typeof operatingRoomSchema>;
