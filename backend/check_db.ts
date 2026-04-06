import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // All attendance logs came from device 1 (Main Entrance Biometric) based on audit logs
  const DEVICE_ID = 1;

  // 1. Backfill AttendanceLog.deviceId
  const logResult = await p.attendanceLog.updateMany({
    where: { deviceId: null },
    data: { deviceId: DEVICE_ID }
  });
  console.log(`Backfilled ${logResult.count} AttendanceLog records with deviceId=${DEVICE_ID}`);

  // 2. Backfill Attendance.checkInDeviceId for records that came from biometric
  //    (records with id >= 10 are from biometric logs, 1-9 are from seed data)
  const attResult = await p.attendance.updateMany({
    where: { checkInDeviceId: null },
    data: { checkInDeviceId: DEVICE_ID }
  });
  console.log(`Backfilled ${attResult.count} Attendance records with checkInDeviceId=${DEVICE_ID}`);

  // 3. Also backfill checkOutDeviceId where checkOutTime exists
  const attOutResult = await p.attendance.updateMany({
    where: { 
      checkOutDeviceId: null,
      checkOutTime: { not: null }
    },
    data: { checkOutDeviceId: DEVICE_ID }
  });
  console.log(`Backfilled ${attOutResult.count} Attendance records with checkOutDeviceId=${DEVICE_ID}`);

  // Verify
  const verify = await p.attendance.findMany({
    select: { id: true, checkInDeviceId: true, checkOutDeviceId: true },
    orderBy: { id: 'desc' },
    take: 5
  });
  console.log('Verification:', JSON.stringify(verify));

  await p.$disconnect();
}

main();
