# توثيق الـ API · API reference

> هالملف بينكتب لحالو من الكود (`npm run docs:api -w server`)، فهو دايماً مطابق للسيرفر. 181 رابط.

- **العنوان الأساسي:** `http://localhost:4000/api` بالتطوير، أو عنوان السيرفر أونلاين.
- **الدخول:** `POST /api/auth/login` بيرجّع `accessToken` (صالح 15 دقيقة) بينبعت بكل طلب بـ `Authorization: Bearer <token>`. توكن التجديد بكوكي `httpOnly`، و`POST /api/auth/refresh` بيعطي توكن جديد.
- **العزل:** كل طلب بيشوف بس بيانات مستشفى المستخدم، مهما كانت الأرقام بالرابط.
- **الأخطاء:** كلها بالشكل `{ "error": { "code": "...", "message": "..." } }`؛ الرسالة بلغة `Accept-Language` والـ `code` ثابت.
- **اللحظي:** Socket.io على نفس العنوان؛ السيرفر بيبعت `notification` و`refresh` (مفاتيح لإعادة جلب البيانات).

## فحص السيرفر · `/api/health`

هل السيرفر شغّال.

| الطريقة | الرابط        | مين بيقدر       |
| ------- | ------------- | --------------- |
| `GET`   | `/api/health` | بدون تسجيل دخول |

## الدخول والحسابات · `/api/auth`

تسجيل الدخول والخروج، تجديد الجلسة، تسجيل مستشفى أو مريض.

| الطريقة | الرابط                       | مين بيقدر       |
| ------- | ---------------------------- | --------------- |
| `POST`  | `/api/auth/login`            | بدون تسجيل دخول |
| `POST`  | `/api/auth/register`         | بدون تسجيل دخول |
| `POST`  | `/api/auth/register/patient` | بدون تسجيل دخول |
| `POST`  | `/api/auth/refresh`          | بدون تسجيل دخول |
| `POST`  | `/api/auth/logout`           | بدون تسجيل دخول |

## صفحات عامة · `/api/public`

قائمة المستشفيات ليختار منها المريض عند التسجيل.

| الطريقة | الرابط                  | مين بيقدر       |
| ------- | ----------------------- | --------------- |
| `GET`   | `/api/public/hospitals` | بدون تسجيل دخول |

## حسابي · `/api/me`

المستخدم الحالي، تفضيلاته، وأرقام صفحته الرئيسية.

| الطريقة | الرابط                | مين بيقدر       |
| ------- | --------------------- | --------------- |
| `GET`   | `/api/me`             | أي مستخدم مسجّل |
| `PATCH` | `/api/me/preferences` | أي مستخدم مسجّل |
| `GET`   | `/api/me/home`        | أي مستخدم مسجّل |

## المستشفى · `/api/hospital`

معلومات المستشفى وشعاره.

| الطريقة  | الرابط               | مين بيقدر       |
| -------- | -------------------- | --------------- |
| `GET`    | `/api/hospital`      | أي مستخدم مسجّل |
| `PATCH`  | `/api/hospital`      | المدير          |
| `GET`    | `/api/hospital/logo` | أي مستخدم مسجّل |
| `PUT`    | `/api/hospital/logo` | المدير          |
| `DELETE` | `/api/hospital/logo` | المدير          |

## الأقسام · `/api/departments`

أقسام المستشفى ورؤساؤها.

| الطريقة  | الرابط                                 | مين بيقدر       |
| -------- | -------------------------------------- | --------------- |
| `GET`    | `/api/departments`                     | أي مستخدم مسجّل |
| `POST`   | `/api/departments`                     | المدير          |
| `POST`   | `/api/departments/defaults`            | المدير          |
| `PATCH`  | `/api/departments/:id`                 | المدير          |
| `DELETE` | `/api/departments/:id`                 | المدير          |
| `GET`    | `/api/departments/:id/head-candidates` | المدير          |
| `PUT`    | `/api/departments/:id/head`            | المدير          |

## الغرف · `/api/rooms`

الغرف والأسرّة وحالاتها.

| الطريقة  | الرابط                | مين بيقدر       |
| -------- | --------------------- | --------------- |
| `GET`    | `/api/rooms`          | أي مستخدم مسجّل |
| `POST`   | `/api/rooms`          | المدير          |
| `PATCH`  | `/api/rooms/:id`      | المدير          |
| `DELETE` | `/api/rooms/:id`      | المدير          |
| `POST`   | `/api/rooms/:id/beds` | المدير          |

## الأسرّة · `/api/beds`

