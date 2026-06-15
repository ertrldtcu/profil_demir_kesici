import sys
from dataclasses import dataclass, field

from PyQt6.QtCore import Qt, QRectF, QPropertyAnimation, QEasingCurve
from PyQt6.QtGui import QColor, QFont, QPainter, QPen, QShortcut, QKeySequence
from PyQt6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QComboBox,
    QDoubleSpinBox,
    QFrame,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


COLORS = [
    "#2f80ed",
    "#27ae60",
    "#f2994a",
    "#9b51e0",
    "#eb5757",
    "#00a6a6",
    "#f2c94c",
    "#56ccf2",
]


class EasySpinBox(QSpinBox):
    def __init__(self):
        super().__init__()
        self.setButtonSymbols(QSpinBox.ButtonSymbols.NoButtons)
        self.setKeyboardTracking(False)

    def focusInEvent(self, event):
        super().focusInEvent(event)
        self.lineEdit().selectAll()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.lineEdit().clear()
            self.setFocus()
            return
        super().mousePressEvent(event)


class EasyDoubleSpinBox(QDoubleSpinBox):
    def __init__(self):
        super().__init__()
        self.setButtonSymbols(QDoubleSpinBox.ButtonSymbols.NoButtons)
        self.setKeyboardTracking(False)

    def focusInEvent(self, event):
        super().focusInEvent(event)
        self.lineEdit().selectAll()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.lineEdit().clear()
            self.setFocus()
            return
        super().mousePressEvent(event)

    def validate(self, text, pos):
        return super().validate(text.replace(",", "."), pos)

    def valueFromText(self, text):
        cleaned = text.strip().replace(",", ".")
        if not cleaned:
            return self.value()
        return float(cleaned)

    def textFromValue(self, value):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text or "0"


@dataclass
class Entry:
    quantity: int
    length_cm: int


@dataclass
class Piece:
    length_cm: int
    color: str
    cut: bool = False


@dataclass
class Plan:
    stock_length_cm: int
    pieces: list[Piece] = field(default_factory=list)

    @property
    def used_cm(self):
        return sum(piece.length_cm for piece in self.pieces)

    @property
    def waste_cm(self):
        return self.stock_length_cm - self.used_cm


def to_cm(value, unit):
    if unit == "cm":
        return int(round(value))
    return int(round(value * 100))


def format_length(cm):
    if cm % 100 == 0:
        return f"{cm // 100} m"
    meters = cm / 100
    text = f"{meters:.2f}".rstrip("0").rstrip(".")
    return f"{text} m"


def make_cut_plan(stock_entries, demand_entries):
    stocks = []
    for entry in stock_entries:
        stocks.extend([entry.length_cm] * entry.quantity)

    demands = []
    for entry in demand_entries:
        demands.extend([entry.length_cm] * entry.quantity)

    stocks.sort()
    demands.sort(reverse=True)

    plans = [Plan(length) for length in stocks]
    missing = []

    for demand in demands:
        best_index = None
        best_remaining = None

        for index, plan in enumerate(plans):
            remaining = plan.stock_length_cm - plan.used_cm
            if remaining >= demand and (best_remaining is None or remaining - demand < best_remaining):
                best_index = index
                best_remaining = remaining - demand

        if best_index is None:
            missing.append(demand)
            continue

        color = COLORS[len(plans[best_index].pieces) % len(COLORS)]
        plans[best_index].pieces.append(Piece(demand, color))

    used_plans = [plan for plan in plans if plan.pieces]
    used_plans.sort(key=lambda plan: (plan.stock_length_cm, plan.waste_cm), reverse=True)
    return used_plans, missing


