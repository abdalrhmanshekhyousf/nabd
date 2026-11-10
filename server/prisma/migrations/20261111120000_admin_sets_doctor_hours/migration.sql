-- The admin sets a doctor's days and hours; the doctor keeps the visit length
-- (task 3.19). It moves from each schedule day to the doctor's profile.
ALTER TABLE "DoctorProfile" ADD COLUMN "visitMinutes" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_visitMinutes_check" CHECK ("visitMinutes" BETWEEN 5 AND 240);

UPDATE "DoctorProfile" p
SET "visitMinutes" = s."slotMinutes"
FROM (
  SELECT "doctorId", MAX("slotMinutes") AS "slotMinutes" FROM "DoctorSchedule" GROUP BY "doctorId"
) s
WHERE s."doctorId" = p."userId";

ALTER TABLE "DoctorSchedule" DROP CONSTRAINT "DoctorSchedule_slot_check";
ALTER TABLE "DoctorSchedule" DROP COLUMN "slotMinutes";
