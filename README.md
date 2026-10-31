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
├── server/            # الباك إند: Node.js + Express + TypeScript + Prisma
├── eslint.config.js   # إعداد ESLint موحّد للمجلدين
├── .prettierrc.json   # إعداد Prettier
└── package.json       # npm workspaces
```

المستودع بيستخدم **npm workspaces**: أمر `npm install` واحد من الجذر بينزّل اعتماديات المجلدين.
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
- PostgreSQL 15 أو أحدث (من التاسك 1.4)

## البدء · Getting started

```bash
npm install
npm run dev:client   # الواجهة على http://localhost:5173
npm run dev:server   # السيرفر (بعد التاسك 1.3)
```

## الأوامر · Scripts

| الأمر                  | الوظيفة                      |
| ---------------------- | ---------------------------- |
| `npm run dev:client`   | تشغيل الواجهة                |
| `npm run dev:server`   | تشغيل السيرفر                |
| `npm run build:client` | بناء الواجهة للإنتاج         |
| `npm run lint`         | فحص كل الكود بـ ESLint       |
| `npm run lint:fix`     | فحص وإصلاح تلقائي            |
| `npm run format`       | تنسيق كل الملفات بـ Prettier |
| `npm run format:check` | التأكد إن كل الملفات منسّقة  |

## قواعد الكود · Conventions

- كل الكود TypeScript بوضع `strict`.
- ما في نص مكتوب مباشرة بالواجهة: كل النصوص بملفات الترجمة (`ar` و`en`) من التاسك 1.11.
- كل جدول (ما عدا `Hospital`) فيه `hospitalId`، وكل استعلام بيتقيّد فيه.
- المحرّر بينسّق تلقائياً عند الحفظ، وPrettier بيرتّب كلاسات Tailwind (إعدادات `.vscode` مرفقة).

## مراحل التنفيذ · Roadmap

1. **الأساس ولوحة المدير**: هيكل المشروع، الهوية، الدخول، بناء المستشفى والموظفين.
2. **قلب المشروع**: الإسعاف، تقييم ESI، استدعاء الطبيب، غرف العمليات والتعقيم، الإشعارات اللحظية.
3. **الخدمات الطبية**: المخبر، الأشعة، الصيدلية، المخزون، الاستشارات، الأسرّة، المواعيد، لوحة المريض.
4. **الإدارة والمالية**: الاستقبال، المحاسب، الفواتير، الغياب والشراء، الشكاوي، الاجتماعات، الربح، سجل النشاطات.
