/** SSL do Postgres para scripts. "no-verify" aceita o certificado do Supabase sem validar a cadeia. */
export function pgSsl(mode = process.env.DATABASE_SSL) {
  if (mode === "true") return { rejectUnauthorized: true };
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return undefined;
}
