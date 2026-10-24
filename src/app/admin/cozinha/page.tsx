import { SectorBoard } from "@/components/SectorBoard";

export default async function CozinhaPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  return (
    <SectorBoard
      sector="kitchen"
      basePath="/admin/cozinha"
      title="Painel da Cozinha"
      searchParams={sp}
    />
  );
}
