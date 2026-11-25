import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa de ao menos 32 caracteres"),
  SHARE_LINK_DAYS: z.coerce.number().int().min(0).default(90),

  /** Logins (separados por vírgula) que são sempre administradores, independentemente do papel no banco. */
  MASTER_ADMINS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)),

  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false", "no-verify"]).default("false"),

  META_ACCESS_TOKEN: optional,
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  /** Facebook Login for Business: ID da configuração (apps do tipo "Empresa"). Opcional. */
  META_LOGIN_CONFIG_ID: optional,

  /** Chave (32 bytes, base64url) que criptografa os tokens das Integrações no banco. */
  INTEGRATIONS_KEY: optional,
  META_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,
  GOOGLE_ADS_DEVELOPER_TOKEN: optional,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: optional.refine((v) => !v || /^\d{10}$/.test(v), {
    message: "GOOGLE_ADS_LOGIN_CUSTOMER_ID deve ter 10 dígitos, sem hífen",
  }),
  GOOGLE_ADS_API_VERSION: z.string().regex(/^v\d+$/).default("v26"),

  /** E-mail do Encarregado (DPO) exibido na Política de Privacidade. */
  PRIVACY_CONTACT_EMAIL: optional,

  DEMO_MODE: z.enum(["true", "false"]).default("false"),

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Variáveis de ambiente validadas. Só pode ser usado no servidor. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Configuração inválida no .env — ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
