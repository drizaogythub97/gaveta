/**
 * Política de senha — alinhada às recomendações modernas (NIST SP 800-63B):
 * privilegia **comprimento** e **bloqueio de senhas previsíveis/comprometidas**
 * em vez de exigir composição complexa (maiúscula/símbolo), que prejudica a
 * usabilidade — especialmente para o público idoso deste app.
 *
 * As checagens rodam no SERVIDOR (fronteira de confiança). A mesma função pode
 * ser reusada no cliente apenas para feedback.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // limite do bcrypt usado pelo Supabase Auth.

// Senhas/padrões muito comuns (comparação case-insensitive). Não é exaustivo —
// é uma barreira pragmática offline contra os palpites mais óbvios.
const COMMON_PASSWORDS = new Set<string>([
  "12345678",
  "123456789",
  "1234567890",
  "123456789012",
  "12341234",
  "11111111",
  "00000000",
  "aaaaaaaa",
  "abcd1234",
  "abcdefgh",
  "qwertyui",
  "qwerty123",
  "1q2w3e4r",
  "password",
  "password1",
  "passw0rd",
  "iloveyou",
  "admin123",
  "senha123",
  "senha1234",
  "senhasenha",
  "minhasenha",
  "mudar123",
  "brasil123",
  "102030405060",
  "gaveta123",
]);

export function isCommonPassword(pw: string): boolean {
  return COMMON_PASSWORDS.has(pw.toLowerCase());
}

/** Sequência ascendente/descendente óbvia (ex.: "12345678", "abcdefgh"). */
function isSequential(pw: string): boolean {
  if (pw.length < 6) return false;
  let asc = true;
  let desc = true;
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  return asc || desc;
}

/** Variedade mínima: rejeita coisas como "aaaaaaaa" ou "ababab". */
function hasLowVariety(pw: string): boolean {
  return new Set(pw.toLowerCase()).size < 4;
}

export interface PasswordContext {
  email?: string;
  name?: string;
}

/**
 * Retorna uma mensagem de erro (em português, amigável) caso a senha viole a
 * política, ou `null` se estiver ok. Assume que o comprimento mínimo já foi
 * validado separadamente.
 */
export function checkPasswordStrength(
  pw: string,
  context?: PasswordContext,
): string | null {
  const lower = pw.toLowerCase();

  if (isCommonPassword(pw) || isSequential(pw)) {
    return "Essa senha é muito comum ou previsível. Escolha outra.";
  }
  if (hasLowVariety(pw)) {
    return "Use uma senha com mais variedade de caracteres.";
  }

  const local = context?.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    return "A senha não pode conter o seu e-mail.";
  }

  if (context?.name) {
    const parts = context.name
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 3);
    if (parts.some((p) => lower.includes(p))) {
      return "A senha não pode conter o seu nome.";
    }
  }

  return null;
}

/** Dica curta e estável exibida nos formulários (acessível, sem alarmar). */
export const PASSWORD_HINT =
  "Use ao menos 8 caracteres. Evite senhas óbvias (ex.: 12345678) e não use seu nome ou e-mail.";
