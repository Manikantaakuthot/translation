/**
 * Seed test users for login and adding contacts.
 * Run from project root: npm run seed -w @msg/api
 * Or from apps/api: npm run seed
 *
 * Test credentials:
 * - phone: 6281516349, password: Test123 (Test User)
 * - phone: 9876543210, password: Test123 (Mani)
 * - phone: 9123456789, password: Test123 (Sarah)
 */
import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/msg';

const TEST_USERS = [
  { phone: '6281516349', name: 'Test User', countryCode: '+91' },
  { phone: '9876543210', name: 'Mani', countryCode: '+91' },
  { phone: '9123456789', name: 'Sarah', countryCode: '+91' },
  { phone: '8765432109', name: 'John', countryCode: '+91' },
  { phone: '7654321098', name: 'Priya', countryCode: '+91' },
  { phone: '6543210987', name: 'Rahul', countryCode: '+91' },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  const password = 'Test123';
  const passwordHash = await bcrypt.hash(password, 10);

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');

  for (const u of TEST_USERS) {
    // Build full phone the same way the register method does: countryCode + localNumber
    // e.g. countryCode="+91", phone="9876543210" → "919876543210"
    const cc = u.countryCode.replace(/^\+/, '');
    const fullPhone = u.phone.startsWith(cc) ? u.phone : cc + u.phone;

    await db.collection('users').updateOne(
      { phone: fullPhone },
      {
        $set: {
          phone: fullPhone,
          countryCode: u.countryCode,
          name: u.name,
          passwordHash,
          isOnline: false,
          isGuest: false,
        },
      },
      { upsert: true }
    );
  }

  console.log('✅ Test users created/updated:');
  TEST_USERS.forEach((u) => console.log(`   ${u.phone} - ${u.name} (password: Test123)`));
  console.log('   Use any of these to login. Search by name (e.g. "Mani") to add contacts.');
  await mongoose.disconnect();
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
