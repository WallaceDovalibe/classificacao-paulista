// coletar.js
// Robo de coleta automatica dos dados da FPFS (Federacao Paulista de Futsal)
// para o app de classificacao Sub-07 a Sub-10 (Serie A3).
//
// O que ele faz: abre, com um navegador invisivel (Playwright), as mesmas
// paginas que foram exploradas manualmente durante a construcao do app, extrai
// as tabelas que ja estao prontas no HTML de cada pagina (nenhuma dessas
// paginas carrega dados extra por clique -- todas as abas "Por Chave"/grupos ja
// vem no HTML, so escondidas por CSS ate voce clicar; por isso nao precisamos
// simular nenhum clique) e salva tudo em dados.json.
//
// Uso: node coletar.js
// Precisa de: npm install playwright && npx playwright install --with-deps chromium

const { chromium } = require("playwright");
const fs = require("fs");

const EVENTOS = { "Sub-07": 918, "Sub-08": 919, "Sub-09": 920, "Sub-10": 921 };
const GRUPOS = ["Grupo 1", "Grupo 2", "Grupo 3", "Grupo 4", "Grupo 5", "Grupo 6"];

const ALIASES_CLUBE = {
  "GUARULHENSE/TBC TRANPORTES": "GUARULHENSE/TBC TRANSPORTES",
};
function normalizarClube(nome) {
  const limpo = nome.replace(/\s+/g, " ").trim();
  return ALIASES_CLUBE[limpo] || limpo;
}

async function extrairTabelaClassificacao(page, containerId) {
  return page.$eval(`#${containerId}`, (div) => {
    const linhas = Array.from(div.querySelectorAll(":scope table tbody > tr")).filter(
      (tr) => tr.querySelectorAll(":scope > td").length >= 10
    );
    return linhas.map((tr) => {
      const tds = tr.querySelectorAll(":scope > td");
      const clube = tds[2].querySelector("div.col-8, div:last-child")?.textContent.trim() || tds[2].textContent.trim();
      const num = (i) => parseInt(tds[i].textContent.trim().replace(",", ""), 10) || 0;
      return { clube, v: num(5), e: num(6), d: num(7), gp: num(8), gc: num(9) };
    });
  });
}

async function extrairJogos(page, containerId, categoria, grupo) {
  return page.$eval(
    `#${containerId}`,
    (div, { categoria, grupo }) => {
      const linhas = Array.from(div.querySelectorAll(":scope table tbody > tr")).filter(
        (tr) => tr.querySelectorAll(":scope > td").length >= 4
      );
      return linhas.map((tr) => {
        const tds = tr.querySelectorAll(":scope > td");
        const [dia, mes] = tds[0].textContent.trim().split("/");
        const horario = tds[1].textContent.trim().replace("h", "");
        const local = tds[2].textContent.trim();
        const nomes = Array.from(tds[3].querySelectorAll(".nome_clube")).map((s) => s.textContent.trim());
        const resultText = tds[3].querySelector(".result")?.textContent.trim() || "";
        const [golsCasaTxt, golsForaTxt] = resultText.split("x").map((s) => s.trim());
        const jaAconteceu = golsCasaTxt !== "" && golsForaTxt !== "";
        const dataISO = `2026-${mes}-${dia}`;
        return {
          categoria,
          grupo,
          status: jaAconteceu ? "finalizado" : "agendado",
          data: dataISO,
          horario,
          local,
          mandante: nomes[0] || "",
          visitante: nomes[1] || "",
          golsMandante: jaAconteceu ? parseInt(golsCasaTxt, 10) : null,
          golsVisitante: jaAconteceu ? parseInt(golsForaTxt, 10) : null,
        };
      });
    },
    { categoria, grupo }
  );
}

async function extrairArtilharia(page, containerId) {
  return page.$eval(`#${containerId}`, (div) => {
    const linhas = Array.from(div.querySelectorAll(":scope table tbody > tr")).filter(
      (tr) => tr.querySelectorAll(":scope > td").length >= 4
    );
    return linhas.map((tr) => {
      const tds = tr.querySelectorAll(":scope > td");
      const jogador = tds[1].textContent.trim();
      const clube = tds[2].querySelector("div.col-8, div:last-child")?.textContent.trim() || tds[2].textContent.trim();
      const gols = parseInt(tds[3].textContent.trim(), 10) || 0;
      return { jogador, clube, gols };
    });
  });
}

