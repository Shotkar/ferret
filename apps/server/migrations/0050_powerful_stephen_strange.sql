ALTER TABLE `item` ADD `import_key` text;--> statement-breakpoint
CREATE INDEX `item_import_key_idx` ON `item` (`household_id`,`import_key`);--> statement-breakpoint
-- Amazon lines imported before import_key: their order number is in the notes ("Order ID: …") and the product in the
-- "On Amazon" link, so a newer export skips them too. The same product twice in one order gets :1, :2 by age.
UPDATE `item` SET `import_key` = k.`key` FROM (
  SELECT `id`, 'amazon:' || `ord` || ':' || `asin` || ':' || row_number() OVER (PARTITION BY `household_id`, `ord`, `asin` ORDER BY `created_at`, `id`) AS `key`
  FROM (
    SELECT `id`, `household_id`, `created_at`,
      trim(substr(`rest`, 1, instr(`rest` || char(10), char(10)) - 1)) AS `ord`,
      upper(substr(`links`, instr(`links`, 'amazon.com/dp/') + 14, 10)) AS `asin`
    FROM (SELECT *, substr(`notes`, instr(`notes`, 'Order ID: ') + 10) AS `rest` FROM `item`
      WHERE `import_key` IS NULL AND `origin` = 'spreadsheet' AND `notes` LIKE 'Bought on Amazon%'
        AND instr(`notes`, 'Order ID: ') > 0 AND instr(`links`, 'amazon.com/dp/') > 0)
  )
  WHERE `ord` <> ''
) AS k WHERE `item`.`id` = k.`id`;
