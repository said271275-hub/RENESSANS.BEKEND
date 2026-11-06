ALTER TABLE "Student" ADD COLUMN "monthlyFee" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Teacher" ADD COLUMN "salaryMode" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "salaryValue" REAL;

CREATE TABLE "TeacherPayroll" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "groupId" INTEGER NOT NULL,
  "teacherId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "salaryMode" TEXT NOT NULL,
  "salaryValue" REAL NOT NULL,
  "paymentPercentage" REAL NOT NULL,
  "collectedAmount" REAL NOT NULL,
  "expectedAmount" REAL NOT NULL,
  "amount" REAL NOT NULL,
  "transactionId" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherPayroll_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherPayroll_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherPayroll_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeacherPayroll_transactionId_key" ON "TeacherPayroll"("transactionId");
CREATE UNIQUE INDEX "TeacherPayroll_groupId_month_key" ON "TeacherPayroll"("groupId", "month");
