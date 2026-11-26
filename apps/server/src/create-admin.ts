/**
 * Creates an admin account for the admin panel, or resets its password if it already exists:
 *   npm run admin:create -w @ludo/server [-- email]
 * ADMIN_EMAIL and ADMIN_PASSWORD can be given instead of answering the questions.
 */
import { createInterface } from 'node:readline';
import { createAdmin, findAdminForLogin, getAdmin, setAdminPassword } from './db';
import { EMAIL_RE, checkNewAdminPassword, hashPassword } from './passwords';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        write.call(rl, s.startsWith(question) ? s : s.replace(/[^\r\n]/g, '•'));
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? (await ask('Email de l’admin : '))).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('Email invalide.');

  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await ask('Mot de passe (10 caractères minimum) : ', true);
    if ((await ask('Confirme le mot de passe : ', true)) !== password) throw new Error('Les deux mots de passe sont différents.');
  }
  const weak = checkNewAdminPassword(password);
  if (weak) throw new Error(weak);

  const existing = findAdminForLogin(email);
  if (existing) {
    setAdminPassword(existing.id, await hashPassword(password));
    console.log(`Mot de passe de ${getAdmin(existing.id)!.email} mis à jour.`);
  } else {
    const admin = createAdmin(email, await hashPassword(password));
    console.log(`Admin ${admin.email} créé.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