خريطة الأسرّة وسجل كل سرير.

| الطريقة  | الرابط                  | مين بيقدر              |
| -------- | ----------------------- | ---------------------- |
| `GET`    | `/api/beds/map`         | المدير، الطبيب، الممرض |
| `PATCH`  | `/api/beds/:id`         | المدير                 |
| `GET`    | `/api/beds/:id/history` | المدير، الممرض         |
| `DELETE` | `/api/beds/:id`         | المدير                 |

## غرف العمليات · `/api/operating-rooms`

الغرف وحالاتها ومراحلها.

| الطريقة  | الرابط                                | مين بيقدر              |
| -------- | ------------------------------------- | ---------------------- |
| `GET`    | `/api/operating-rooms`                | أي مستخدم مسجّل        |
| `GET`    | `/api/operating-rooms/me`             | أي مستخدم مسجّل        |
| `GET`    | `/api/operating-rooms/board`          | أي مستخدم مسجّل        |
| `GET`    | `/api/operating-rooms/live`           | المدير، الطبيب، الممرض |
| `POST`   | `/api/operating-rooms`                | المدير                 |
| `PATCH`  | `/api/operating-rooms/:id`            | المدير                 |
| `PATCH`  | `/api/operating-rooms/:id/service`    | المدير                 |
| `GET`    | `/api/operating-rooms/:id/history`    | المدير، الطبيب، الممرض |
| `POST`   | `/api/operating-rooms/:id/transition` | أي مستخدم مسجّل        |
| `DELETE` | `/api/operating-rooms/:id`            | المدير                 |

## الموظفون · `/api/staff`

الحسابات والأدوار، ودوام الأطباء وإجازاتهم.

| الطريقة  | الرابط                                 | مين بيقدر |
| -------- | -------------------------------------- | --------- |
| `GET`    | `/api/staff`                           | المدير    |
| `POST`   | `/api/staff`                           | المدير    |
| `PATCH`  | `/api/staff/:id`                       | المدير    |
| `DELETE` | `/api/staff/:id`                       | المدير    |
| `GET`    | `/api/staff/:id/schedule`              | المدير    |
| `PUT`    | `/api/staff/:id/schedule`              | المدير    |
| `POST`   | `/api/staff/:id/vacations`             | المدير    |
| `DELETE` | `/api/staff/:id/vacations/:vacationId` | المدير    |

## توزيع الفرق · `/api/assignments`

المنظفون على الأقسام.

| الطريقة | الرابط                          | مين بيقدر |
| ------- | ------------------------------- | --------- |
| `GET`   | `/api/assignments`              | المدير    |
| `PUT`   | `/api/assignments/nurses/:id`   | المدير    |
| `PUT`   | `/api/assignments/cleaners/:id` | المدير    |

## الإشعارات · `/api/notifications`

إشعارات المستخدم وقراءتها.

| الطريقة | الرابط                        | مين بيقدر       |
| ------- | ----------------------------- | --------------- |
| `GET`   | `/api/notifications`          | أي مستخدم مسجّل |
| `PATCH` | `/api/notifications/:id/read` | أي مستخدم مسجّل |
| `POST`  | `/api/notifications/read-all` | أي مستخدم مسجّل |

## الأطباء · `/api/doctors`

مرضى الطبيب وملفاتهم، الاستدعاءات، الاستشارات، الدوام.

| الطريقة  | الرابط                                              | مين بيقدر |
| -------- | --------------------------------------------------- | --------- |
| `GET`    | `/api/doctors/me/status`                            | الطبيب    |
| `PATCH`  | `/api/doctors/me/status`                            | الطبيب    |
| `GET`    | `/api/doctors/me/schedule`                          | الطبيب    |
| `PUT`    | `/api/doctors/me/visit-length`                      | الطبيب    |
| `GET`    | `/api/doctors/me/patients`                          | الطبيب    |
| `GET`    | `/api/doctors/me/patients/:patientId`               | الطبيب    |
| `POST`   | `/api/doctors/me/patients/:patientId/reports`       | الطبيب    |
| `POST`   | `/api/doctors/me/patients/:patientId/prescriptions` | الطبيب    |
| `POST`   | `/api/doctors/me/patients/:patientId/lab-tests`     | الطبيب    |
| `DELETE` | `/api/doctors/me/lab-tests/:id`                     | الطبيب    |
| `POST`   | `/api/doctors/me/patients/:patientId/imaging`       | الطبيب    |
| `DELETE` | `/api/doctors/me/imaging/:id`                       | الطبيب    |
| `GET`    | `/api/doctors/me/colleagues`                        | الطبيب    |
| `POST`   | `/api/doctors/me/patients/:patientId/consultations` | الطبيب    |
| `DELETE` | `/api/doctors/me/consultations/:id`                 | الطبيب    |
| `GET`    | `/api/doctors/me/consultations/:id/file`            | الطبيب    |
| `POST`   | `/api/doctors/me/consultations/:id/reply`           | الطبيب    |
| `GET`    | `/api/doctors/me/consultations`                     | الطبيب    |
| `GET`    | `/api/doctors/me/calls`                             | الطبيب    |
| `POST`   | `/api/doctors/me/calls/:id/accept`                  | الطبيب    |
| `POST`   | `/api/doctors/me/calls/:id/decline`                 | الطبيب    |

