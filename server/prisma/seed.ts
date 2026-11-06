// Seeds the demo hospital (`npm run db:seed`). Safe to run more than once:
// people are reused and the activity is added only once (see demo.ts).
import { prisma } from '../src/lib/prisma.js';
import { DEMO_USERS, PASSWORD, seedDemo } from './demo.js';
import { PHASE_TWO_ACCOUNTS } from './seedPhaseTwo.js';

try {
  const { hospital, activity } = await seedDemo();
  console.info(`Hospital: ${hospital.name} (${hospital.id})`);
  console.info(`Demo accounts (password ${PASSWORD}):`);
  for (const { role, email } of DEMO_USERS) console.info(`  ${role.padEnd(15)} ${email}`);
  console.info(
    `  + ${PHASE_TWO_ACCOUNTS.length} department team accounts:` +
      ' dr.<dept>.<n>, rn.<dept>.<n>, cl.<dept>.<n> @nabd.demo' +
      ' (dept: er, or, internal, neuro, ortho, cardio, plastic, eye, gyn, lab, radiology, pharmacy)',
  );
  console.info(
    activity
      ? 'ER, operating rooms and cleaning activity added.'
      : 'Activity already there, left as is.',
  );
} finally {
  await prisma.$disconnect();
}
