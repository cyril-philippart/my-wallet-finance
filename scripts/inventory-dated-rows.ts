import readXlsxFile from "read-excel-file/node";

const path = process.argv[2];
if (!path) throw new Error("Chemin manquant");

async function main(): Promise<void> {
  const sheets = await readXlsxFile(path!);
  for (const { sheet, data } of sheets.filter((entry) => ["Actions","ETF","Crypto","Milàn","SCPI","Assurance Vie","Dividendes"].includes(entry.sheet))) {
    let dates = 0;
    process.stdout.write(`\n### ${sheet}\n`);
    data.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
      if (!(value instanceof Date)) return;
      dates++;
      let label = "";
      for (let previous = rowIndex - 1; previous >= Math.max(0, rowIndex - 4); previous--) {
        const candidate = data[previous]?.[columnIndex];
        if (typeof candidate === "string" && candidate.trim() && !/^date/i.test(candidate.trim())) { label = candidate.trim(); break; }
      }
      const start = Math.max(0, columnIndex - 1);
      const cells = row.slice(start, columnIndex + 7).map((cell, offset) => {
        const rendered = cell instanceof Date ? cell.toISOString().slice(0,10) : cell === null ? "" : String(cell);
        return rendered ? `${start + offset + 1}:${rendered}` : "";
      }).filter(Boolean);
      process.stdout.write(`R${rowIndex + 1}C${columnIndex + 1}\t[${label || "sans libellé"}]\t${cells.join(" | ")}\n`);
    }));
    process.stdout.write(`TOTAL_DATES=${dates}\n`);
  }
}
main().catch((error:unknown)=>{process.stderr.write(`${error instanceof Error?error.message:"Erreur"}\n`);process.exitCode=1});
