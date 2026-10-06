SET @payment_url_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'paymentUrl'
);

SET @payment_code_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'settings'
      AND COLUMN_NAME = 'paymentCode'
);

SET @payment_code_migration = IF(
    @payment_url_exists = 1 AND @payment_code_exists = 0,
    'ALTER TABLE `settings` CHANGE COLUMN `paymentUrl` `paymentCode` VARCHAR(2048) NOT NULL',
    'SELECT 1'
);

PREPARE payment_code_statement FROM @payment_code_migration;
EXECUTE payment_code_statement;
DEALLOCATE PREPARE payment_code_statement;
