import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("./source.html");

const $ = cheerio.load(src);


type Root = {
    kitaplar: Kitap[];
    footnotes: string[];
};

type Kitap = {
    isim: string;
    kisimlar: Kisim[];
}

type Kisim = {
    isim: string;
    bolumler: Bolum[];
}

type Bolum = {
    isim: string;
    maddeler: Madde[];
}

type Madde = {
    no: string;
    lines: string[];
    fikralar: Fikra[];
}

type Fikra = {
    text: string;
}

///

const nsbp = " ";

let root: Root = { kitaplar: [], footnotes: [] };
let currentKitap: Kitap | undefined;
let currentKisim: Kisim | undefined;
let currentBolum: Bolum | undefined;
let currentMadde: Madde | undefined;
let nextCb: ((s: string) => void) | null = null;

let maddePrefixRegex = /^Madde (\d+(?:\/[A-Z])?) ?-(.*)/;
const ending = "5237 SAYILI KANUNA İŞLENEMEYEN HÜKÜMLER";

for (let child of $(".WordSection1").children()) {
    // if(child.attribs["class"] == "MsoNormal" && child.name == "p") continue;
    // if(child.attribs.style?.includes("text-align:center"))
    const text = $(child).text()
        .replaceAll(nsbp, " ")
        .replaceAll("\n", " ")
        .replaceAll("–", "-")
        .replaceAll(/\[(\d+)\]/g, "[^$1]")
        .trim()

    if (nextCb !== null) {
        nextCb(text);
        nextCb = null;
        continue;
    };

    if (text == ending) break;

    if (text.includes("KİTAP")) {
        let kitap: Kitap = {
            isim: "",
            kisimlar: [],
        };
        root.kitaplar.push(kitap);
        currentKitap = kitap;
        nextCb = (isim) => currentKitap!.isim = isim
        continue;
    }

    if (!currentKitap) continue;

    if (text.includes("KISIM")) {
        let kisim: Kisim = {
            isim: "",
            bolumler: [],
        };
        currentKitap.kisimlar.push(kisim);
        currentKisim = kisim;
        nextCb = (isim) => currentKisim!.isim = isim
        continue;
    }

    if (!currentKisim) continue;

    if (text.includes("BÖLÜM")) {
        let bolum: Bolum = {
            isim: "",
            maddeler: [],
        };
        currentKisim.bolumler.push(bolum);
        currentBolum = bolum;
        nextCb = (isim) => currentBolum!.isim = isim
        continue;
    }

    if (!currentBolum) continue;

    if (!currentMadde || (!text.length && !!currentMadde.no)) {
        let madde: Madde = {
            no: "",
            fikralar: [],
            lines: [],
        }
        currentBolum.maddeler.push(madde);
        currentMadde = madde;
    }

    if (!text.length) continue;

    let maddeNoMatch = text.match(maddePrefixRegex);
    if (maddeNoMatch) {
        currentMadde.no = maddeNoMatch[1];
        currentMadde.lines.push(maddeNoMatch[2].slice(1));
    } else {
        currentMadde.lines.push(text);
    }
}

currentBolum!.maddeler = currentBolum!.maddeler.filter(x => !!x.no);

for (let el of $(".MsoFootnoteText")) {
    let ftn = $(el.children[0]).attr("name")?.slice(4);
    if (!ftn) continue; // Theres 1 empty ftn in source
    let content = $(el.children[1]).text().replaceAll(nsbp, " ")
        .replaceAll("\n", " ")
        .replaceAll("–", "-")
        .trim();
    root.footnotes[Number(ftn)-1] = content;
}

///

const l = (x: string[]) => x.join("\n");

let md = l([
    "# Türk Ceza Kanunu",
    "",
    ...root.kitaplar.map((kitap, kitapIndex) => {
        return l([
            `## ${kitapIndex + 1}. Kitap: ${kitap.isim}`,
            "",
            ...kitap.kisimlar.map((kisim, kisimIndex) => l([
                `### ${kisimIndex + 1}. Kısım: ${kisim.isim}`,
                "",
                ...kisim.bolumler.map((bolum, bolumIndex) => l([
                    `#### ${bolumIndex + 1}. Bölüm: ${bolum.isim}`,
                    "",
                    ...bolum.maddeler.map((madde) => {
                        let name = madde.lines[0];

                        let lines = madde.lines.slice(1);

                        return l([
                            `##### TCK ${madde.no}`,
                            "",
                            `**${madde.no} - ${name}**`,
                            "",
                            `:   ${lines[0]}`,
                            ...(lines.length > 1 ? [
                                "",
                                lines.slice(1).map(x => "    " + x).join("\n\n"),
                            ] : [
                            ]),
                            "",
                        ]);
                    }),
                    "",
                ])),
            ])),
        ]);
    }),
    "",
    ...(root.footnotes.map((content, index) => (
        `[^${index+1}]: ${content}\n`
    ))),
    "",
]);



writeFileSync("root.json", JSON.stringify(root, null, 2))
writeFileSync("docs/index.md", md);
