# Next.js + NestJS Application Template v1

ฐานเริ่มต้นสำหรับเว็บแอป ใช้ Yarn Classic 1.22.22, Next.js + Mantine และ NestJS
รองรับการเลือก layout, เปิด/ปิด auth และเลือก Oracle/MSSQL ผ่าน adapters

เอกสารชุดนี้อิงโค้ดและผลทดสอบที่เจ้าของโครงการรายงาน ณ 21 ตุลาคม 2026
เป็นชุดเอกสารประกอบโครงการ ไม่ใช่ source code ทั้งโครงการ
หากมี README เดิม ให้รวมส่วนที่ต้องการและเก็บคำอธิบายเฉพาะโครงการไว้

## ค่าเริ่มต้นของ template

| ตัวเลือก | ค่าเริ่มต้น |
| --- | --- |
| Frontend auth | disabled |
| Backend auth | disabled |
| Layout | plain |
| Oracle connections | [] |
| MSSQL connections | [] |
| Browser API base URL | /api |
| Next.js proxy target | http://127.0.0.1:3001 |
| Backend binding | 127.0.0.1:3001 |

โหมดไม่มี auth ทำให้หน้าแอปเข้าถึงได้โดยไม่ต้อง login ใช้สำหรับแอปที่ตั้งใจเปิดสาธารณะ
หรือยังไม่มีฟีเจอร์ที่ต้องป้องกัน เมื่อเพิ่มข้อมูลส่วนตัว ต้องเปิดและตรวจ auth ฝั่ง backend ด้วย

## เริ่มใช้งาน

ใช้ Node เวอร์ชันเดียวกับเครื่องที่ผ่านการทดสอบ และเก็บ yarn.lock ของทั้งสองแอป
บันทึกเวอร์ชันจริงด้วย node --version และ yarn --version ก่อน tag รุ่น

คำสั่งตัวอย่างเป็น Git Bash ให้เปิด terminal แยก frontend และ backend

Backend:

```bash
cd backend
yarn install --frozen-lockfile
cp .env.example .env
yarn start:dev
```

Frontend:

```bash
cd frontend
yarn install --frozen-lockfile
cp .env.example .env.local
yarn dev
```

คำสั่ง cp ใช้ตอนเริ่มโครงการใหม่ หากมี .env/.env.local อยู่แล้ว ให้รวมค่าแทนการเขียนทับ

เปิด http://localhost:3000 และ http://localhost:3000/api/health
เมื่อปิด auth การเรียก /api/auth/me โดยตรงควรได้ 404 และหน้าเว็บไม่ควรเรียก endpoint นี้

ตัวอย่าง env ระบุเฉพาะค่าที่ทราบจากโค้ดในบทสนทนา ไม่ได้ตรวจ env validation schema ล่าสุดทั้งไฟล์
การทดสอบโหมดไม่มี auth/DB ผ่านกับ environment เดิมของเจ้าของโครงการแล้ว
ยังไม่ได้ยืนยันการติดตั้งใหม่ด้วย .env.example ชุดนี้ หาก startup ขอค่าเพิ่ม ให้เทียบ validation schema
และระบุว่าเป็นค่าทั่วไปหรือค่าของฟีเจอร์ที่เปิดอยู่ ไม่ใส่ credentials จริงลงไฟล์ตัวอย่าง

## จุดตั้งค่า

| ไฟล์ | หน้าที่ |
| --- | --- |
| frontend/config/app.config.ts | ชื่อแอป, auth.enabled, layout.variant และเส้นทาง |
| frontend/config/api.config.ts | baseUrl เป็น /api |
| frontend/next.config.ts | standalone และ /api rewrite |
| backend/src/config/auth.config.ts | เปิด auth และเลือก credentials/sessionStore |
| backend/src/config/database.config.ts | รายการ connection ที่เปิดใช้ |
| backend/.env | host/port/origin, secret และ credentials |

เปลี่ยน layout.variant ระหว่าง plain และ menu ได้โดยไม่เปลี่ยนการตั้งค่า auth
ค่าตั้งต้นใน source config จะอยู่ในผล build: เปลี่ยนแล้วต้อง build ใหม่สำหรับ deployment

ถ้าใช้ frontend/config/auth-client.config.ts จาก patch หลายแท็บ:
crossTab.enabled เป็นตัวเลือกเสริม, scope ต้องตรงกันในแท็บที่แชร์ cookies
ต่างโครงการต้องวางแผนแยก origin/cookie names ให้เหมาะสม เปลี่ยน scope อย่างเดียวไม่แยก cookies
เมื่อเปิด cross-tab ต้องใช้ browser ที่รองรับ Web Locks ใน HTTPS หรือ localhost

## เปิด Oracle authentication

1. ติดตั้ง Oracle Instant Client ที่เข้ากับ driver, OS และสถาปัตยกรรมของเครื่อง
   โครงการนี้เคยทดสอบ Oracle 11g ด้วย Thick mode และ Instant Client 19
2. สร้างตาราง AUTH_USERS และ AUTH_SESSIONS ด้วย SQL ของโครงการใน schema ที่ต้องการ
   ใช้ไฟล์ migration ที่สะอาด ไม่รัน DDL export ที่มี CREATE/ALTER ซ้ำทั้งชุด
3. กรอก env ของ Oracle และ auth ตาม backend/.env.example
4. database config ใช้ oracle: ['MAIN'], mssql: []
5. auth config ใช้ค่าด้านล่าง โดยรักษา type/import เดิม
6. frontend ตั้ง auth.enabled เป็น true แล้ว restart

