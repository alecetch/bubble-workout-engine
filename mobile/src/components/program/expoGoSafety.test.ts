import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function readSource(relativePath: string): string {
    return readFileSync(path.resolve(__dirname, relativePath), "utf8");
}
test("TechniqueSheet does not import expo-av on the workout screen path", () => {
    const source = readSource("./TechniqueSheet.tsx");
    expect(source).not.toMatch(/from\s+["']expo-av["']/);
});
