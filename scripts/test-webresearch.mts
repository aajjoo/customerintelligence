// Manueller E2E-Test der Web-Recherche (echte Claude-API + Websuche).
// Aufruf: node --experimental-strip-types --env-file=.env scripts/test-webresearch.mts
import { runWebResearch } from "../src/lib/pipeline/webresearch.ts";

const profile = {
  name: "Netural GmbH",
  industry: "Digitalagentur",
  markets: "Österreich, DACH",
  competitors: ["TOWA", "Fusonic", "dynatrace (Produktumfeld)"],
  themes: ["KI-Lösungen", "Digitale Produkte", "Kundenportale"],
};

const skills = [
  { name: "Mitbewerber", promptTmpl: "Recherchiere aktuelle Aktivitäten der Mitbewerber des Kunden: Produkt-Launches, digitale Initiativen (Portale, Apps, KI), Partnerschaften, Übernahmen, Preis- oder Strategieänderungen." },
  { name: "Fachmedien & Branchennews", promptTmpl: "Durchsuche Fachmedien und Branchenportale nach Neuigkeiten zum Kunden und seiner Branche: Marktentwicklungen, Studien, Trends, Interviews und Berichte mit direktem Bezug zu den strategischen Themen des Kunden." },
];

const t0 = performance.now();
const { items, errors } = await runWebResearch(profile, skills, { days: 7 });
console.log(`Dauer: ${((performance.now() - t0) / 1000).toFixed(1)}s`);
console.log("Fehler:", errors.length ? errors : "keine");
console.log(`Items: ${items.length}`);
for (const i of items) {
  console.log(`- [${i.skillName}|${i.dimension}|${i.relevance}] ${i.titleDe}`);
  console.log(`  ${i.sourceName} – ${i.url}`);
}
