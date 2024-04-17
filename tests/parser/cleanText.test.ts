import fs from "fs";
import path from "path";
import cleanText from "../../src/parser/cleanText";
import { describe, it } from "node:test";
import assert from "node:assert";

describe("Clean Text", () => {
  const folderPath = path.join(__dirname, "/mocks/cleanText");

  const files = fs
    .readdirSync(folderPath, "utf-8")
    .filter((file) => path.extname(file) === ".gift");

  files.forEach((file) => {
    const filePath = path.join(folderPath, file);
    const expectedPath = path.join(
      folderPath,
      `${path.basename(file, ".gift")}.json`,
    );

    const text = fs.readFileSync(filePath, "utf-8");

    // Write new tests to directory.
    // fs.writeFileSync(expectedPath, JSON.stringify(clean(text)));

    const expected = JSON.parse(fs.readFileSync(expectedPath, "utf-8"));

    it(`Parses ${file}`, () => {
      assert.strictEqual(cleanText(text), expected);
    });
  });
});
