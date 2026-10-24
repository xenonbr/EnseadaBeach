import { describe, it, expect } from "vitest";
import { parseBRLToCents, formatCents, centsToInput } from "@/lib/money";
import { sniffImage } from "@/lib/image";

describe("dinheiro em centavos", () => {
  it("converte formatos válidos", () => {
    expect(parseBRLToCents("12,50")).toBe(1250);
    expect(parseBRLToCents("R$ 1.234,5")).toBe(123450);
    expect(parseBRLToCents("10")).toBe(1000);
    expect(parseBRLToCents("0,99")).toBe(99);
    expect(parseBRLToCents("0,1")).toBe(10);
  });
  it("rejeita inválidos", () => {
    for (const v of ["", "abc", "-5", "1,234", "1.2", "10,5,3", "1e3"]) expect(parseBRLToCents(v), v).toBeNull();
  });
  it("sem erro de ponto flutuante (19,90 e 0,29)", () => {
    expect(parseBRLToCents("19,90")).toBe(1990);
    expect(parseBRLToCents("0,29")).toBe(29);
  });
  it("formata e converte de volta", () => {
    expect(formatCents(123450)).toBe("R$ 1.234,50");
    expect(formatCents(5)).toBe("R$ 0,05");
    expect(centsToInput(1250)).toBe("12,50");
  });
});

describe("validação de imagem por conteúdo", () => {
  it("reconhece JPEG, PNG, WebP", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))?.mime).toBe("image/png");
    const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
    expect(sniffImage(webp)?.mime).toBe("image/webp");
  });
  it("rejeita outros formatos (ex.: HTML/SVG renomeado)", () => {
    expect(sniffImage(new Uint8Array(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });
});