## الإسعاف · `/api/er`

التسجيل السريع، تقييم الخطورة، قائمة الانتظار، استدعاء الطبيب، التحويل.

| الطريقة  | الرابط                             | مين بيقدر |
| -------- | ---------------------------------- | --------- |
| `GET`    | `/api/er/me`                       | الممرض    |
| `POST`   | `/api/er/visits`                   | الممرض    |
| `GET`    | `/api/er/queue`                    | الممرض    |
| `GET`    | `/api/er/visits/:id`               | الممرض    |
| `PUT`    | `/api/er/visits/:id/triage`        | الممرض    |
| `PUT`    | `/api/er/visits/:id/level`         | الممرض    |
| `GET`    | `/api/er/doctors`                  | الممرض    |
| `POST`   | `/api/er/visits/:id/calls`         | الممرض    |
| `DELETE` | `/api/er/visits/:id/calls/:callId` | الممرض    |
| `PUT`    | `/api/er/visits/:id/status`        | الممرض    |
| `POST`   | `/api/er/visits/:id/transfer`      | الممرض    |
| `POST`   | `/api/er/visits/:id/discharge`     | الممرض    |

## حجوزات العمليات · `/api/bookings`

حجز غرف العمليات وتأجيلها.

| الطريقة  | الرابط                    | مين بيقدر              |
| -------- | ------------------------- | ---------------------- |
| `GET`    | `/api/bookings`           | الطبيب، الممرض، المدير |
| `GET`    | `/api/bookings/mine`      | الطبيب                 |
| `POST`   | `/api/bookings`           | الطبيب                 |
| `POST`   | `/api/bookings/emergency` | الطبيب، الممرض         |
| `PATCH`  | `/api/bookings/:id`       | الطبيب                 |
| `DELETE` | `/api/bookings/:id`       | الطبيب                 |

## التنظيف والتعقيم · `/api/cleaning-requests`

طلبات التنظيف ومهام المنظفين.

| الطريقة  | الرابط                              | مين بيقدر |
| -------- | ----------------------------------- | --------- |
| `GET`    | `/api/cleaning-requests`            | المنظف    |
| `POST`   | `/api/cleaning-requests/:id/start`  | المنظف    |
| `POST`   | `/api/cleaning-requests/:id/finish` | المنظف    |
| `GET`    | `/api/cleaning-requests/department` | الممرض    |
| `POST`   | `/api/cleaning-requests`            | الممرض    |
| `DELETE` | `/api/cleaning-requests/:id`        | الممرض    |

## المخزون · `/api/inventory`

مخزون الصيدلية والمخبر والأشعة وحركته.

| الطريقة | الرابط                         | مين بيقدر       |
| ------- | ------------------------------ | --------------- |
| `GET`   | `/api/inventory`               | أي مستخدم مسجّل |
| `POST`  | `/api/inventory`               | أي مستخدم مسجّل |
| `PATCH` | `/api/inventory/:id`           | أي مستخدم مسجّل |
| `GET`   | `/api/inventory/:id/movements` | أي مستخدم مسجّل |
| `POST`  | `/api/inventory/:id/movements` | أي مستخدم مسجّل |

## المخبر · `/api/lab-tests`

طلبات التحاليل ونتائجها.

| الطريقة | الرابط                      | مين بيقدر       |
| ------- | --------------------------- | --------------- |
| `GET`   | `/api/lab-tests`            | المخبري         |
| `POST`  | `/api/lab-tests/:id/start`  | المخبري         |
| `POST`  | `/api/lab-tests/:id/result` | المخبري         |
| `GET`   | `/api/lab-tests/:id/file`   | أي مستخدم مسجّل |

## الأشعة · `/api/imaging`

طلبات الصور وتقاريرها.

