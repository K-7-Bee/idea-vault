import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectDatabase, compareSnapshots, decodeBytes, decryptSnapshot, encryptSnapshot, readLimited, verifySnapshot } from './preservation.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const passphrase = process.env.VAULT_BACKUP_PASSPHRASE;
delete process.env.VAULT_BACKUP_PASSPHRASE;

async function externalDestination(destination) {
  const requested = path.resolve(destination);
  const resolved = path.join(await realpath(path.dirname(requested)), path.basename(requested));
  const relative = path.relative(repository, resolved);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Backup destinations must be outside the repository');
  }
  return resolved;
}
const readBackup = async (file) => decryptSnapshot(JSON.parse((await readLimited(file)).toString('utf8')), passphrase);
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });

try {
  const [command, first, second, third, ...extra] = process.argv.slice(2);
  if (!first || extra.length) throw new Error('Usage: create <export-dir> <new-backup-file> <source-label> | verify <backup> | compare <before> <after> | extract <backup> <new-empty-dir>');
  if (command === 'create' && second && third) {
    const snapshot = await collectDatabase(first, third);
    const envelope = encryptSnapshot(snapshot, passphrase);
    await writeJson(await externalDestination(second), envelope);
    console.log('Encrypted backup created. Independent live inventory and isolated restore are still required.');
  } else if (command === 'verify' && !second) {
    console.log(JSON.stringify(verifySnapshot(await readBackup(first))));
  } else if (command === 'compare' && second && !third) {
    compareSnapshots(await readBackup(first), await readBackup(second));
    console.log('Snapshot records and bytes match; this does not attest live completeness.');
  } else if (command === 'extract' && second && !third) {
    const snapshot = await readBackup(first);
    const destination = await externalDestination(second);
    // Non-recursive mkdir refuses an existing directory, preventing accidental overwrite.
    await mkdir(destination, { mode: 0o700 });
    if (snapshot.kind === 'database') {
      await writeJson(path.join(destination, 'ideas.json'), snapshot.ideas);
      await writeJson(path.join(destination, 'idea_files.json'), snapshot.idea_files);
      await writeFile(path.join(destination, 'schema.sql'), snapshot.schema_sql, { flag: 'wx', mode: 0o600 });
      const entries = [];
      for (const [index, object] of snapshot.objects.entries()) {
        const local_file = `object-${index}.bin`;
        await writeFile(path.join(destination, local_file), decodeBytes(object.data_base64), { flag: 'wx', mode: 0o600 });
        const { data_base64: bytes, ...metadata } = object;
        void bytes;
        entries.push({ ...metadata, local_file });
      }
      // local_file is only a local locator; preserve original locator in a separate exact snapshot.
      await writeJson(path.join(destination, 'objects.json'), entries);
    }
    await writeJson(path.join(destination, 'snapshot.json'), snapshot);
    console.log('Extracted verified plaintext into a new directory. No database or browser was modified. Protect the extracted directory.');
  } else throw new Error('Invalid command arguments; see scripts/vault/README.md');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Preservation command failed');
  process.exitCode = 1;
}
