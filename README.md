# نبض · Nabd

منصّة ويب مفتوحة لأي مستشفى، بتربط كل أقسام المستشفى وموظفيه ومرضاه بنظام واحد لحظي.
أي مدير بيقدر يسجّل ويبني مستشفاه على المنصة، وكل مستشفى بيشتغل بمعزل عن الباقي.

> An open, multi-hospital web platform that connects every department, staff member and patient
> in one real-time system. Each hospital is fully isolated by `hospitalId`.

---

## هيكل المستودع · Repository layout

```
nabd/
├── client/            # الواجهة: React + TypeScript (Vite) + Tailwind + React Router
│   └── src/
│       ├── app/       # الراوتر والإعدادات العامة
│       ├── layouts/   # هياكل الصفحات
│       └── pages/     # الصفحات
├── shared/            # @nabd/shared: قواعد التحقق (Zod) والثوابت المشتركة بين الواجهة والسيرفر
├── server/            # الباك إند: Node.js + Express + TypeScript + Prisma
│   └── src/
│       ├── routes/      # تعريف الروابط
│       ├── controllers/ # استقبال الطلب والرد
│       ├── services/    # منطق العمل والوصول للبيانات
│       └── middleware/  # الأخطاء والصلاحيات
├── eslint.config.js   # إعداد ESLint موحّد للمجلدين
├── .prettierrc.json   # إعداد Prettier
└── package.json       # npm workspaces
```

المستودع بيستخدم **npm workspaces**: أمر `npm install` واحد من الجذر بينزّل اعتماديات المجلدات التلاتة.
بالواجهة، الاختصار `@/` بيأشّر على `client/src`.

## التقنيات · Tech stack

| الجزء              | التقنية                                               |
| ------------------ | ----------------------------------------------------- |
| الواجهة            | React + TypeScript (Vite), Tailwind CSS, React Router |
| الأنيميشن والرسائل | Framer Motion, Sonner                                 |
| البيانات والحالة   | Axios, TanStack Query, Zustand                        |
| الفورمات والتحقق   | React Hook Form + Zod                                 |
| الترجمة            | i18next (العربي والإنكليزي، RTL/LTR)                  |
| السيرفر            | Node.js + Express + TypeScript                        |
| قاعدة البيانات     | PostgreSQL + Prisma                                   |
| الدخول             | JWT + bcrypt                                          |
| اللحظي             | Socket.io                                             |
| الملفات            | Multer                                                |

## المتطلبات · Requirements

- Node.js 20 أو أحدث (`.nvmrc`)
- npm 10 أو أحدث
- PostgreSQL 15 أو أحدث

## البدء · Getting started

```bash
npm install                          # بيولّد Prisma Client كمان
cp server/.env.example server/.env   # وعدّل DATABASE_URL حسب PostgreSQL عندك
npm run db:migrate -w server         # إنشاء الجداول
npm run db:seed -w server            # مستشفى تجريبي ومدير
npm run dev:client   # الواجهة على http://localhost:5173 (صفحة الدخول: /login)
npm run dev:server   # السيرفر على http://localhost:4000 (فحص: /api/health)
```

قبل التشغيل لازم تعمل قاعدتين بيانات فاضيتين بـ PostgreSQL: `nabd` للتطوير و`nabd_test` للتستات (التستات بتبني جداولها لحالها):

```bash
psql -U postgres -c "CREATE DATABASE nabd;"
psql -U postgres -c "CREATE DATABASE nabd_test;"
```

وبملف `server/.env` لازم تحط `JWT_ACCESS_SECRET` عشوائي (32 حرف أو أكتر)، والطريقة مكتوبة بـ `.env.example`.

**الحسابات التجريبية:** بعد `npm run db:seed` في حساب لكل دور، وكلمة السر لكلهن `Admin@12345` (بتتغيّر من `SEED_PASSWORD`):
`admin@nabd.demo`، `doctor@nabd.demo`، `nurse@nabd.demo`، `pharmacist@nabd.demo`، `lab@nabd.demo`، `radiology@nabd.demo`، `cleaner@nabd.demo`، `reception@nabd.demo`، `accountant@nabd.demo`، `patient@nabd.demo`. وبوقت التطوير صفحة الدخول فيها أزرار للدخول بأي واحد منهن.

السيرفر بيفحص الاتصال بقاعدة البيانات أول ما يشتغل، وإذا ما قدر يوصل بيوقف برسالة واضحة.

## الأوامر · Scripts

