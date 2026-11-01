import { z } from 'zod';
import { id, requiredText } from './common.js';

/** The five bed states, matching the BedStatus enum of the database. */
export const BED_STATUSES = [
  'EMPTY',
  'RESERVED',
  'OCCUPIED',
  'CLEANING',
  'OUT_OF_SERVICE',
] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

/** A patient is (or is about to be) in these beds: they can't be removed. */
export const BED_STATUSES_IN_USE: readonly BedStatus[] = ['RESERVED', 'OCCUPIED'];

export const MAX_BEDS_PER_ROOM = 20;

/** Optional floor number; an empty field arrives as null. */
const floor = () =>
  z
    .number('validation.invalid')
    .int('validation.invalid')
    .min(-5, 'validation.invalid')
    .max(200, 'validation.invalid')
    .nullable();

/** POST /rooms: a room in a department, with its first beds. */
export const createRoomSchema = z.object({
  departmentId: id(),
  number: requiredText(20),
  floor: floor(),
  bedCount: z
    .number('validation.invalid')
    .int('validation.invalid')
    .min(0, 'validation.invalid')
    .max(MAX_BEDS_PER_ROOM, 'validation.tooMany'),
});

/** PATCH /rooms/:id */
export const updateRoomSchema = z.object({
  number: requiredText(20),
  floor: floor(),
});

/** POST /rooms/:id/beds: the label is optional (next number by default). */
export const createBedSchema = z.object({
  label: requiredText(10).optional(),
});

/** PATCH /beds/:id: the admin takes a bed out of service or back. */
export const bedServiceSchema = z.object({
  outOfService: z.boolean(),
});

export type CreateRoomInput = z.input<typeof createRoomSchema>;
export type UpdateRoomInput = z.input<typeof updateRoomSchema>;
