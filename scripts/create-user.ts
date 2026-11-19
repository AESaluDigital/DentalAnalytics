/**
 * Cria ou atualiza um usuário autorizado.
 * Uso: npm run user:create -- --email pessoa@empresa.com --name "Pessoa" [--role admin]
 * A senha é pedida no terminal ou lida de NEW_USER_PASSWORD (não passe senha como argumento).
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { parseArgs } from "node:util";
import bcrypt from "bcryptjs";
import { Client } from "pg";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "user" },
    },
  });

  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role;
  if (!email || !name) throw new Error('Informe --email e --name. Ex.: --email a@b.com --name "Fulano"');
  if (role !== "admin" && role !== "user") throw new Error("--role deve ser admin ou user");

  // Senha: variável NEW_USER_PASSWORD (uso não interativo) ou digitada no terminal.
  let password = process.env.NEW_USER_PASSWORD ?? "";
  if (!password) {
    const rl = createInterface({ input: stdin, output: stdout });
    password = await rl.question("Senha (mín. 12 caracteres): ");
    rl.close();
  }
  if (password.length < 12) throw new Error("Senha muito curta (mínimo 12 caracteres).");

  const hash = await bcrypt.hash(password, 12);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido no .env");
  const db = new Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
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