class EntryPanel(QGroupBox):
    def __init__(self, title):
        super().__init__(title)
        self.entries = []

        self.quantity = EasySpinBox()
        self.quantity.setRange(1, 999)
        self.quantity.setValue(1)
        self.quantity_minus = QPushButton("-")
        self.quantity_plus = QPushButton("+")
        self.quantity_minus.setObjectName("stepButton")
        self.quantity_plus.setObjectName("stepButton")
        self.quantity_minus.clicked.connect(self.quantity.stepDown)
        self.quantity_plus.clicked.connect(self.quantity.stepUp)

        self.length = EasyDoubleSpinBox()
        self.length.setRange(0.01, 9999)
        self.length.setDecimals(2)
        self.length.setValue(1)
        self.length.setSingleStep(0.5)
        self.length_minus = QPushButton("-")
        self.length_plus = QPushButton("+")
        self.length_minus.setObjectName("stepButton")
        self.length_plus.setObjectName("stepButton")
        self.length_minus.clicked.connect(self.length.stepDown)
        self.length_plus.clicked.connect(self.length.stepUp)

        self.unit = QComboBox()
        self.unit.addItems(["metre", "cm"])

        self.add_button = QPushButton("Ekle")
        self.add_button.clicked.connect(self.add_entry)

        self.list_widget = QListWidget()
        self.list_widget.setSpacing(3)
        self.list_widget.setMinimumHeight(118)
        self.list_widget.setVerticalScrollMode(QAbstractItemView.ScrollMode.ScrollPerPixel)
        self.list_widget.verticalScrollBar().setSingleStep(12)

        form = QGridLayout()
        form.setHorizontalSpacing(6)
        form.setVerticalSpacing(5)
        form.addWidget(QLabel("Adet"), 0, 0)
        form.addWidget(QLabel("Uzunluk"), 0, 3)
        form.addWidget(QLabel("Birim"), 0, 6)
        form.addWidget(self.quantity, 1, 0)
        form.addWidget(self.quantity_minus, 1, 1)
        form.addWidget(self.quantity_plus, 1, 2)
        form.addWidget(self.length, 1, 3)
        form.addWidget(self.length_minus, 1, 4)
        form.addWidget(self.length_plus, 1, 5)
        form.addWidget(self.unit, 1, 6)
        form.addWidget(self.add_button, 1, 7)
        form.setColumnStretch(3, 1)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(7)
        layout.addLayout(form)
        layout.addWidget(self.list_widget)

        for spin in (self.quantity, self.length):
            spin.lineEdit().returnPressed.connect(self.add_entry)

    def add_entry(self):
        unit = self.unit.currentText()
        length_cm = to_cm(self.length.value(), unit)
        if length_cm <= 0:
            return

        entry = Entry(self.quantity.value(), length_cm)
        self.entries.append(entry)
        self._add_row(entry)
        self.length.selectAll()
        self.length.setFocus()

    def _add_row(self, entry):
        item = QListWidgetItem()
        row = QWidget()
        layout = QHBoxLayout(row)
        layout.setContentsMargins(6, 2, 6, 2)

        label = QLabel(f"{entry.quantity} adet x {format_length(entry.length_cm)}")
        label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)

        remove = QPushButton("X")
        remove.setFixedWidth(42)
        remove.clicked.connect(lambda: self.remove_entry(item, entry))

        layout.addWidget(label)
        layout.addWidget(remove)

        item.setSizeHint(row.sizeHint())
        self.list_widget.addItem(item)
        self.list_widget.setItemWidget(item, row)

    def remove_entry(self, item, entry):
        row = self.list_widget.row(item)
        if row >= 0:
            self.list_widget.takeItem(row)
        if entry in self.entries:
            self.entries.remove(entry)