| الطريقة | الرابط                           | مين بيقدر       |
| ------- | -------------------------------- | --------------- |
| `GET`   | `/api/imaging`                   | فني الأشعة      |
| `GET`   | `/api/imaging/staffed`           | الطبيب، المدير  |
| `POST`  | `/api/imaging/:id/start`         | فني الأشعة      |
| `POST`  | `/api/imaging/:id/report`        | فني الأشعة      |
| `GET`   | `/api/imaging/:id/images/:index` | أي مستخدم مسجّل |

## الصيدلية · `/api/pharmacy`

الوصفات وصرفها.

| الطريقة | الرابط                                     | مين بيقدر |
| ------- | ------------------------------------------ | --------- |
| `GET`   | `/api/pharmacy/prescriptions`              | الصيدلي   |
| `POST`  | `/api/pharmacy/prescriptions/:id/dispense` | الصيدلي   |

## تقارير الأقسام · `/api/reports`

تقارير الصيدلية والمحاسب للمدير.

| الطريقة | الرابط                 | مين بيقدر                |
| ------- | ---------------------- | ------------------------ |
| `GET`   | `/api/reports/preview` | الصيدلي، المحاسب، المدير |
| `POST`  | `/api/reports`         | الصيدلي، المحاسب، المدير |
| `GET`   | `/api/reports`         | الصيدلي، المحاسب، المدير |
| `GET`   | `/api/reports/:id`     | الصيدلي، المحاسب، المدير |

## أسرّة القسم · `/api/ward`

قبول المرضى بالقسم ونقلهم وتخريجهم.

| الطريقة | الرابط                          | مين بيقدر |
| ------- | ------------------------------- | --------- |
| `GET`   | `/api/ward/board`               | الممرض    |
| `GET`   | `/api/ward/patients`            | الممرض    |
| `POST`  | `/api/ward/admissions`          | الممرض    |
| `POST`  | `/api/ward/stays/:id/move`      | الممرض    |
| `POST`  | `/api/ward/stays/:id/discharge` | الممرض    |
| `POST`  | `/api/ward/beds/:id/status`     | الممرض    |

## المواعيد · `/api/appointments`

المواعيد المتاحة والحجز والإلغاء.

| الطريقة  | الرابط                                 | مين بيقدر                         |
| -------- | -------------------------------------- | --------------------------------- |
| `GET`    | `/api/appointments/slots`              | المريض، الاستقبال، المدير، الطبيب |
| `POST`   | `/api/appointments`                    | المريض، الاستقبال، المدير         |
| `GET`    | `/api/appointments/departments`        | المريض، الاستقبال، المدير         |
| `GET`    | `/api/appointments/doctors`            | المريض، الاستقبال، المدير         |
| `GET`    | `/api/appointments/mine`               | المريض                            |
| `GET`    | `/api/appointments/day`                | الاستقبال، المدير                 |
| `GET`    | `/api/appointments/patient/:patientId` | الاستقبال، المدير                 |
| `DELETE` | `/api/appointments/:id`                | المريض، الاستقبال، المدير         |

## الإجازات · `/api/leave`

طلبات الإجازة لكل الموظفين.

| الطريقة  | الرابط            | مين بيقدر             |
| -------- | ----------------- | --------------------- |
| `GET`    | `/api/leave/mine` | كل الأدوار عدا المريض |
| `POST`   | `/api/leave`      | كل الأدوار عدا المريض |
| `DELETE` | `/api/leave/:id`  | كل الأدوار عدا المريض |

## طلبات الأقسام · `/api/department-requests`

الشراء والصيانة عن طريق رئيس القسم.

| الطريقة  | الرابط                               | مين بيقدر                     |
| -------- | ------------------------------------ | ----------------------------- |
| `GET`    | `/api/department-requests/context`   | كل الأدوار عدا المريض والمدير |
| `GET`    | `/api/department-requests`           | كل الأدوار عدا المريض والمدير |
| `GET`    | `/api/department-requests/shortages` | كل الأدوار عدا المريض والمدير |
| `POST`   | `/api/department-requests/purchases` | كل الأدوار عدا المريض والمدير |
| `POST`   | `/api/department-requests/repairs`   | كل الأدوار عدا المريض والمدير |
| `DELETE` | `/api/department-requests/:kind/:id` | كل الأدوار عدا المريض والمدير |

## الموافقات · `/api/approvals`

قرارات المدير على الإجازات والشراء والصيانة.

| الطريقة | الرابط                     | مين بيقدر |
| ------- | -------------------------- | --------- |
| `GET`   | `/api/approvals`           | المدير    |
| `POST`  | `/api/approvals/:kind/:id` | المدير    |

