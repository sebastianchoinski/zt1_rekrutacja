CREATE TABLE "Calculation" (
  "id" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderItem" TEXT NOT NULL,
  "orderQuantity" DOUBLE PRECISION NOT NULL,
  "materialCount" INTEGER NOT NULL,
  "input" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Calculation_createdAt_idx" ON "Calculation"("createdAt");
