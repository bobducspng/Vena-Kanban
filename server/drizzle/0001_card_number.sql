-- AUTO_INCREMENT precisa ser chave no MESMO ALTER (o MySQL rejeita em dois passos).
-- Cards existentes recebem 1, 2, 3... na ordem física da tabela.
ALTER TABLE `cards` ADD `number` int AUTO_INCREMENT NOT NULL, ADD CONSTRAINT `uq_cards_number` UNIQUE(`number`);
