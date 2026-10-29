import { parseHTML } from "linkedom";
import { makeResponsive, describeReport } from "../src/lib/responsiveEmail";
const parse = (h: string) => parseHTML(h).document as unknown as Document;
const src = `<html><head><title>x</title></head><body>
<table width="800" style="width:800px"><tr>
  <td><img src="https://x/banner.png" width="800" height="300"></td></tr>
  <tr><td>Produto A com descrição longa aqui</td><td>Produto B com descrição longa aqui</td></tr>
</table></body></html>`;
const r = makeResponsive(src, parse);
console.log(describeReport(r.report));
console.log(r.html);
const again = makeResponsive(r.html, parse);
console.log("segunda vez:", describeReport(again.report), "estilos:", (again.html.match(/venaflow-responsive/g) ?? []).length);
const frag = makeResponsive("<p>Olá {Nome}</p>", parse);
console.log("fragmento:", describeReport(frag.report), frag.html.includes("{Nome}"));
