import { describe, expect, it } from 'vitest';
import { checkTransition, nextStatuses } from './orStateMachine.js';

describe('the operating room state machine', () => {
  it('follows the report cycle, each step by its own people', () => {
    expect(checkTransition('AVAILABLE', 'BOOKED', ['DOCTOR'], { viaBooking: true })).toEqual({
      ok: true,
    });
    expect(checkTransition('BOOKED', 'PREPARING', ['OR_NURSE'])).toEqual({ ok: true });
    expect(checkTransition('PREPARING', 'IN_SURGERY', ['OR_NURSE'])).toEqual({ ok: true });
    expect(checkTransition('IN_SURGERY', 'AWAITING_STERILIZATION', ['OR_NURSE'])).toEqual({
      ok: true,
    });
    expect(checkTransition('AWAITING_STERILIZATION', 'STERILIZING', ['STERILIZER'])).toEqual({
      ok: true,
    });
    expect(checkTransition('STERILIZING', 'AVAILABLE', ['STERILIZER'])).toEqual({ ok: true });
  });

  it('refuses the wrong people', () => {
    expect(checkTransition('BOOKED', 'PREPARING', ['ER_NURSE'])).toEqual({
      ok: false,
      reason: 'NOT_ALLOWED',
    });
    expect(checkTransition('IN_SURGERY', 'AWAITING_STERILIZATION', ['DOCTOR'])).toEqual({
      ok: false,
      reason: 'NOT_ALLOWED',
    });
    expect(checkTransition('AWAITING_STERILIZATION', 'STERILIZING', ['OR_NURSE'])).toEqual({
      ok: false,
      reason: 'NOT_ALLOWED',
    });
    expect(checkTransition('AVAILABLE', 'OUT_OF_SERVICE', ['OR_NURSE'])).toEqual({
      ok: false,
      reason: 'NOT_ALLOWED',
    });
  });

  it('refuses skipping steps or going backwards', () => {
    expect(checkTransition('BOOKED', 'IN_SURGERY', ['OR_NURSE'])).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(checkTransition('IN_SURGERY', 'AVAILABLE', ['OR_NURSE'])).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(checkTransition('IN_SURGERY', 'OUT_OF_SERVICE', ['ADMIN'])).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(checkTransition('AWAITING_STERILIZATION', 'AVAILABLE', ['STERILIZER'])).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('booking a room or freeing it again only happens through a booking', () => {
    expect(checkTransition('AVAILABLE', 'BOOKED', ['DOCTOR'])).toEqual({
      ok: false,
      reason: 'VIA_BOOKING',
    });
    expect(checkTransition('BOOKED', 'AVAILABLE', ['ER_NURSE'], { viaBooking: true })).toEqual({
      ok: true,
    });
  });

  it('maintenance is the admin’s, from and to available', () => {
    expect(checkTransition('AVAILABLE', 'OUT_OF_SERVICE', ['ADMIN'])).toEqual({ ok: true });
    expect(checkTransition('OUT_OF_SERVICE', 'AVAILABLE', ['ADMIN'])).toEqual({ ok: true });
  });

  it('lists the buttons each person gets', () => {
    expect(nextStatuses('BOOKED', ['OR_NURSE'])).toEqual(['PREPARING']);
    expect(nextStatuses('BOOKED', ['DOCTOR'])).toEqual([]);
    expect(nextStatuses('AVAILABLE', ['ADMIN'])).toEqual(['OUT_OF_SERVICE']);
    expect(nextStatuses('AWAITING_STERILIZATION', ['STERILIZER'])).toEqual(['STERILIZING']);
    expect(nextStatuses('IN_SURGERY', ['STERILIZER'])).toEqual([]);
  });
});
