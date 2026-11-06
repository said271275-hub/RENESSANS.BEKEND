ALTER TABLE "Attendance" ADD COLUMN "reason" TEXT CHECK ("reason" IS NULL OR length("reason") <= 300);
ALTER TABLE "Attendance" ADD COLUMN "reasonByTeacherId" INTEGER REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attendance" ADD COLUMN "reasonAt" DATETIME;
