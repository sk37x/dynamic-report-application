Template Application


# Set yarn 
- Node v22.23.2 / yarn v4 (ใช้ corepack แทน global)
    1. corepack enable
    2. corepack use yarn@stable
    3. yarn install
==================================================================================================================

Non-Zero-Installs: มักจะมี enableGlobalCache: true (แพ็กเกจจะถูกเก็บไว้ที่ Cache กลางของเครื่อง ไม่ได้อยู่ในโปรเจกต์)

Zero-Installs: มักจะตั้งค่าเป็น enableGlobalCache: false (สั่งให้เก็บไฟล์ .zip ของทุกแพ็กเกจไว้ใน .yarn/cache ของตัวโปรเจกต์เอง)

==================================================================================================================

# Nest JS
1. 