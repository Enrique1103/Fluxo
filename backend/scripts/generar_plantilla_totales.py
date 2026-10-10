"""
Genera frontend/public/plantilla-totales-mensuales.xlsx: la plantilla que el usuario
descarga en Importar → Totales mensuales, completa en Excel y vuelve a subir.

Uso (desde backend/):  python scripts/generar_plantilla_totales.py
Requiere openpyxl y Pillow (Pillow solo para insertar el logo; no hace falta en el servidor).
"""
from pathlib import Path

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parents[2]
LOGO = ROOT / "frontend" / "public" / "favicon.png"  # ícono F de Fluxo (180px)
OUT = ROOT / "frontend" / "public" / "plantilla-totales-mensuales.xlsx"

HEADER_ROW = 7
DATA_ROWS = 120  # 10 años de meses

INDIGO = "312E81"
VIOLET = "A78BFA"
GRAY = "64748B"

wb = Workbook()
ws = wb.active
ws.title = "Totales mensuales"
ws.sheet_view.showGridLines = False

# Encabezado con logo
ws.row_dimensions[1].height = 24
ws.row_dimensions[2].height = 24
logo = XLImage(str(LOGO))
logo.width = logo.height = 52
ws.add_image(logo, "A1")

ws.merge_cells("B1:E1")
ws["B1"] = "Fluxo"
ws["B1"].font = Font(name="Calibri", size=20, bold=True, color=INDIGO)
ws.merge_cells("B2:E2")
ws["B2"] = "Plantilla de totales mensuales"
ws["B2"].font = Font(name="Calibri", size=12, color=GRAY)

instrucciones = [
    "1. Una fila por mes con el total de ingresos y de gastos que registraste en tu otra app.",
    "2. Mes en formato AAAA-MM (ej: 2025-03). Moneda: UYU, USD, etc. Montos sin signo (ej: 45000,50).",
    "3. Guardá el archivo y subilo en Fluxo → Importar → Totales mensuales.",
]
for i, text in enumerate(instrucciones, start=4):
    ws.merge_cells(start_row=i, start_column=1, end_row=i, end_column=5)
    ws.cell(row=i, column=1, value=text).font = Font(size=10, color=GRAY)

# Tabla
headers = ["Mes (AAAA-MM)", "Moneda", "Ingresos", "Gastos"]
thin = Side(style="thin", color="CBD5E1")
for col, h in enumerate(headers, start=1):
    c = ws.cell(row=HEADER_ROW, column=col, value=h)
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor=INDIGO)
    c.alignment = Alignment(horizontal="center", vertical="center")
    c.border = Border(bottom=Side(style="medium", color=VIOLET))
ws.row_dimensions[HEADER_ROW].height = 22

stripe = PatternFill("solid", fgColor="F5F3FF")
for r in range(HEADER_ROW + 1, HEADER_ROW + 1 + DATA_ROWS):
    for col in range(1, 5):
        c = ws.cell(row=r, column=col)
        c.border = Border(bottom=thin)
        if (r - HEADER_ROW) % 2 == 0:
            c.fill = stripe
    ws.cell(row=r, column=1).number_format = "@"          # texto: Excel no lo convierte en fecha
    ws.cell(row=r, column=1).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=2).alignment = Alignment(horizontal="center")
    ws.cell(row=r, column=3).number_format = "#,##0.00"
    ws.cell(row=r, column=4).number_format = "#,##0.00"

first, last = HEADER_ROW + 1, HEADER_ROW + DATA_ROWS
dv_cur = DataValidation(type="list", formula1='"UYU,USD,EUR,ARS,BRL"', allow_blank=True)
dv_cur.error, dv_cur.errorTitle = "Elegí una moneda de la lista", "Moneda"
dv_num = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
dv_num.error, dv_num.errorTitle = "El monto debe ser un número mayor o igual a 0", "Monto"
ws.add_data_validation(dv_cur)
ws.add_data_validation(dv_num)
dv_cur.add(f"B{first}:B{last}")
dv_num.add(f"C{first}:D{last}")

for col, width in zip("ABCDE", (18, 12, 18, 18, 4)):
    ws.column_dimensions[col].width = width
ws.freeze_panes = f"A{HEADER_ROW + 1}"

OUT.parent.mkdir(parents=True, exist_ok=True)
wb.save(OUT)
print(f"Plantilla generada: {OUT}")