class CutBar(QWidget):
    def __init__(self, plan, max_length_cm):
        super().__init__()
        self.plan = plan
        self.max_length_cm = max_length_cm
        self.setMinimumHeight(46)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        margin_x = 4
        y = 8
        height = 28
        full_width = max(120, self.width() - margin_x * 2)
        bar_width = max(70, full_width * self.plan.stock_length_cm / self.max_length_cm)

        x = margin_x
        painter.setPen(QPen(QColor("#d6dbe3"), 1))
        painter.setBrush(QColor("#eef1f5"))
        painter.drawRoundedRect(QRectF(x, y, bar_width, height), 7, 7)

        for piece in self.plan.pieces:
            piece_width = bar_width * piece.length_cm / self.plan.stock_length_cm
            color = QColor("#5d6673") if piece.cut else QColor(piece.color)
            painter.setBrush(color)
            painter.setPen(QPen(QColor("#ffffff"), 1))
            painter.drawRoundedRect(QRectF(x, y, piece_width, height), 5, 5)

            if piece_width > 44:
                painter.setPen(QColor("#ffffff"))
                painter.drawText(QRectF(x, y, piece_width, height), Qt.AlignmentFlag.AlignCenter, format_length(piece.length_cm))
            x += piece_width

        if self.plan.waste_cm > 0:
            waste_width = bar_width * self.plan.waste_cm / self.plan.stock_length_cm
            painter.setBrush(QColor("#d8dde6"))
            painter.setPen(QPen(QColor("#ffffff"), 1))
            painter.drawRoundedRect(QRectF(x, y, waste_width, height), 5, 5)
            if waste_width > 52:
                painter.setPen(QColor("#4b5563"))
                painter.drawText(QRectF(x, y, waste_width, height), Qt.AlignmentFlag.AlignCenter, format_length(self.plan.waste_cm))

    def mousePressEvent(self, event):
        clicked_x = event.position().x()
        margin_x = 4
        full_width = max(120, self.width() - margin_x * 2)
        bar_width = max(70, full_width * self.plan.stock_length_cm / self.max_length_cm)

        x = margin_x
        for piece in self.plan.pieces:
            piece_width = bar_width * piece.length_cm / self.plan.stock_length_cm
            if x <= clicked_x <= x + piece_width:
                piece.cut = not piece.cut
                self.update()
                return
            x += piece_width


class SmoothScrollArea(QScrollArea):
    def __init__(self):
        super().__init__()
        self.scroll_animation = QPropertyAnimation(self.verticalScrollBar(), b"value", self)
        self.scroll_animation.setDuration(130)
        self.scroll_animation.setEasingCurve(QEasingCurve.Type.OutCubic)

    def wheelEvent(self, event):
        bar = self.verticalScrollBar()
        target = bar.value() - int(event.angleDelta().y() * 0.55)
        target = max(bar.minimum(), min(bar.maximum(), target))

        self.scroll_animation.stop()
        self.scroll_animation.setStartValue(bar.value())
        self.scroll_animation.setEndValue(target)
        self.scroll_animation.start()
        event.accept()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Profil Kesim Planlayıcı")
        self.resize(1120, 760)

        self.stock_panel = EntryPanel("Eldeki Profiller")
        self.demand_panel = EntryPanel("İstenen Kesimler")

        self.calculate_button = QPushButton("Hesapla")
        self.calculate_button.setObjectName("primaryButton")
        self.calculate_button.clicked.connect(self.calculate)

        QShortcut(QKeySequence("Ctrl+Return"), self, self.calculate)

        self.result_area = SmoothScrollArea()
        self.result_area.setWidgetResizable(True)
        self.result_area.verticalScrollBar().setSingleStep(14)
        self.result_area.horizontalScrollBar().setSingleStep(14)
        self.result_content = QWidget()
        self.result_layout = QVBoxLayout(self.result_content)
        self.result_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.result_layout.setContentsMargins(8, 8, 8, 8)
        self.result_layout.setSpacing(7)
        self.result_area.setWidget(self.result_content)

        input_layout = QHBoxLayout()
        input_layout.setSpacing(10)
        input_layout.addWidget(self.stock_panel)
        input_layout.addWidget(self.demand_panel)

        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(14, 10, 14, 12)
        layout.setSpacing(8)
        title = QLabel(".") # QLabel("Profil Kesim Planlayıcı")
        title.setObjectName("title")
        subtitle = QLabel("Eldeki profilleri ve ihtiyaç duyulan parçaları girin, sonra kesim planını oluşturun.")
        subtitle.setObjectName("subtitle")

        layout.addWidget(title)
        layout.addWidget(subtitle)
        layout.addLayout(input_layout)
        layout.addWidget(self.calculate_button)
        layout.addWidget(QLabel("Kesim Planı"))
        layout.addWidget(self.result_area, 1)

        self.setCentralWidget(page)

    def calculate(self):
        if not self.stock_panel.entries or not self.demand_panel.entries:
            QMessageBox.information(self, "Eksik Bilgi", "Eldeki profiller ve istenen kesimler listesine en az birer satır ekleyin.")
            return

        plans, missing = make_cut_plan(self.stock_panel.entries, self.demand_panel.entries)
        self.show_results(plans, missing)

    def show_results(self, plans, missing):
        while self.result_layout.count():
            item = self.result_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

        if missing:
            counts = {}
            for length in missing:
                counts[length] = counts.get(length, 0) + 1
            missing_text = ", ".join(f"{count} adet {format_length(length)}" for length, count in sorted(counts.items(), reverse=True))
            warning = QLabel(f"Karşılanamayan parçalar: {missing_text}")
            warning.setObjectName("warning")
            self.result_layout.addWidget(warning)

        if not plans:
            self.result_layout.addWidget(QLabel("Uygun kesim planı bulunamadı."))
            return

        total_waste = sum(plan.waste_cm for plan in plans)
        summary = QLabel(f"Kullanılacak profil: {len(plans)} adet    Toplam fire: {format_length(total_waste)}")
        summary.setObjectName("summary")
        self.result_layout.addWidget(summary)

        max_length = max(plan.stock_length_cm for plan in plans)
        for index, plan in enumerate(plans, start=1):
            box = QFrame()
            box.setObjectName("resultCard")
            row = QVBoxLayout(box)

            pieces = " + ".join(format_length(piece.length_cm) for piece in plan.pieces)
            header = QLabel(
                f"{index}. profil - {format_length(plan.stock_length_cm)} | Kes: {pieces} | Fire: {format_length(plan.waste_cm)}"
            )
            header.setWordWrap(True)
            row.addWidget(header)
            row.addWidget(CutBar(plan, max_length))
            self.result_layout.addWidget(box)


