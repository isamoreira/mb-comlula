-- Contador anônimo do Espalha Hoje (Cloudflare D1).
-- Uma linha por dia + post + rede, com o número de compartilhamentos.
-- Não há nenhuma coluna de IP, cookie, aparelho ou usuário.
CREATE TABLE IF NOT EXISTS shares (
  day     TEXT    NOT NULL,           -- AAAA-MM-DD (fuso de São Paulo)
  post_id TEXT    NOT NULL,
  network TEXT    NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, post_id, network)
);
