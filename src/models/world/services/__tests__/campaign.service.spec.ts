
import { NotFoundException } from "@nestjs/common";
import { CampaignService } from "../campaign.service";

describe("CampaignService.resolveId / getById slug-tolerance", () => {
  const VALID_UUID = "11111111-1111-4111-8111-111111111111";
  const SLUG = "misterio-aldeia-campaign";

  function makeService(rows: Array<{ id: string; slug: string }>) {
    const repo = {
      findOne: jest.fn(async ({ where }: { where: Record<string, string> }) => {
        if ("id" in where) {
          return rows.find((r) => r.id === where.id) ?? null;
        }
        if ("slug" in where) {
          return rows.find((r) => r.slug === where.slug) ?? null;
        }
        return null;
      }),
    };
    const svc = new CampaignService(
      repo as never,
      { findOne: jest.fn() } as never,
    );
    return { svc, repo };
  }

  describe("resolveId", () => {
    it("retorna UUID quando recebe UUID existente", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const out = await svc.resolveId(VALID_UUID);
      expect(out).toBe(VALID_UUID);
    });

    it("retorna UUID quando recebe slug existente", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const out = await svc.resolveId(SLUG);
      expect(out).toBe(VALID_UUID);
    });

    it("trim espaços do input", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const out = await svc.resolveId(`  ${SLUG}  `);
      expect(out).toBe(VALID_UUID);
    });

    it("NotFound em UUID inexistente", async () => {
      const { svc } = makeService([]);
      await expect(svc.resolveId(VALID_UUID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("NotFound em slug inexistente", async () => {
      const { svc } = makeService([]);
      await expect(svc.resolveId("slug-fake")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("NotFound em string vazia", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      await expect(svc.resolveId("")).rejects.toThrow(NotFoundException);
      await expect(svc.resolveId("   ")).rejects.toThrow(NotFoundException);
    });

    it("não busca por slug quando input parece UUID inválido (não loose-match)", async () => {


      const { svc, repo } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const otherUuid = "99999999-9999-4999-8999-999999999999";
      await expect(svc.resolveId(otherUuid)).rejects.toThrow(NotFoundException);

      const slugLookups = repo.findOne.mock.calls.filter(
        (c: unknown[]) =>
          (c[0] as { where: Record<string, string> }).where.slug !== undefined,
      );
      expect(slugLookups).toHaveLength(0);
    });
  });

  describe("getById slug-tolerance", () => {
    it("aceita UUID (back-compat)", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const c = await svc.getById(VALID_UUID);
      expect(c.id).toBe(VALID_UUID);
    });

    it("aceita slug (D3 fix)", async () => {
      const { svc } = makeService([{ id: VALID_UUID, slug: SLUG }]);
      const c = await svc.getById(SLUG);
      expect(c.id).toBe(VALID_UUID);
      expect(c.slug).toBe(SLUG);
    });

    it("NotFound em ambos inexistentes", async () => {
      const { svc } = makeService([]);
      await expect(svc.getById("qualquer")).rejects.toThrow(NotFoundException);
    });
  });
});
