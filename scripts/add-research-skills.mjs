// Nicht-destruktiv: legt die Standard-Recherche-Skills an, falls sie fehlen
// (Live-DB-sicher, kein deleteMany). Aufruf: node scripts/add-research-skills.mjs
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SKILLS = [
  { name: "Mitbewerber", promptTmpl: "Recherchiere aktuelle Aktivitäten der Mitbewerber des Kunden: Produkt-Launches, digitale Initiativen (Portale, Apps, KI), Partnerschaften, Übernahmen, Preis- oder Strategieänderungen." },
  { name: "Fachmedien & Branchennews", promptTmpl: "Durchsuche Fachmedien und Branchenportale nach Neuigkeiten zum Kunden und seiner Branche: Marktentwicklungen, Studien, Trends, Interviews und Berichte mit direktem Bezug zu den strategischen Themen des Kunden." },
  { name: "Plattformen & Portale", promptTmpl: "Suche nach Entwicklungen rund um digitale Plattformen, Kundenportale, E-Commerce und Self-Service in der Branche des Kunden: neue Angebote, Relaunches, Technologieentscheidungen – auch bei branchennahen Vorreitern." },
  { name: "Unternehmensmeldungen", promptTmpl: "Recherchiere offizielle Meldungen des Kunden selbst: Pressemitteilungen, Investitionen, Führungswechsel, Standorte, Quartalszahlen, Auszeichnungen und größere Projekte." },
  { name: "Stellenausschreibungen & Organisation", promptTmpl: "Suche nach Stellenausschreibungen und Organisationssignalen des Kunden mit Digitalbezug (IT, Digital, E-Commerce, Daten/KI, Marketing-Technologie) – sie zeigen, wo intern investiert wird." },
];

async function main() {
  for (const s of SKILLS) {
    const existing = await db.skill.findFirst({ where: { scope: "research", name: s.name } });
    if (existing) {
      console.log(`vorhanden: ${s.name}`);
      continue;
    }
    await db.skill.create({ data: { ...s, scope: "research" } });
    console.log(`angelegt:  ${s.name}`);
  }
  console.log("Recherche-Skills gesamt:", await db.skill.count({ where: { scope: "research" } }));
}

main().finally(() => db.$disconnect());
