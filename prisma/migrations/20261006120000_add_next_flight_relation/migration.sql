-- Add an optional self-relation for connecting flights.
ALTER TABLE `Flight`
    ADD COLUMN `nextFlightId` INTEGER NULL,
    ADD INDEX `Flight_nextFlightId_idx`(`nextFlightId`),
    ADD CONSTRAINT `Flight_nextFlightId_fkey`
        FOREIGN KEY (`nextFlightId`) REFERENCES `Flight`(`id`)
        ON DELETE SET NULL ON UPDATE CASCADE;
