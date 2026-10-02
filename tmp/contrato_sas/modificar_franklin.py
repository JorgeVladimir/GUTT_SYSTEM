import copy, docx
F = r"C:\Users\DELL\Documents\TRABAJOS ADICIONALES\GUTT COMPANY SAS\Contrato_Socios_TECNIFIN_SAS_v6_final.docx"
d = docx.Document(F)

def poner(par, texto):
    runs = par.runs
    runs[0].text = texto
    for r in runs[1:]: r.text = ""

VIEJO = "el trabajo histórico preexistente declarado por Franklin Lechón se valora en USD 15.900 y el de Jorge Vladimir Tuquinga Tituaña en USD 20.000, mientras que el trabajo pendiente"
NUEVO = ("el trabajo histórico de Franklin Lechón y el de Jorge Vladimir Tuquinga Tituaña se valoran en USD 20.000 cada uno; en el caso de Franklin Lechón, "
         "USD 15.900 corresponden a trabajo preexistente declarado y USD 4.100 a trabajo adicional de igualación, no pagado en efectivo, que comprende el "
         "desarrollo del sitio web de la compañía y otras actividades acordadas por acta, con registro de horas y entregables, a fin de mantener "
         "participaciones iguales. El trabajo pendiente")
par = [p for p in d.paragraphs if VIEJO in p.text]
assert len(par) == 1, f"parrafo 10.6 encontrado {len(par)} veces"
poner(par[0], par[0].text.replace(VIEJO, NUEVO))

t = [x for x in d.tables if x.cell(0, 0).text.strip().startswith("Cuadro 10.6-A")]
assert len(t) == 1
t = t[0]
filas = {r.cells[0].text.strip(): r for r in t.rows}
base = filas["Pruebas, documentación y despliegue de demostración"]
nueva = copy.deepcopy(base._tr)
base._tr.addnext(nueva)
fila_nueva = [r for r in t.rows if r._tr is nueva][0]
for c, v in zip(fila_nueva.cells, ["Trabajo adicional de igualación: sitio web de la compañía y actividades acordadas por acta", "164", "USD 25/h", "USD 4.100"]):
    poner(c.paragraphs[0], v)
sub = filas["Subtotal A. Aporte en trabajo histórico"]
poner(sub.cells[1].paragraphs[0], "784"); poner(sub.cells[3].paragraphs[0], "USD 20.000")
poner(filas["TOTAL"].cells[3].paragraphs[0], "USD 25.250")
d.save(F)

d = docx.Document(F)
t = [x for x in d.tables if x.cell(0, 0).text.strip().startswith("Cuadro 10.6-A")][0]
for r in t.rows[5:]: print(" | ".join(c.text for c in r.cells))
print([p.text[:200] for p in d.paragraphs if p.text.startswith("10.6. ")][0])
