# Deployment: Windows / offline server

เอกสารนี้เป็นแนวทางจัดส่ง ไม่ได้ยืนยันว่าเครื่อง production ปลายทางผ่านการทดสอบแล้ว
Offline หมายถึงไม่ต้องออกอินเทอร์เน็ตเพื่อ download packages ตอน start
แอปยังต้องเข้าถึงฐานข้อมูลและบริการที่ใช้ผ่านเครือข่ายภายในได้

## Frontend standalone

ตั้งค่า auth/layout และ API_PROXY_TARGET ให้ตรงกับปลายทางก่อน build
หาก Next และ Nest อยู่เครื่องเดียวกัน ใช้ http://127.0.0.1:3001 ได้
127.0.0.1 หมายถึงเครื่องที่รัน Next ไม่ใช่เครื่องของผู้ใช้ browser

ใน frontend:

```bash
yarn build
```

build script ของโครงการเรียก copy-standalone ต่อจาก next build
ตรวจว่าชุด .next/standalone มี server.js, dependencies ที่ trace มา,
public และ .next/static รวมถึงไฟล์ font local ที่แอปใช้
คัดลอกเนื้อหาภายใน standalone ไปโฟลเดอร์ deploy ทั้งชุด
ไม่ต้องรัน yarn install ที่ปลายทางสำหรับ bundle นี้

ตัวอย่าง PowerShell ที่โฟลเดอร์ deploy frontend:

```powershell
$env:NODE_ENV = "production"
$env:PORT = "3000"
$env:HOSTNAME = "127.0.0.1"
node server.js
```

HOSTNAME เป็นตัวแปรของ Next standalone; HOST เป็นตัวแปรที่ Nest config ของเราอ่าน
เมื่อ IIS อยู่เครื่องเดียวกัน การ bind loopback เหมาะกับการให้ IIS ส่งต่อเข้ามา
หากเปลี่ยนโครงสร้าง standalone/monorepo ให้ใช้ตำแหน่ง server.js ที่ build ออกมาจริง

## Backend

Nest build ไม่ได้รวม production dependencies เป็น standalone bundle

เตรียมใน checkout/build directory สำหรับ release บนเครื่องที่ออกอินเทอร์เน็ตได้:

```bash
yarn install --frozen-lockfile
yarn build
```

เตรียม staging directory ใหม่ที่มี package.json และ yarn.lock ของ backend แล้วรันใน staging:

```bash
yarn install --production=true --frozen-lockfile
```

คัดลอก dist ที่ build แล้วมาไว้ใน staging จากนั้นส่ง dist, production node_modules,
package.json และ yarn.lock ไปปลายทาง ตั้ง .env จริงที่ปลายทางแยกจาก source control
คัดลอก runtime assets เพิ่มด้วยหาก business module ในอนาคตมีไฟล์ที่ไม่ได้อยู่ใน dist

ใช้ OS, architecture และ Node runtime ที่เข้ากันกับปลายทาง โดยเฉพาะ native dependencies
อย่าส่ง node_modules จาก Linux ไปใช้กับ Windows
Oracle 11g ใช้ Thick mode และต้องติดตั้ง Oracle Client ที่เข้ากัน พร้อม dependencies ของ OS
ไม่ได้รวม Instant Client ไว้ใน ZIP ของ source หรือ documentation นี้

ตัวอย่าง PowerShell ที่โฟลเดอร์ deploy backend:

```powershell
$env:NODE_ENV = "production"
node dist/main.js
```

ใช้ working directory ที่มี backend .env และตรวจว่า build จริงมี dist/main.js
หาก compiler ปล่อยไว้ตำแหน่งอื่น ให้แก้ start command ให้ตรงกับ artifact จริง
CLI user:create:oracle ใช้ source + dev tools จึงไม่อยู่ใน production-only package นี้
ให้ provision บัญชีจากเครื่องดูแลที่มีโครงการและสิทธิ์เข้าถึง DB ที่ต้องการ

## HTTPS และ reverse proxy

ให้ browser เข้า public HTTPS origin เดียว เช่น https://app.example.internal
IIS ส่งต่อไป Next ที่ 127.0.0.1:3000 และ Next ส่ง /api ไป Nest ที่ 127.0.0.1:3001
ตั้ง backend CORS_ORIGIN เป็น public origin จริง รวม port ถ้ามี แต่ไม่ใส่ URL path
proxy ต้องรักษา Origin, Cookie และ Set-Cookie เพื่อให้ auth flow ทำงานตรงเดิม

ใน production ใช้ Secure cookies ตาม config ที่เราออกแบบ
ทดสอบ auth ผ่าน HTTPS จริง ไม่ลดความปลอดภัยของ cookie เพื่อให้ remote HTTP ผ่าน
การใช้ basePath เช่น /biMap ต้องตั้ง routes/rewrite/cookie paths ให้เข้ากันก่อนนำไปใช้
template v1 รอบนี้ทดสอบที่ root path เท่านั้น

## ตรวจที่ปลายทางครั้งแรก

- health ผ่าน public origin
- CSS และ Noto Sans โหลดได้โดยไม่พึ่ง font service ภายนอก
- login, reload, refresh และ logout ผ่าน HTTPS
- restart processes แล้ว health กลับมาทำงาน
- ตรวจ working directory และ environment เมื่อเปลี่ยนไปให้ service manager รัน

IIS/PM2/service manager configuration เฉพาะเครื่องไม่รวมใน v1
เมื่อเลือกใช้ ให้ pin versions และจัดการ restart/log ตามมาตรฐานของโครงการ

## แหล่งอ้างอิง

- Next.js standalone: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Nest deployment: https://docs.nestjs.com/deployment
- node-oracledb installation: https://node-oracledb.readthedocs.io/en/latest/user_guide/installation.html

สำหรับรายละเอียด compatibility ให้ยึด driver และ runtime versions ที่ติดตั้งในโครงการจริง

