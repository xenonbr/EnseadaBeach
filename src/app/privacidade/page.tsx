import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade e LGPD | Cabana Enseada Beach Trancoso",
  description: "Política de privacidade e proteção de dados (LGPD) da Cabana Enseada Beach Trancoso.",
};

export default function PrivacidadePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-8">
      <header className="flex items-center gap-3">
        <Link href="/" className="btn">
          ← Início
        </Link>
        <h1 className="text-2xl font-bold text-ocean md:text-3xl">Privacidade e Proteção de Dados (LGPD)</h1>
      </header>

      <section className="card flex flex-col gap-3 text-sm leading-relaxed text-slate-800">
        <h2 className="text-lg font-bold text-ocean">1. Coleta Mínima de Dados</h2>
        <p>
          A plataforma digital da <strong>Cabana Enseada Beach Trancoso</strong> adota o princípio da minimização de dados (Lei nº 13.709/2018 — LGPD). Para consultar o cardápio ou realizar pedidos na mesa, <strong>não exigimos cadastro prévio, CPF, telefone nem dados de cartão de crédito</strong>.
        </p>

        <h2 className="text-lg font-bold text-ocean">2. Dados Coletados e Finalidade</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Nome ou apelido opcional na mesa:</strong> informado voluntariamente apenas para facilitar a confirmação presencial e a entrega do pedido pelo atendente.
          </li>
          <li>
            <strong>Token temporário do dispositivo (`localStorage`):</strong> código aleatório não identificável gerado no seu aparelho exclusivamente para manter seu carrinho separado e permitir que você visualize apenas os seus próprios pedidos durante a sessão da mesa, sem expor dados a outros clientes na mesma mesa.
          </li>
          <li>
            <strong>Registros operacionais de pedidos e conta:</strong> itens solicitados, horários e valores, mantidos para conferência da conta e obrigações fiscais/legais.
          </li>
        </ul>

        <h2 className="text-lg font-bold text-ocean">3. Acesso, Segurança e Retenção</h2>
        <p>
          O acesso aos registros operacionais é restrito à equipe autorizada mediante autenticação e controle de permissões no banco de dados (Row Level Security). Não compartilhamos dados com terceiros para fins publicitários.
        </p>

        <h2 className="text-lg font-bold text-ocean">4. Direitos do Titular</h2>
        <p>
          Para dúvidas ou solicitações referentes a dados pessoais (exclusão ou esclarecimentos sobre apelido informado em pedido), procure a gerência presencialmente no estabelecimento ou pelos canais oficiais divulgados na página inicial.
        </p>
      </section>
    </main>
  );
}
