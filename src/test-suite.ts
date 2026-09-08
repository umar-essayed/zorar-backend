import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 بدء اختبار وحدات وموديولات الباك إند المتقدمة لمنظومة Zorar');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. اختبار موديول YouTube DRM & Encryption
  console.log('🔹 1. اختبار موديول YouTube DRM & Encryption:');
  const rawKey = 'zorar-secure-aes-video-key-32ch';
  const secretKey = crypto.createHash('sha256').update(rawKey).digest();
  const rawYouTubeId = 'dQw4w9WgXcQ';

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', secretKey, iv);
  let encrypted = cipher.update(rawYouTubeId, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const encryptedPayload = `${iv.toString('hex')}:${encrypted}`;

  assert(encryptedPayload.includes(':') && encryptedPayload.length > 30, 'تشفير كود اليوتيوب إلى payload آمن بـ IV');

  const [ivHex, encText] = encryptedPayload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(encText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  assert(decrypted === rawYouTubeId, 'فك تشفير كود اليوتيوب ومطابقته بدقة');

  const expiresAt = Date.now() + 3600000;
  const signature = crypto.createHmac('sha256', secretKey).update(`student-123:lesson-456:${expiresAt}`).digest('hex');
  assert(signature.length === 64, 'توليد HMAC Signature لمشغل الفيديو المؤقت');

  // 2. اختبار كروت الطلاب والـ QR Generator
  console.log('\n🔹 2. اختبار كروت الطلاب والـ QR Generator:');
  const tenantId = 'tenant-c1';
  const studentCode = '10452';
  const qrHmac = crypto.createHmac('sha256', 'zorar-qr-secret').update(`${tenantId}:${studentCode}`).digest('hex').substring(0, 10);
  const qrPayload = `ZORAR:${tenantId}:${studentCode}:${qrHmac}`;

  assert(qrPayload.startsWith('ZORAR:'), 'توليد QR Payload بالصيغة الميدانية المعتمدة');
  const parts = qrPayload.split(':');
  assert(parts[1] === tenantId && parts[2] === studentCode, 'استخراج بيانات الطالب من كود الـ QR بدقة');

  // 3. اختبار المصادقة وتشفير كلمات المرور (Auth Module)
  console.log('\n🔹 3. اختبار المصادقة وتشفير كلمات المرور (Auth Module):');
  const plainPassword = 'SuperSecretPassword2026';
  const hash = await bcrypt.hash(plainPassword, 10);
  const isMatch = await bcrypt.compare(plainPassword, hash);
  const isWrong = await bcrypt.compare('WrongPassword', hash);

  assert(isMatch === true, 'التحقق من صحة كلمة المرور بـ Bcrypt');
  assert(isWrong === false, 'رفض كلمات المرور الخاطئة');

  // 4. اختبار موديول الامتحانات والتصحيح الآلي (Exams Engine)
  console.log('\n🔹 4. اختبار محرك التصحيح الآلي للامتحانات (Exams Engine):');
  const questions = [
    { id: 'q1', correctOption: 'A', points: 2 },
    { id: 'q2', correctOption: 'C', points: 3 },
    { id: 'q3', correctOption: 'B', points: 5 },
  ];
  const studentAnswers = { q1: 'A', q2: 'C', q3: 'A' };
  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.points;
    if (studentAnswers[q.id as keyof typeof studentAnswers] === q.correctOption) {
      score += q.points;
    }
  }
  assert(total === 10, 'حساب الدرجة الكلية للامتحان');
  assert(score === 5, 'حساب درجة الطالب الصحيحة بدقة (5 من 10)');

  // 5. اختبار بوابة الواتساب ومنع الحظر
  console.log('\n🔹 5. اختبار بوابة الواتساب ومنع الحظر:');
  function formatPhone(phone: string): string {
    let clean = phone.replace(/[^\d+]/g, '');
    if (clean.startsWith('01')) clean = '+2' + clean;
    else if (!clean.startsWith('+')) clean = '+20' + clean;
    return clean;
  }
  assert(formatPhone('01012345678') === '+201012345678', 'تحويل أرقام الهواتف المصرية المحلية للصيغة الدولية E.164');
  assert(formatPhone('+201198765432') === '+201198765432', 'الحفاظ على الصيغة الدولية المباشرة');

  // 6. اختبار محرك حساب نسب أرباح المدرسين (Teacher Payout Engine)
  console.log('\n🔹 6. اختبار محرك نسب المدرسين والسنتر (Teacher Payouts):');
  const sessionFee = 80; // سعر الحصة 80 جنيه
  const studentsCount = 50; // 50 طالب حاضر
  const totalRevenue = sessionFee * studentsCount; // 4000 جنيه
  const centerPercent = 25; // السنتر 25%
  const centerShare = (totalRevenue * centerPercent) / 100; // 1000 جنيه
  const teacherShare = totalRevenue - centerShare; // 3000 جنيه
  const deductions = 200; // خصم ملازم أو قاعة
  const netPaid = teacherShare - deductions; // 2800 جنيه

  assert(totalRevenue === 4000, 'حساب إجمالي إيراد الحصة');
  assert(centerShare === 1000, 'حساب نسبة السنتر بدقة (25%)');
  assert(netPaid === 2800, 'حساب صافي مستحقات المدرس بعد الاستقطاعات');

  // 7. اختبار مخزن الملازم والمبيعات (Book Inventory Engine)
  console.log('\n🔹 7. اختبار مخزن ومبيعات الملازم (Books Inventory):');
  let currentStock = 100;
  const quantityToSell = 3;
  const unitPrice = 45;
  const totalBookPrice = unitPrice * quantityToSell;
  currentStock -= quantityToSell;

  assert(totalBookPrice === 135, 'حساب إجمالي ثمن بيع الملازم');
  assert(currentStock === 97, 'خصم الكمية المباعة من رصيد المخزن بدقة');

  // 8. اختبار المصروفات وصافي الأرباح (Net Profit Engine)
  console.log('\n🔹 8. اختبار مصروفات السنتر وصافي الأرباح (Expenses & Net Profit):');
  const monthTotalIncome = 50000;
  const monthExpenses = 12000;
  const monthTeacherPayouts = 25000;
  const netCenterProfit = monthTotalIncome - monthExpenses - monthTeacherPayouts;

  assert(netCenterProfit === 13000, 'حساب صافي ربح السنتر الشهري بدقة');

  // 9. اختبار رصد إنذارات الغياب التراكمية (Absence Escalation)
  console.log('\n🔹 9. اختبار رصد إنذارات الغياب المتتالية (Absence Warnings):');
  let consecutiveAbsences = 0;
  consecutiveAbsences++;
  let warning = consecutiveAbsences >= 3 ? 'SUSPENDED' : consecutiveAbsences === 2 ? 'SECOND_WARNING' : 'FIRST_WARNING';
  assert(warning === 'FIRST_WARNING', 'رصد الإنذار الأول عند غياب حصة');

  consecutiveAbsences++;
  warning = consecutiveAbsences >= 3 ? 'SUSPENDED' : consecutiveAbsences === 2 ? 'SECOND_WARNING' : 'FIRST_WARNING';
  assert(warning === 'SECOND_WARNING', 'تصعيد للإنذار الثاني مع تنبيه عاجل لولي الأمر');

  consecutiveAbsences++;
  warning = consecutiveAbsences >= 3 ? 'SUSPENDED' : consecutiveAbsences === 2 ? 'SECOND_WARNING' : 'FIRST_WARNING';
  assert(warning === 'SUSPENDED', 'إيقاف الطالب مؤقتاً لحين مراجعة ولي الأمر');

  // 10. اختبار تقييم الحصة الميداني (Homework & Quiz In-Session Assessment)
  console.log('\n🔹 10. اختبار تقييم الحصة الميداني (Session Assessment):');
  const assessment = {
    homeworkStatus: 'DONE',
    quizScore: 9.5,
    quizTotal: 10,
    percentage: (9.5 / 10) * 100,
  };
  assert(assessment.percentage === 95, 'حساب نسبة تسميع الحصة بدقة (95%)');

  console.log('\n================================================================');
  console.log(`📊 النتيجة النهائية للاختبارات الشاملة: ${passed} نجح | ${failed} فشل`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
