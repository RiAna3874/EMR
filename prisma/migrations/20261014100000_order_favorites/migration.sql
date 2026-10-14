-- Order favorites: one-click orders each clinician stars on the Orders tab.
ALTER TABLE "Practitioner" ADD COLUMN "orderFavorites" TEXT[] DEFAULT ARRAY[]::TEXT[];
