import { SectorBoard } from "@/components/SectorBoard";

export default async function BarPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  return (
    <SectorBoard
      sector="bar"
      basePath="/admin/bar"
      title="Painel do Bar"
      searchParams={sp}
    />
  );
}
