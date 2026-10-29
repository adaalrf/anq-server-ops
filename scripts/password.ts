import { hashPassword } from '../src/server/auth.js';
// Read via stdin so plaintext does not enter shell history or process arguments.
let input = '';
for await (const chunk of process.stdin) input += chunk;
console.log(await hashPassword(input.replace(/\r?\n$/, '')));
