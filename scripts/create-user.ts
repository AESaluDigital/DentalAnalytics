/**
 * Cria ou atualiza um usuário autorizado.
 * Uso: npm run user:create -- --login pessoa@empresa.com --name "Pessoa" [--role admin]
 *      (--login aceita e-mail ou nome de usuário; --email continua funcionando)
 * A senha é pedida no terminal ou lida de NEW_USER_PASSWORD (não passe senha como argumento).
 * Mínimo recomendado: 12 caracteres. Para aceitar 8–11, defina ALLOW_SHORT_PASSWORD=1.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { pgSsl } from "./pg-ssl";

async function main() {
  const { values } = parseArgs({
    options: {
      login: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "user" },
    },
  });

  // O login é salvo em minúsculas; na tela de login a comparação também ignora maiúsculas.
  const email = (values.login ?? values.email)?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role;
  if (!email || !name) throw new Error('Informe --login e --name. Ex.: --login a@b.com --name "Fulano"');
  if (!/^[a-z0-9._@+-]{3,200}$/.test(email)) throw new Error("Login inválido: use letras, números, . _ - + @ (3 a 200).");
  if (role !== "admin" && role !== "user") throw new Error("--role deve ser admin ou user");

  // Senha: variável NEW_USER_PASSWORD (uso não interativo) ou digitada no terminal.
  let password = process.env.NEW_USER_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout });
    password = await rl.question("Senha (mín. 12 caracteres): ");
    rl.close();
  }
  const allowShort = process.env.ALLOW_SHORT_PASSWORD === "1";
  if (password.length < 8) throw new Error("Senha muito curta (mínimo 8 caracteres).");
  if (password.length < 12) {
    if (!allowShort) throw new Error("Senha curta (recomendado 12+). Para aceitar mesmo assim, defina ALLOW_SHORT_PASSWORD=1.");
    console.warn("Aviso: senha com menos de 12 caracteres. Recomenda-se trocar por uma mais longa.");
  }

  const hash = await bcrypt.hash(password, 12);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido no .env");
  const db = new Client({
    connectionString: url,
    ssl: pgSsl(),
  });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO users (email, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
             role = EXCLUDED.role, active = TRUE`,
      [email, name, hash, role],
    );
    console.log(`Usuário ${email} salvo (${role}).`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