## الشكاوى · `/api/complaints`

شكاوى المرضى وردود الإدارة.

| الطريقة | الرابط                      | مين بيقدر |
| ------- | --------------------------- | --------- |
| `GET`   | `/api/complaints/mine`      | المريض    |
| `POST`  | `/api/complaints`           | المريض    |
| `GET`   | `/api/complaints`           | المدير    |
| `POST`  | `/api/complaints/:id/reply` | المدير    |

## الاجتماعات · `/api/meetings`

طلبات المدير للاجتماع مع الأطباء.

| الطريقة  | الرابط                     | مين بيقدر |
| -------- | -------------------------- | --------- |
| `GET`    | `/api/meetings`            | المدير    |
| `POST`   | `/api/meetings`            | المدير    |
| `DELETE` | `/api/meetings/:id`        | المدير    |
| `GET`    | `/api/meetings/mine`       | الطبيب    |
| `POST`   | `/api/meetings/:id/answer` | الطبيب    |

## لائحة الأسعار · `/api/prices`

أسعار الخدمات والتحاليل والأدوية.

| الطريقة  | الرابط            | مين بيقدر       |
| -------- | ----------------- | --------------- |
| `GET`    | `/api/prices`     | المحاسب، المدير |
| `PUT`    | `/api/prices`     | المحاسب، المدير |
| `DELETE` | `/api/prices/:id` | المحاسب، المدير |

## الفواتير · `/api/invoices`

حسابات المرضى والفواتير والدفعات.

| الطريقة | الرابط                              | مين بيقدر       |
| ------- | ----------------------------------- | --------------- |
| `GET`   | `/api/invoices/accounts`            | المحاسب، المدير |
| `GET`   | `/api/invoices/accounts/:patientId` | المحاسب، المدير |
| `POST`  | `/api/invoices`                     | المحاسب، المدير |
| `GET`   | `/api/invoices`                     | المحاسب، المدير |
| `POST`  | `/api/invoices/:id/payments`        | المحاسب، المدير |
| `GET`   | `/api/invoices/:id`                 | المحاسب، المدير |

## الأرباح · `/api/profit`

الربح الشهري وتفاصيله ولوحة المدير.

| الطريقة | الرابط                  | مين بيقدر |
| ------- | ----------------------- | --------- |
| `GET`   | `/api/profit`           | المدير    |
| `GET`   | `/api/profit/breakdown` | المدير    |
| `GET`   | `/api/profit/overview`  | المدير    |

## سجل النشاطات · `/api/audit`

من فتح أو عدّل ملف أي مريض.

| الطريقة | الرابط       | مين بيقدر |
| ------- | ------------ | --------- |
| `GET`   | `/api/audit` | المدير    |

## المريض · `/api/patients`

ملف المريض الطبي وأدويته وتذكيراته وفواتيره.

| الطريقة  | الرابط                           | مين بيقدر |
| -------- | -------------------------------- | --------- |
| `GET`    | `/api/patients/me/file`          | المريض    |
| `GET`    | `/api/patients/me/invoices`      | المريض    |
| `GET`    | `/api/patients/me/medications`   | المريض    |
| `POST`   | `/api/patients/me/reminders`     | المريض    |
| `PATCH`  | `/api/patients/me/reminders/:id` | المريض    |
| `DELETE` | `/api/patients/me/reminders/:id` | المريض    |

## إشعارات الجهاز · `/api/push`

اشتراك المتصفح بالإشعارات.

| الطريقة  | الرابط                    | مين بيقدر       |
| -------- | ------------------------- | --------------- |
| `GET`    | `/api/push/key`           | أي مستخدم مسجّل |
| `POST`   | `/api/push/subscriptions` | أي مستخدم مسجّل |
| `DELETE` | `/api/push/subscriptions` | أي مستخدم مسجّل |

## الاستقبال · `/api/reception`

تسجيل المرضى والحالات الإسعافية وتعريف المجهولين.

| الطريقة | الرابط                                 | مين بيقدر         |
| ------- | -------------------------------------- | ----------------- |
| `GET`   | `/api/reception/patients`              | الاستقبال، المدير |
| `POST`  | `/api/reception/patients`              | الاستقبال، المدير |
| `POST`  | `/api/reception/patients/:id/account`  | الاستقبال، المدير |
| `POST`  | `/api/reception/er-arrivals`           | الاستقبال، المدير |
| `POST`  | `/api/reception/patients/:id/identify` | الاستقبال، المدير |
