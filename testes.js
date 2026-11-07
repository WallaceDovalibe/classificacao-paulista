// testes.js — confere a lógica do chaveamento do Mata-mata (index.html).
// Rode com: node testes.js   (o coletar.js também roda isto após cada coleta e só avisa no log)
const fs = require("fs");
const src = fs.readFileSync("index.html", "utf8");
let falhas = 0, total = 0;
function ok(cond, msg) { total++; if (!cond) { falhas++; console.error("FALHOU: " + msg); } }

function pega(re) { const m = src.match(re); if (!m) throw new Error("não achei no index.html: " + re); return m[0]; }
const feed = pega(/var FEED_MM = \{[^\n]*\};/);
const rota = pega(/var ROTA_MM = \{[^\n]*\};/);
const ini = src.indexOf("function montarChaveMM");
const fim = src.indexOf("function CronometroMM");
if (ini < 0 || fim < 0) throw new Error("montarChaveMM não encontrada");
const api = new Function(feed + "\n" + rota + "\n" + src.slice(ini, fim) + "\nreturn { montarChaveMM: montarChaveMM, FEED_MM: FEED_MM, ROTA_MM: ROTA_MM };")();

// 1) Rotas coerentes com os alimentadores: quem vence/perde o jogo n vai para o jogo certo
Object.keys(api.ROTA_MM).forEach(function (n) {
  const r = api.ROTA_MM[n];
  const dv = api.FEED_MM[r[0]], dp = api.FEED_MM[r[1]];
  ok(dv && (dv[0] == n || dv[1] == n) && dv[2] === "v", "J" + n + " vencedor deveria ir para J" + r[0]);
  ok(dp && (dp[0] == n || dp[1] == n) && dp[2] === "p", "J" + n + " perdedor deveria ir para J" + r[1]);
});
// finais: 3º/4º (J11) = perdedores de J5/J6; 5º/6º (J10) = vencedores de J7/J8
ok(api.FEED_MM[11][2] === "p" && api.FEED_MM[11][0] === 5 && api.FEED_MM[11][1] === 6, "J11 (3º/4º) = perdedores de J5 e J6");
ok(api.FEED_MM[10][2] === "v" && api.FEED_MM[10][0] === 7 && api.FEED_MM[10][1] === 8, "J10 (5º/6º) = vencedores de J7 e J8");
ok(api.FEED_MM[9][2] === "v" && api.FEED_MM[12][2] === "p", "J9 = vencedores, J12 = perdedores");

// 2) Chave com zebra (cabeça de chave 1 cai nas quartas): jogos precisam cair no slot certo
function tie(a, pa, b, pb, fase, venc) {
  return { serie: "Ouro", fase: fase, a: a, b: b, posA: pa, posB: pb,
    vencedor: venc || null, perdedor: venc ? (venc === a ? b : a) : null };
}
const quartas = [tie("T1", 1, "T8", 8, "Quartas", "T8"), tie("T2", 2, "T7", 7, "Quartas", "T2"),
                 tie("T3", 3, "T6", 6, "Quartas", "T3"), tie("T4", 4, "T5", 5, "Quartas", "T4")];
// J5 = V1xV4 = T8xT4 ; J6 = V2xV3 = T2xT3 ; J7 = P1xP4 = T1xT5 ; J8 = P2xP3 = T7xT6
const semis = [tie("T4", 4, "T8", 8, "Semifinal", "T4"), tie("T2", 2, "T3", 3, "Semifinal", "T2"),
               tie("T1", 1, "T5", 5, "Semifinal", "T1"), tie("T6", 6, "T7", 7, "Semifinal", "T6")];
const finais = [tie("T2", 2, "T4", 4, "Final"), tie("T3", 3, "T8", 8, "Final"), tie("T1", 1, "T6", 6, "Final"), tie("T5", 5, "T7", 7, "Final")];
const s = api.montarChaveMM([].concat(quartas, semis, finais), "Ouro");
const par = function (n) { const t = s[n - 1].tie; return t ? [t.a, t.b].sort().join("x") : null; };
ok(par(1) === "T1xT8" && par(4) === "T4xT5", "quartas J1 e J4");
ok(par(5) === "T4xT8", "J5 deveria ser T8xT4, veio " + par(5));
ok(par(6) === "T2xT3", "J6 deveria ser T2xT3, veio " + par(6));
ok(par(7) === "T1xT5", "J7 deveria ser T1xT5, veio " + par(7));
ok(par(8) === "T6xT7", "J8 deveria ser T7xT6, veio " + par(8));
ok(par(9) === "T2xT4", "J9 (1º/2º) = vencedores de J5 e J6, veio " + par(9));
ok(par(11) === "T3xT8", "J11 (3º/4º) = perdedores de J5 e J6, veio " + par(11));
ok(par(10) === "T1xT6", "J10 (5º/6º) = vencedores de J7 e J8, veio " + par(10));
ok(par(12) === "T5xT7", "J12 (7º/8º) = perdedores de J7 e J8, veio " + par(12));

console.log(falhas ? ("Testes do chaveamento: " + falhas + " falha(s) em " + total) : ("Testes do chaveamento: " + total + " verificações OK"));
if (falhas) process.exit(1);
