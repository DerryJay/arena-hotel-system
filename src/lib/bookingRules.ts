import type { ReservationStatus } from './types';

export interface InventoryReservation {
  roomId: string;
  checkIn: string;
  checkOut: string;
  status: ReservationStatus;
}

export const inventoryHoldingStatuses = ['reserved', 'confirmed', 'checked_in'] as const;

export function holdsRoomInventory(status: ReservationStatus): boolean {
  return inventoryHoldingStatuses.includes(status as (typeof inventoryHoldingStatuses)[number]);
}

export function dateRangesOverlap(existing: Pick<InventoryReservation, 'checkIn' | 'checkOut'>, next: Pick<InventoryReservation, 'checkIn' | 'checkOut'>): boolean {
  return existing.checkIn < next.checkOut && existing.checkOut > next.checkIn;
}

export function wouldDoubleBook(existing: InventoryReservation, next: InventoryReservation): boolean {
  return (
    existing.roomId === next.roomId &&
    holdsRoomInventory(existing.status) &&
    holdsRoomInventory(next.status) &&
    dateRangesOverlap(existing, next)
  );
}
