import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDir = join(process.cwd(), "dist", "disk-frontend");
const indexPath = join(outputDir, "index.html");
const fallbackPath = join(outputDir, "404.html");
const noJekyllPath = join(outputDir, ".nojekyll");

const moveUntil = process.env.POCKLO_MOVE_UNTIL;
if (moveUntil) {
  const date = new Date(moveUntil);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveUntil) ||
      Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== moveUntil) {
    throw new Error('POCKLO_MOVE_UNTIL must be a valid YYYY-MM-DD date');
  }
  const html = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, html.replace('</head>', `<meta name="pocklo-move-until" content="${moveUntil}"></head>`));
}

await copyFile(indexPath, fallbackPath);
for (const route of ['developer', 'developer/docs', 'developer/admin', 'account/applications', 'oauth/authorize']) {
  const directory = join(outputDir, route);
  await mkdir(directory, { recursive: true });
  await copyFile(indexPath, join(directory, 'index.html'));
}
await writeFile(noJekyllPath, "", "utf8");

console.log("Prepared GitHub Pages artifact:");
console.log("- 404.html copied from index.html");
console.log("- .nojekyll created");
