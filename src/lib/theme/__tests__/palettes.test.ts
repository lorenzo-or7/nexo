import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brandAssets, DEFAULT_PALETTE, normalizePalette, PALETTES } from "../palettes";

const root = join(__dirname, "../../../..");
const css = readFileSync(join(root, "src/app/palettes.css"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20261016001300_profile_palette.sql"), "utf8");

describe("paletas de tema", () => {
  it("normaliza valores desconhecidos para a paleta padrão", () => {
    expect(normalizePalette("lima")).toBe("lima");
    expect(normalizePalette("rosa-choque")).toBe(DEFAULT_PALETTE);
    expect(normalizePalette(undefined)).toBe(DEFAULT_PALETTE);
  });

  it("toda paleta (exceto a padrão) tem CSS claro e escuro, logo e a mesma lista na migration", () => {
    for (const p of PALETTES) {
      expect(migration).toContain(`'${p.id}'`);
      if (p.id === DEFAULT_PALETTE) continue;
      expect(css).toContain(`html[data-palette="${p.id}"][data-theme="light"]`);
      expect(css).toContain(`html[data-palette="${p.id}"][data-theme="dark"]`);
      for (const mode of ["light", "dark"] as const) {
        const a = brandAssets(p.id, mode);
        expect(existsSync(join(root, "public", a.mark))).toBe(true);
        expect(existsSync(join(root, "public", a.wordmark))).toBe(true);
      }
    }
  });
});
