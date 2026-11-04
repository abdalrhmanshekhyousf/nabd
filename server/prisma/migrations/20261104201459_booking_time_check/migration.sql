-- A booking ends after it starts (task 2.18).
ALTER TABLE "OperationBooking"
  ADD CONSTRAINT "OperationBooking_time_order" CHECK ("endsAt" > "startsAt");
