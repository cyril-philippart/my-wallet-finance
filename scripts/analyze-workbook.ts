import readXlsxFile, { type CellValue } from "read-excel-file/node";

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error("Chemin du classeur manquant.");

function text(value: CellValue): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function main(): Promise<void> {
 const sheets = await readXlsxFile(workbookPath!);
 for (const { sheet, data: rows } of sheets) {
  const useful = rows
    .map((row, index) => ({ row: index + 1, values: row.map(text) }))
    .filter(({ values }) => values.some(Boolean));
  const maxColumns = useful.reduce((maximum, row) => Math.max(maximum, row.values.length), 0);
  process.stdout.write(`\n### ${sheet} — ${useful.length} lignes utiles, ${maxColumns} colonnes max\n`);
  for (const row of useful.slice(0, 18)) {
    const compact = row.values.map((value, index) => value ? `${index + 1}:${value.slice(0, 80)}` : "").filter(Boolean);
    process.stdout.write(`${row.row}\t${compact.join(" | ")}\n`);
  }
 }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Erreur inconnue"}\n`);
  process.exitCode = 1;
});
