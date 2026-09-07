import * as fs from "fs/promises";
import * as path from "path";

export async function collectRefFiles(
  rootDir: string,
  extensions: string[],
  excludeFolders: string[],
): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && excludeFolders.includes(entry.name)) {
          continue;
        }
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).replace(".", "");
          if (extensions.includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Skipping directory ${dir}:`, error);
    }
  }

  await walk(rootDir);
  return results;
}
