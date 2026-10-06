SET @flight_status_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'Flight'
      AND COLUMN_NAME = 'status'
);

SET @flight_status_migration = IF(
    @flight_status_exists = 0,
    'ALTER TABLE `Flight` ADD COLUMN `status` ENUM(''SCHEDULED'', ''DELAYED'', ''CANCELLED'', ''COMPLETED'') NOT NULL DEFAULT ''SCHEDULED''',
    'SELECT 1'
);

PREPARE flight_status_statement FROM @flight_status_migration;
EXECUTE flight_status_statement;
DEALLOCATE PREPARE flight_status_statement;