async function acharAbaPorTexto(page, textoParcial) {
  return page.evaluate((texto) => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const tab = tabs.find((t) => t.textContent.includes(texto));
    return tab ? tab.getAttribute("href").slice(1) : null;
  }, textoParcial);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dados = {
    atualizadoEm: new Date().toISOString(),
    rankingGeral: [],
    torneioUniao: {},
    jogosUniao: [],
    artilheiros: [],
  };

  console.log("Coletando ranking geral (Acesso)...");
  await page.goto("https://eventos.admfutsal.com.br/ranking?grupo-cat=1&divisao=10", { waitUntil: "networkidle" });
  const rankingBruto = await page.$$eval("table", (tabelas) => {
    const t = tabelas.find((tb) => tb.classList.contains("table") && !tb.classList.contains("table-sm"));
    if (!t) return [];
    const linhas = Array.from(t.querySelectorAll(":scope > tbody > tr")).filter(
      (tr) => tr.querySelectorAll(":scope > td").length === 16
    );
    return linhas.map((tr) => {
      const tds = tr.querySelectorAll(":scope > td");
      const num = (i) => parseInt(tds[i].textContent.trim().replace(/[,.]/g, ""), 10) || 0;
      return {
        clube: tds[1].textContent.trim(),
        v: num(4), e: num(5), d: num(6), gp: num(7), gc: num(8),
        negativos: parseInt(tds[13].textContent.trim().replace(/[,.]/g, ""), 10) || 0,
      };
    });
  });
  dados.rankingGeral = rankingBruto.map((r) => [normalizarClube(r.clube), r.v, r.e, r.d, r.gp, r.gc, r.negativos]);

  for (const [categoria, eventoId] of Object.entries(EVENTOS)) {
    console.log(`Coletando ${categoria} (evento ${eventoId})...`);
    dados.torneioUniao[categoria] = {};

    await page.goto(`https://eventos.admfutsal.com.br/evento/${eventoId}`, { waitUntil: "networkidle" });
    for (const grupo of GRUPOS) {
      const containerId = await acharAbaPorTexto(page, `TORNEIO UNIAO - ${grupo.toUpperCase()}`);
      if (!containerId) { console.warn(`  aviso: aba "${grupo}" nao encontrada em ${categoria}`); continue; }
      const linhas = await extrairTabelaClassificacao(page, containerId);
      dados.torneioUniao[categoria][grupo] = linhas.map((l) => [normalizarClube(l.clube), l.v, l.e, l.d, l.gp, l.gc]);
    }

    await page.goto(`https://eventos.admfutsal.com.br/evento/${eventoId}/jogos`, { waitUntil: "networkidle" });
    for (const grupo of GRUPOS) {
      const containerId = await acharAbaPorTexto(page, `TORNEIO UNIAO - ${grupo.toUpperCase()}`);
      if (!containerId) continue;
      const jogos = await extrairJogos(page, containerId, categoria, grupo);
      jogos.forEach((j) => {
        j.mandante = normalizarClube(j.mandante);
        j.visitante = normalizarClube(j.visitante);
        dados.jogosUniao.push([
          j.categoria, j.grupo, j.status, j.data, j.horario, j.local,
          j.mandante, j.visitante, j.golsMandante, j.golsVisitante,
        ]);
      });
    }

    await page.goto(`https://eventos.admfutsal.com.br/evento/${eventoId}/artilharia`, { waitUntil: "networkidle" });
    const geralId = await acharAbaPorTexto(page, "Geral");
    const geralTop = (await extrairArtilharia(page, geralId)).slice(0, 30);
    geralTop.forEach((g) => (g.clube = normalizarClube(g.clube)));

    const uniaoPorJogador = new Map();
    for (const grupo of GRUPOS) {
      const containerId = await acharAbaPorTexto(page, `TORNEIO UNIAO - ${grupo.toUpperCase()}`);
      if (!containerId) continue;
      const linhas = await extrairArtilharia(page, containerId);
      linhas.forEach((l) => {
        const clube = normalizarClube(l.clube);
        const atual = uniaoPorJogador.get(l.jogador);
        if (atual) atual.gols += l.gols;
        else uniaoPorJogador.set(l.jogador, { jogador: l.jogador, clube, gols: l.gols });
      });
    }
    const uniaoRanking = Array.from(uniaoPorJogador.values()).sort((a, b) => b.gols - a.gols);

    const paulistaRanking = geralTop
      .map((g) => {
        const golsUniao = uniaoPorJogador.get(g.jogador)?.gols || 0;
        return { jogador: g.jogador, clube: g.clube, gols: g.gols - golsUniao };
      })
      .filter((p) => p.gols > 0)
      .sort((a, b) => b.gols - a.gols);

    const totalRanking = [...geralTop].sort((a, b) => b.gols - a.gols);

    uniaoRanking.slice(0, 15).forEach((j) => dados.artilheiros.push([categoria, "uniao", j.jogador, j.clube, j.gols]));
    paulistaRanking.slice(0, 15).forEach((j) => dados.artilheiros.push([categoria, "paulista", j.jogador, j.clube, j.gols]));
    totalRanking.slice(0, 15).forEach((j) => dados.artilheiros.push([categoria, "total", j.jogador, j.clube, j.gols]));
  }

  fs.writeFileSync("dados.json", JSON.stringify(dados, null, 2));
  console.log("dados.json gerado com sucesso.");
  await browser.close();
})().catch((err) => {
  console.error("Erro na coleta:", err);
  process.exit(1);
});
