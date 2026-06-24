import { SLIDE_FILENAMES } from "./slideAssets.js";

const POSTING_INSTRUCTIONS = `How to post your Forma HYROX carousel to Instagram

1. Save all PNG slides to your phone.
2. Open Instagram and start a new post.
3. Select multiple images.
4. Choose the slides in numbered order (01 to 06).
5. Paste the caption from caption.txt.
6. Post.

Tip: keep the slide order exactly as numbered.
`;

export async function buildZip(slideBuffers, caption) {
  const { default: archiver } = await import("archiver");
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    slideBuffers.forEach((buf, index) => {
      archive.append(buf, { name: SLIDE_FILENAMES[index] });
    });
    archive.append(caption, { name: "caption.txt" });
    archive.append(POSTING_INSTRUCTIONS, { name: "posting-instructions.txt" });
    archive.finalize();
  });
}