| الأمر                           | الوظيفة                               |
| ------------------------------- | ------------------------------------- |
| `npm run dev:client`            | تشغيل الواجهة                         |
| `npm run dev:server`            | تشغيل السيرفر                         |
| `npm run build:client`          | بناء الواجهة للإنتاج                  |
| `npm test -w server`            | تشغيل تستات السيرفر                   |
| `npm run db:migrate -w server`  | تطبيق تغييرات الـ schema على القاعدة  |
| `npm run db:seed -w server`     | تعبئة بيانات تجريبية                  |
| `npm run db:reset -w server`    | مسح القاعدة وإعادة بنائها مع الـ seed |
| `npm run db:generate -w server` | إعادة توليد Prisma Client             |
| `npm run db:studio -w server`   | فتح Prisma Studio لتصفّح البيانات     |
| `npm run lint`                  | فحص كل الكود بـ ESLint                |
| `npm run lint:fix`              | فحص وإصلاح تلقائي                     |
| `npm run format`                | تنسيق كل الملفات بـ Prettier          |
| `npm run format:check`          | التأكد إن كل الملفات منسّقة           |

## الـ API

| الرابط                                         | الوظيفة                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/health`                              | فحص إن السيرفر شغّال                                                                    |
| `POST /api/auth/login`                         | دخول بالإيميل وكلمة السر (و`hospitalId` إذا الإيميل موجود بأكتر من مستشفى)              |
| `POST /api/auth/register`                      | تسجيل مستشفى جديد مع مديره، والمدير بيدخل مباشرة                                        |
| `POST /api/auth/refresh`                       | توكن دخول جديد من توكن التجديد (بالكوكي)، والتوكن القديم بيتلغى                         |
| `POST /api/auth/logout`                        | تسجيل الخروج وإلغاء توكن التجديد                                                        |
| `GET /api/me`                                  | المستخدم الحالي (بدها توكن)                                                             |
| `PATCH /api/me/preferences`                    | حفظ لغة المستخدم ووضع العرض بحسابه (بدها توكن)                                          |
| `GET /api/hospital`                            | معلومات مستشفى المستخدم (لأي حدا مسجّل دخول)                                            |
| `PATCH /api/hospital`                          | تعديل معلومات المستشفى (المدير بس)                                                      |
| `GET /api/hospital/logo`                       | شعار المستشفى (بس لموظفين ومرضى نفس المستشفى)                                           |
| `PUT /api/hospital/logo`                       | رفع الشعار أو تبديله: PNG أو JPG أو WebP حتى 2 ميغا، وبينفحص نوعه من محتواه (المدير بس) |
| `DELETE /api/hospital/logo`                    | إزالة الشعار (المدير بس)                                                                |
| `GET /api/departments`                         | أقسام المستشفى مع عدد الغرف والموظفين (لأي حدا مسجّل دخول)                              |
| `POST /api/departments/defaults`               | إضافة الأقسام الافتراضية الـ 12 الناقصة بكبسة وحدة (المدير بس)                          |
| `POST /api/departments`                        | قسم خاص جديد، والاسم ما بيتكرر بنفس المستشفى (المدير بس)                                |
| `PATCH /api/departments/:id`                   | تعديل اسم قسم خاص (المدير بس)                                                           |
| `DELETE /api/departments/:id`                  | حذف قسم ما فيه غرف ولا موظفين (المدير بس)                                               |
| `GET /api/rooms?departmentId=`                 | غرف القسم مع أسرّتها وحالاتها (لأي حدا مسجّل دخول)                                      |
| `POST /api/rooms`                              | غرفة جديدة مع عدد أسرّتها (0 لـ 20) (المدير بس)                                         |
| `PATCH` و`DELETE /api/rooms/:id`               | تعديل رقم الغرفة وطابقها، أو حذفها إذا ما فيها مرضى (المدير بس)                         |
| `POST /api/rooms/:id/beds`                     | إضافة سرير بأصغر رقم فاضي (المدير بس)                                                   |
| `PATCH /api/beds/:id`                          | إخراج السرير من الخدمة أو إرجاعه (المدير بس)                                            |
| `DELETE /api/beds/:id`                         | حذف سرير ما عليه مريض (المدير بس)                                                       |
| `GET /api/operating-rooms`                     | غرف العمليات وحالة كل وحدة (لأي حدا مسجّل دخول)                                         |
| `POST` و`PATCH` و`DELETE /api/operating-rooms` | إضافة غرفة عمليات، وتعديل اسمها، وحذفها إذا كانت فاضية (المدير بس)                      |
| `PATCH /api/operating-rooms/:id/service`       | إخراج الغرفة من الخدمة للصيانة أو إرجاعها (المدير بس)                                   |

- توكن الدخول (JWT) عمره 15 دقيقة وبينبعت بـ `Authorization: Bearer`. توكن التجديد عمره 30 يوم، بكوكي `httpOnly` ما بتقدر تقراه الصفحة، وبينحفظ منه بس الـ hash.
- كل خطأ بيرجع بالشكل `{ "error": { "code": "...", "message": "..." } }`. الرسالة بلغة المستخدم حسب `Accept-Language`، والـ `code` ثابت للبرمجة.
- بالواجهة كل الطلبات بتمرق من `api` بـ `client/src/lib/api.ts`: بيضيف التوكن واللغة، وبيجدد الجلسة ويعيد الطلب لحاله، وبيطلّع توست للأخطاء (إلا إذا بعتنا `skipErrorToast`). عنوان السيرفر بـ `VITE_API_URL` (شوف `client/.env.example`).
- بيانات السيرفر بالواجهة بتنجاب بـ TanStack Query (`useQuery` فوق `api`)، والمستخدم الحالي من `useSessionStore`. الجلسة بترجع لحالها بعد إعادة التحميل من كوكي التجديد، ولغة المستخدم ووضع العرض بينحفظوا بحسابه.

## قواعد الكود · Conventions

- كل الكود TypeScript بوضع `strict`.
- كل قاعدة تحقق (فورم أو body طلب) بتنكتب مرة وحدة بـ `shared/src/schemas` بـ Zod، والواجهة والسيرفر بيستعملوا نفس الـ schema. رسائل الأخطاء فيها مفاتيح ترجمة (`validation.*`)، وكل مفتاح جديد لازم ينضاف لـ `VALIDATION_KEYS` وللترجمات.
- ما في نص مكتوب مباشرة بالواجهة: كل النصوص بـ `client/src/i18n/locales/ar.ts` و`en.ts`. الملفين لازم يكون فيهن نفس المفاتيح، وإذا نقص مفتاح من وحدة منهن البناء بيفشل.
- الاتجاه بيتقلب لحاله مع اللغة: استعمل `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-` بدل `ml-`/`mr-`/`left-`/`right-`، والأيقونات يلي إلها اتجاه (أسهم) بتاخد `rtl:-scale-x-100`.
- كل جدول (ما عدا `Hospital`) فيه `hospitalId`، وكل استعلام بيتقيّد فيه: الروابط يلي بدها دخول بتمرق من `authenticate` (و`requireRole` للأدوار)، وبتستعلم عن طريق `req.db` بس، وهي نسخة Prisma بتضيف مستشفى المستخدم لحالها لكل قراءة وكتابة. الـ `prisma` العادي ممنوع بالروابط المحمية.
- مكوّنات الواجهة الأساسية بـ `client/src/components/ui` (زر، حقل، قائمة، جدول، كرت، نافذة، شارة). استعملها بدل ما تكتب عناصر جديدة، وشوفها كلها على `/dev/ui` وقت التطوير.
- الحركة: كل انتقال CSS بياخد منحنى `--ease-calm` تلقائياً، وبـ Framer Motion استعمل `calm` و`calmSpring` و`enter()` من `client/src/lib/motion.ts`، مشان تضل كل الحركات بنفس الإحساس الهادي. وإعداد "تقليل الحركة" بالجهاز بيوقّفها كلها.
- الأصوات: الرسائل منطلعها بـ `notify` من `client/src/lib/notify.ts` (توست مع صوته)، والأصوات لحالها بـ `playSound` من `client/src/lib/sound.ts`. الأصوات مولّدة بالكود (Web Audio) وبتحترم إعدادات المستخدم.
- الألوان من متغيرات الهوية بـ `client/src/index.css` بس (`bg-surface`، `text-muted`، `bg-danger`...)، وما في كود hex بالمكوّنات، مشان الوضع الداكن يشتغل لحاله.
- كل صفحة لازم تشتغل من عرض 320px (موبايل) لحد الشاشات الكبيرة، بلا تمرير أفقي. منبلّش بتصميم الموبايل وبعدين منكبّر بـ `sm:` و`md:` و`lg:`.
- المحرّر بينسّق تلقائياً عند الحفظ، وPrettier بيرتّب كلاسات Tailwind (إعدادات `.vscode` مرفقة).

## مراحل التنفيذ · Roadmap

1. **الأساس ولوحة المدير**: هيكل المشروع، الهوية، الدخول، بناء المستشفى والموظفين.
2. **قلب المشروع**: الإسعاف، تقييم ESI، استدعاء الطبيب، غرف العمليات والتعقيم، الإشعارات اللحظية.
3. **الخدمات الطبية**: المخبر، الأشعة، الصيدلية، المخزون، الاستشارات، الأسرّة، المواعيد، لوحة المريض.
4. **الإدارة والمالية**: الاستقبال، المحاسب، الفواتير، الغياب والشراء، الشكاوي، الاجتماعات، الربح، سجل النشاطات.
