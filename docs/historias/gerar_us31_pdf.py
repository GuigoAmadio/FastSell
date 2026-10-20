"""Gera docs/historias/US31_Catalogo_Base.pdf no mesmo visual do Historias_Usuario.pdf.

Uso:  python3 docs/historias/gerar_us31_pdf.py
Requer: reportlab e as fontes Liberation (Sans/Serif) e DejaVu Sans instaladas.
"""
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONTS = {
    "Sans": "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "Sans-Bold": "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "Serif": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "Serif-Bold": "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "Serif-Italic": "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf",
    "Symbols": "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
}
for name, path in FONTS.items():
    pdfmetrics.registerFont(TTFont(name, path))

BLUE = (0.180, 0.455, 0.710)  # cor dos títulos de seção do documento original
LEFT = 64.9
RIGHT = 547.1
BULLET_X = 84.0
TEXT_X = 100.0

STORY = {
    "section": "-- CATÁLOGO E PRODUTOS --",
    "title": "US 31 - Catálogo Base de Produtos com Identificação Única",
    "meta": "Sprint 03  ·  5 pts",
    "description": (
        "Como administrador da loja, eu quero cadastrar os produtos em um catálogo central, "
        "com identificador único, variações (cor/tamanho), estoque por variação e imagens, "
        "para que a página de detalhes e a lista de favoritos mostrem ao comprador sempre "
        "os mesmos dados, corretos e atualizados."
    ),
    "criteria": [
        "Cada produto tem um ID único e permanente (e um slug legível). Cada variação, ou seja, "
        "cada combinação de cor e tamanho (ex.: camiseta preta M e preta G), tem SKU e estoque "
        "próprios. O mesmo ID é usado na busca, nos detalhes, nos favoritos e no carrinho.",
        "O estoque nunca fica negativo: a baixa é atômica e duas compras simultâneas da última "
        "unidade não são aceitas (base para a validação de estoque da US 14).",
        "Consulta de produtos e estoque aberta a qualquer comprador; cadastro, edição e "
        "desativação de produtos, variações e imagens restritos ao papel ADMIN.",
        "Produto desativado sai da vitrine, mas continua acessível pelo ID (favoritos e pedidos "
        "não quebram).",
    ],
    "tasks": [
        "Modelar categoria, marca, produto, variação e imagem no banco (migration)",
        "Criar endpoints de listagem, detalhe por ID/slug e consulta de estoque",
        "Criar CRUD administrativo com papel ADMIN e upload de imagens",
        "Popular catálogo de demonstração (seed) para homologação",
    ],
    "extras": [
        (
            "Objetivo funcional:",
            "Ter uma única fonte de dados de produto que as telas de detalhes (US 11) e de "
            "favoritos (US 13) consultam pelo mesmo identificador.",
        ),
        (
            "Relação com US 11 e US 13:",
            "A US 11 lê do catálogo fotos, ficha técnica, variações e estoque; a US 13 grava o ID "
            "do produto na lista do usuário e reabre os detalhes por esse ID. Nenhuma das duas "
            "funciona sem esta história.",
        ),
        (
            "Dependências resolvidas:",
            "O projeto não tinha tabela de produtos, identificação de itens, variações nem estoque; "
            "não havia como abrir um produto pelo ID nem associar um favorito a algo existente.",
        ),
        (
            "Justificativa do escopo:",
            "As US 11 e 13 descrevem telas, não a origem dos dados. Esta história cobre só o que "
            "as duas compartilham (estrutura e identificação dos produtos), sem repetir galeria, "
            "zoom ou o botão de coração, que continuam nas histórias originais.",
        ),
        (
            "Numeração:",
            "O documento original vai até a US 30; a US 31 entra na seção Catálogo e Produtos "
            "sem alterar a numeração existente.",
        ),
    ],
}


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def build(out: Path) -> None:
    c = canvas.Canvas(str(out), pagesize=letter)
    c.setTitle("US 31 - Catálogo Base de Produtos")
    c.setAuthor("FastSell — Gerenciamento de Projetos, PUC-Campinas")
    height = letter[1]
    y = height - 61 - 22  # baseline do título como no original

    # Cabeçalho idêntico ao do documento de histórias
    c.setFont("Sans", 28)
    c.drawString(LEFT, y, "Histórias de Usuário")
    y -= 22
    c.setFont("Serif-Bold", 12)
    c.drawString(LEFT, y, "Projeto: Aplicativo de E-commerce (Loja Virtual)")
    y -= 14
    c.setFont("Serif", 10)
    c.setFillColorRGB(0.333, 0.333, 0.333)
    c.drawString(LEFT, y, "Disciplina: Gerenciamento de Projetos — PUC-Campinas")
    c.setFillColorRGB(0, 0, 0)
    y -= 8
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.setLineWidth(0.75)
    c.line(LEFT, y, RIGHT, y)
    y -= 38

    # Seção
    c.setFont("Sans-Bold", 13)
    c.setFillColorRGB(*BLUE)
    c.drawString(LEFT, y, STORY["section"])
    c.setFillColorRGB(0, 0, 0)
    y -= 25

    # Card
    c.setFont("Serif-Bold", 12)
    c.drawString(LEFT, y, STORY["title"])
    y -= 14
    c.setFont("Serif-Italic", 9)
    c.setFillColorRGB(0.467, 0.467, 0.467)
    c.drawString(LEFT, y, STORY["meta"])
    c.setFillColorRGB(0, 0, 0)
    y -= 15
    c.setFont("Serif-Italic", 10)
    for line in wrap(STORY["description"], "Serif-Italic", 10, RIGHT - LEFT):
        c.drawString(LEFT, y, line)
        y -= 11.5
    y -= 6

    def label(text: str) -> None:
        nonlocal y
        c.setFont("Serif-Bold", 10)
        c.drawString(LEFT, y, text)
        y -= 13

    label("Critérios de Aceite:")
    for item in STORY["criteria"]:
        c.setFont("Symbols", 7)
        c.drawString(BULLET_X, y + 1, "●")
        c.setFont("Serif", 10)
        for i, line in enumerate(wrap(item, "Serif", 10, RIGHT - TEXT_X)):
            c.drawString(TEXT_X, y, line)
            y -= 12 if i < 0 else 11.5
        y -= 1.5

    y -= 2
    label("Tarefas do Card:")
    for item in STORY["tasks"]:
        c.setFont("Symbols", 9)
        c.drawString(BULLET_X, y, "☐")
        c.setFont("Serif", 10)
        c.drawString(TEXT_X - 4, y, item)
        y -= 12.5

    y -= 14
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(0.5)
    c.line(LEFT, y, RIGHT, y)

    c.showPage()
    c.save()


if __name__ == "__main__":
    target = Path(__file__).with_name("US31_Catalogo_Base.pdf")
    build(target)
    print(f"PDF gerado: {target}")