```ts
{
    enabled: true,
    credentials: { kind: 'oracle', connectionName: 'MAIN' },
    sessionStore: { kind: 'oracle', connectionName: 'MAIN' },
}
```

สร้าง JWT secret ใหม่สำหรับแต่ละโครงการ/แต่ละ environment:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

นำผลไปเก็บใน AUTH_JWT_SECRET_HEX ของ environment จริง ไม่ commit ลง Git

สร้างบัญชีแรกจาก backend:

```bash
yarn user:create:oracle
```

CLI อ่าน .env, ใช้ MAIN เป็นค่าเริ่มต้น, รับ password แบบปิดบัง,
ใช้ ScryptPasswordHasher เดียวกับ login และ insert บัญชี active
CLI นี้รองรับ Oracle เท่านั้น และไม่สร้างสิทธิ์ admin
บัญชีฐานข้อมูลที่เชื่อมต่อกับบัญชีผู้ใช้แอปเป็นคนละสิ่งกัน
Username ซ้ำจะถูกปฏิเสธ ไม่มีการอัปเดต password ของบัญชีเดิม

## เลือก MSSQL

เปิด mssql: ['MAIN'] และตั้ง credentials/sessionStore.kind เป็น 'mssql'
กรอก connection env ให้ตรงกับ factory ของ MssqlModule ในโครงการ
ใช้ SQL schema และ reader/store ของ MSSQL ไม่ใช้ Oracle SQL กับ MSSQL
ยังไม่มี CLI สร้าง user MSSQL ในชุดนี้: อย่าเรียก user:create:oracle เพื่อสร้างบัญชี MSSQL

การเปิด connection ไม่ได้เปลี่ยน auth reader อัตโนมัติ:
AUTH_USER_READER ต้องเลือก implementation ตาม credentials.kind
AUTH_IDENTITY_READER ใช้ useExisting: AUTH_USER_READER เพื่ออ่าน identity จากแหล่งเดียวกัน

## Auth contract

| Endpoint | สำเร็จ | หน้าที่ |
| --- | --- | --- |
| POST /api/auth/login | 200 + user | ตรวจ credentials และตั้ง HttpOnly cookies |
| GET /api/auth/me | 200 + user | ตรวจ session และอ่าน identity ปัจจุบัน |
| POST /api/auth/refresh | 200 + user | หมุน refresh token และตั้ง cookies ใหม่ |
| POST /api/auth/logout | 204 | เพิกถอน session และล้าง cookies |

POST auth ต้องมี Origin ที่อนุญาต ตรงกับ CORS_ORIGIN
Browser ใช้ credentials: include, API ไม่คืน token ใน JSON
รหัสผ่านเก็บเป็น scrypt hash ไม่สามารถ decrypt
หน้า private ฝั่ง frontend เป็นการจัด UI; API ที่เพิ่มใหม่ต้องตรวจ auth/สิทธิ์ฝั่ง backend เอง
Frontend auto retry หลัง refresh ใช้กับ GET ตามค่าเริ่มต้น
หากเปิด retry ให้คำสั่งเขียน ต้องพิจารณาการทำซ้ำของ operation นั้น

## ตรวจคุณภาพ

Frontend:

```bash
yarn lint
yarn test:run
yarn build
```

Backend:

```bash
yarn lint
yarn test
yarn test:e2e
yarn build
```

ทดสอบฐานข้อมูลจริงเฉพาะ environment ทดสอบ:

```bash
RUN_ORACLE_INTEGRATION=1 yarn test:db:oracle
RUN_MSSQL_INTEGRATION=1 yarn test:db:mssql
```

คำสั่ง flag ข้างต้นเป็น Git Bash
ฐานข้อมูลทดสอบใช้ .env.integration.local และต้องแยกจาก production
ชุด integration ที่ skip เมื่อไม่ได้เปิด flag เป็นพฤติกรรมที่ตั้งใจไว้
สคริปต์ CLI ใต้ backend/scripts ต้องอยู่ใน exclude ของ tsconfig.build.json

## เริ่มโครงการใหม่จาก template

1. สร้าง repository ใหม่จาก source ของรุ่น v1 พร้อม yarn.lock
2. เปลี่ยนชื่อแอป, metadata, navigation และ theme ตามโครงการ
3. เลือก layout และเปิด auth/DB เท่าที่โครงการใช้
4. สร้าง env และ secret ของโครงการนั้น ไม่คัดลอกบัญชีหรือ session จากโครงการเดิม
5. เพิ่ม business modules ตามโครงสร้าง domain/application/infrastructure/presentation ที่มีอยู่
6. เพิ่มการตรวจสิทธิ์ที่ API ตามความต้องการของ business module

ไม่แจก node_modules, .next, dist, .env จริง หรือข้อมูลบัญชีผู้ใช้เป็นส่วนของ source template
การส่ง deployment package เป็นอีกกรณีหนึ่ง ดู docs/DEPLOYMENT.md

## ขอบเขต v1

รวม theme/font local, layout options, auth/session, Oracle/MSSQL adapters, tests และแนวทาง deploy
ไม่รวมระบบจัดการ roles/permissions แบบเต็ม, user-management UI, password reset UI,
impersonation, MongoDB adapter และ dynamic report engine
เป็นฐานเริ่มพัฒนา ไม่ใช่การรับรองความพร้อม production ของ business application ทุกประเภท

ผลทดสอบและขอบเขตการยืนยันอยู่ใน docs/V1-RELEASE.md