def apply_style(app):
    app.setFont(QFont("Segoe UI", 12))
    app.setStyleSheet(
        """
        QMainWindow, QWidget {
            background: #f6f7f9;
            color: #20242b;
        }
        QLabel#title {
            font-size: 26px;
            font-weight: 700;
            margin-top: 2px;
        }
        QLabel#subtitle {
            color: #606874;
            margin-bottom: 4px;
        }
        QGroupBox {
            background: #ffffff;
            border: 1px solid #dfe3ea;
            border-radius: 8px;
            margin-top: 10px;
            padding: 10px 8px 8px 8px;
            font-weight: 700;
        }
        QGroupBox::title {
            subcontrol-origin: margin;
            left: 14px;
            padding: 0 6px;
        }
        QSpinBox, QDoubleSpinBox, QComboBox {
            background: #ffffff;
            border: 1px solid #cfd6df;
            border-radius: 7px;
            min-height: 34px;
            padding: 2px 8px;
        }
        QPushButton {
            background: #eef1f5;
            border: 1px solid #d5dbe4;
            border-radius: 7px;
            min-height: 34px;
            padding: 4px 12px;
            font-weight: 600;
        }
        QPushButton:hover {
            background: #e3e8ef;
        }
        QPushButton#stepButton {
            min-width: 32px;
            max-width: 32px;
            padding: 4px 0;
            font-size: 18px;
            font-weight: 800;
        }
        QPushButton#primaryButton {
            background: #2367d1;
            color: white;
            border: 0;
            min-height: 42px;
            font-size: 17px;
        }
        QListWidget {
            background: #f8fafc;
            border: 1px solid #e0e5ec;
            border-radius: 8px;
            padding: 4px;
        }
        QFrame#resultCard {
            background: #ffffff;
            border: 1px solid #dfe3ea;
            border-radius: 8px;
            padding: 5px;
            margin-bottom: 5px;
        }
        QLabel#summary {
            font-size: 16px;
            font-weight: 700;
            margin: 3px 0;
        }
        QLabel#warning {
            background: #fff4d6;
            border: 1px solid #f0d48a;
            border-radius: 8px;
            padding: 7px;
            color: #5f4700;
            font-weight: 700;
        }
        """
    )


def main():
    app = QApplication(sys.argv)
    apply_style(app)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
