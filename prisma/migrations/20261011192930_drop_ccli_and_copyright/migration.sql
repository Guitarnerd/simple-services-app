/*
  Warnings:

  - You are about to drop the column `ccliNumber` on the `Song` table. All the data in the column will be lost.
  - You are about to drop the column `copyright` on the `Song` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Song" DROP COLUMN "ccliNumber",
DROP COLUMN "copyright";
