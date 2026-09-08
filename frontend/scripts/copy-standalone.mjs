import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");

const standaloneDir = path.join(projectDir, '.next', 'standalone');
const serverFile = path.join(standaloneDir, 'server.js');

if(!fs.existsSync(serverFile)) {
    throw new Error(
        'Standalone server not found. Check output: "standalone" in next.config.ts'
    )
}

const staticSource = path.join(projectDir, '.next', 'static');

if(!fs.existsSync(staticSource)) {
    throw new Error('Missing .next/static. Run next build first.');
}

function copyDirectory(source, destination) {
  // ล้างสำเนาเดิม เพื่อไม่ให้มีไฟล์เก่าค้าง
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

copyDirectory(
  staticSource,
  path.join(standaloneDir, ".next", "static")
);

const publicSource = path.join(projectDir, "public");
const publicDestination = path.join(standaloneDir, "public");

if (fs.existsSync(publicSource)) {
  copyDirectory(publicSource, publicDestination);
} else {
  fs.rmSync(publicDestination, { recursive: true, force: true });
}

console.log("✅ Copied static & public to standalone successfully!");