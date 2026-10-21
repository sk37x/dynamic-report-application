# Template v1 — release record

วันที่: 21 ตุลาคม 2026
ผลต่อไปนี้อ้างอิงการรันที่เจ้าของโครงการรายงาน ไม่ใช่การรัน repository Windows โดยผู้จัดทำเอกสาร

## ผ่านแล้วตามรายงาน

- สร้าง user ใน Oracle ด้วย CLI และ scrypt hasher เดิม
- Login จริงผ่าน frontend → Next proxy → Nest → Oracle
- Reload แล้วอ่าน user/session สำเร็จ
- ลบ access cookie แล้ว refresh สำเร็จ
- Logout สำเร็จ
- แก้ identity reader ให้ใช้ provider ที่เลือกตามฐานข้อมูล
- โหมดปิด auth และไม่เปิด Oracle/MSSQL connections
- Layout plain/menu
- Frontend และ backend lint/test/build ตามคำสั่งใน README
- Oracle และ MSSQL integration เคยผ่านใน environment ทดสอบก่อนหน้า
- Font local ใน Next standalone เคยทดสอบว่าโหลดได้

## ขอบเขตที่ยังไม่ยืนยัน

- เริ่มจาก fresh checkout ด้วย .env.example ชุดเอกสารนี้เพียงอย่างเดียว
- Production deployment จริงบนเครื่องปลายทาง
- Compatibility กับ Node/driver versions ที่ต่างจากเครื่องที่ผ่าน
- ตาราง role/permission และ business authorization ของโครงการใหม่
- การทดสอบหลายแท็บจริง: ไม่ได้มีผลยืนยันแยกในรอบนี้

ไม่ต้องรันชุดเดิมซ้ำทั้งหมดเพียงเพื่อเพิ่ม documentation
หาก .env.example ต่างจาก validation schema ให้แก้ให้ตรง แล้วตรวจ startup เฉพาะกรณีที่เปลี่ยน

## ก่อนทำ Git tag

1. รวม README, env examples และ docs เข้ากับ repository เดิม
2. ยืนยันค่า default: frontend/backend auth disabled, layout plain, connection lists ว่าง
3. เก็บ yarn.lock ทั้งสองฝั่ง และบันทึก Node version จริงที่ใช้ทดสอบด้านล่าง
4. ตรวจว่า Git ไม่ติดตาม .env จริง, secrets, dependencies หรือ build outputs
5. ตรวจ diff และเลือก stage เฉพาะไฟล์ที่ตั้งใจส่งมอบ
6. Commit และสร้าง tag เฉพาะเมื่อยังไม่มี tag ชื่อนี้

ตัวอย่างกฎใน .gitignore ของแต่ละ frontend/backend:

```gitignore
.env
.env.*
!.env.example
node_modules/
.next/
dist/
coverage/
```

กฎ ignore ไม่ลบไฟล์ที่เคยถูก track ไปแล้ว ต้องจัดการไฟล์ที่ถูก track แยกต่างหาก

คำสั่งตรวจ:

```bash
git status --short
git diff --stat
git diff --cached
git tag --list "v1.0.0"
```

หลัง stage ไฟล์ที่ตั้งใจแล้ว:

```bash
git commit -m "chore: finalize application template v1"
git tag -a v1.0.0 -m "Application template v1"
```

ไม่มีการ push อัตโนมัติในขั้นตอนนี้ และไม่ใช้ force ย้าย tag เดิม

## เวอร์ชันที่ใช้ทดสอบ

เติมจากเครื่องที่รันผ่านจริงก่อน tag:

- Node.js:
- Yarn: 1.22.22
- Git commit:
- Backend driver versions: ดู package.json/yarn.lock ของ commit นี้

## หลัง v1

เพิ่มเฉพาะตามความต้องการของโครงการ:
business modules, authorization model, user-management, reports หรือ deployment automation
ไม่ต้องเพิ่มทั้งหมดลง template กลางก่อนเริ่มใช้งาน

