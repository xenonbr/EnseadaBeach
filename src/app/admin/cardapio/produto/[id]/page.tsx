import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { centsToInput, formatCents } from "@/lib/money";
import { addGroup, addOption, createProduct, deleteGroup, deleteOption, removeImage, toggleOption, updateProduct, uploadImage } from "../../actions";

type Opt = { id: string; name: string; price_cents: number; available: boolean };
type Grp = { id: string; name: string; min_select: number; max_select: number; options: Opt[] };

export default async function ProdutoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { supabase } = await requireStaff(["admin", "manager"]);
  const { id } = await params;
  const { msg } = await searchParams;
  const isNew = id === "novo";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: cats } = await supabase.from("menu_categories").select("id, name").neq("status", "archived").order("sort_order");
  const categories = cats ?? [];

  type P = { id: string; name: string; description: string | null; price_cents: number; status: string; available: boolean; sector: string; category_id: string; image_path: string | null };
  let p: P | null = null;
  let groups: Grp[] = [];
  if (!isNew) {
    const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (!data) notFound();
    p = data as P;
    const { data: g } = await supabase.from("option_groups").select("id, name, min_select, max_select, options(id, name, price_cents, available)").eq("product_id", id).order("sort_order");
    groups = (g ?? []) as unknown as Grp[];
  }
  const imageUrl = p?.image_path ? supabase.storage.from("menu-images").getPublicUrl(p.image_path).data.publicUrl : null;

  if (isNew && categories.length === 0) {
    return (
      <main className="card text-center">
        <p className="mb-3">Crie uma categoria antes de cadastrar produtos.</p>
        <Link href="/admin/cardapio" className="btn btn-primary">Ir para o cardápio</Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/admin/cardapio" className="btn">← Cardápio</Link>
        <h1 className="text-2xl font-bold md:text-3xl">{isNew ? "Novo produto" : p!.name}</h1>
      </header>
      {msg && <p role="status" className="rounded-xl border border-sky-400 bg-sky-50 p-3 text-sky-950">{msg}</p>}

      <form action={isNew ? createProduct : updateProduct} className="card grid gap-4 md:grid-cols-2">
        {!isNew && <input type="hidden" name="id" value={p!.id} />}
        <label className="flex flex-col gap-1 font-medium md:col-span-2">Nome
          <input name="name" required defaultValue={p?.name} className="input" />
        </label>
        <label className="flex flex-col gap-1 font-medium md:col-span-2">Descrição
          <textarea name="description" rows={3} defaultValue={p?.description ?? ""} className="input h-auto py-2" />
        </label>
        <label className="flex flex-col gap-1 font-medium">Categoria
          <select name="category_id" defaultValue={p?.category_id} className="input">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">Preço (R$)
          <input name="price" required inputMode="decimal" placeholder="0,00" defaultValue={p ? centsToInput(p.price_cents) : ""} className="input" />
        </label>
        <label className="flex flex-col gap-1 font-medium">Setor de produção
          <select name="sector" defaultValue={p?.sector ?? "kitchen"} className="input">
            <option value="kitchen">Cozinha</option>
            <option value="bar">Bar</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">Publicação
          <select name="status" defaultValue={p?.status ?? "draft"} className="input">
            <option value="draft">Rascunho (não aparece ao público)</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado (não entra em novos pedidos)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-medium md:col-span-2">
          <input type="checkbox" name="available" defaultChecked={p?.available ?? true} className="size-5" />
          Disponível agora
        </label>
        <div className="md:col-span-2"><button className="btn btn-primary w-full md:w-auto">{isNew ? "Criar produto" : "Salvar produto"}</button></div>
      </form>

      {!isNew && p && (
        <>
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg font-bold">Foto</h2>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={`Foto de ${p.name}`} className="max-h-64 w-auto rounded-xl object-cover" />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-400 p-6 text-center text-slate-700">Nenhuma foto enviada. Use fotos próprias do estabelecimento.</p>
            )}
            <form action={uploadImage} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required aria-label="Escolher foto" className="min-w-0 flex-1" />
              <button className="btn">{imageUrl ? "Substituir foto" : "Enviar foto"}</button>
            </form>
            <p className="text-sm text-slate-700">JPEG, PNG ou WebP, até 5 MB.</p>
            {imageUrl && (
              <form action={removeImage}><input type="hidden" name="id" value={p.id} /><button className="btn">Remover foto</button></form>
            )}
          </section>

          <section className="card flex flex-col gap-4">
            <h2 className="text-lg font-bold">Adicionais e variações</h2>
            {groups.length === 0 && <p className="text-slate-700">Nenhum grupo configurado.</p>}
            {groups.map((g) => (
              <div key={g.id} className="rounded-xl border border-slate-300 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="mr-auto font-bold">{g.name}</h3>
                  <span className="chip">{g.min_select > 0 ? `Obrigatório (mín. ${g.min_select})` : "Opcional"}</span>
                  <span className="chip">Máx. {g.max_select}</span>
                  <form action={deleteGroup}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="product_id" value={p.id} /><button className="btn h-9">Remover grupo</button></form>
                </div>
                <ul className="mt-2 flex flex-col gap-2">
                  {g.options.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto">{o.name} {o.price_cents > 0 && <strong>(+ {formatCents(o.price_cents)})</strong>} {!o.available && <span className="chip chip-open">Indisponível</span>}</span>
                      <form action={toggleOption}>
                        <input type="hidden" name="id" value={o.id} /><input type="hidden" name="product_id" value={p.id} />
                        <input type="hidden" name="available" value={String(!o.available)} />
                        <button className="btn h-9">{o.available ? "Marcar indisponível" : "Marcar disponível"}</button>
                      </form>
                      <form action={deleteOption}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="product_id" value={p.id} /><button className="btn h-9">Remover</button></form>
                    </li>
                  ))}
                </ul>
                <form action={addOption} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="group_id" value={g.id} /><input type="hidden" name="product_id" value={p.id} />
                  <input name="name" placeholder="Nova opção" aria-label="Nome da opção" required className="input min-w-0 flex-1" />
                  <input name="price" placeholder="Preço extra (0,00)" aria-label="Preço extra" inputMode="decimal" className="input w-40" />
                  <button className="btn">Adicionar opção</button>
                </form>
              </div>
            ))}
            <form action={addGroup} className="flex flex-wrap items-end gap-2 border-t pt-4">
              <input type="hidden" name="product_id" value={p.id} />
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">Novo grupo
                <input name="name" placeholder="Ex.: Ponto da carne" required className="input" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Mínimo
                <input name="min" type="number" min={0} defaultValue={0} className="input w-24" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Máximo
                <input name="max" type="number" min={1} defaultValue={1} className="input w-24" />
              </label>
              <button className="btn btn-primary">Criar grupo</button>
            </form>
            <p className="text-sm text-slate-700">Mínimo 0 = opcional; mínimo 1 ou mais = obrigatório.</p>
          </section>
        </>
      )}
    </main>
  );
}
