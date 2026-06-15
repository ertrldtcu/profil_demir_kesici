const COLORS = [
  "#2f80ed",
  "#27ae60",
  "#f2994a",
  "#9b51e0",
  "#eb5757",
  "#00a6a6",
  "#f2c94c",
  "#56ccf2",
];

const stockEntries = [];
const demandEntries = [];

const $ = (id) => document.getElementById(id);

function parseNumber(value) {
  const normalized = String(value).trim().replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toCm(value, unit) {
  return unit === "cm" ? Math.round(value) : Math.round(value * 100);
}

function formatLength(cm) {
  if (cm % 100 === 0) return `${cm / 100} m`;
  return `${(cm / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} m`;
}

function addEntry(target, quantityInput, lengthInput, unitInput) {
  const quantity = Math.max(1, Math.round(parseNumber(quantityInput.value)));
  const length = parseNumber(lengthInput.value);
  const lengthCm = toCm(length, unitInput.value);

  if (!lengthCm || lengthCm <= 0) {
    showMessage("Uzunluk 0'dan büyük olmalı.");
    lengthInput.focus();
    return;
  }

  target.push({ quantity, lengthCm });
  quantityInput.value = quantity;
  lengthInput.value = "";
  lengthInput.focus();
  renderLists();
  hideMessage();
}

function renderLists() {
  renderList($("stockList"), stockEntries);
  renderList($("demandList"), demandEntries);
}

function renderList(container, entries) {
  container.innerHTML = "";

  entries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "item";

    const text = document.createElement("div");
    text.textContent = `${entry.quantity} adet x ${formatLength(entry.lengthCm)}`;

    const button = document.createElement("button");
    button.className = "delete-button";
    button.type = "button";
    button.textContent = "X";
    button.setAttribute("aria-label", "Sil");
    button.addEventListener("click", () => {
      entries.splice(index, 1);
      renderLists();
      clearResults();
    });

    row.append(text, button);
    container.append(row);
  });
}

function makeCutPlan(stocks, demands) {
  const stockLengths = [];
  const demandLengths = [];

  stocks.forEach((entry) => {
    for (let i = 0; i < entry.quantity; i += 1) stockLengths.push(entry.lengthCm);
  });

  demands.forEach((entry) => {
    for (let i = 0; i < entry.quantity; i += 1) demandLengths.push(entry.lengthCm);
  });

  stockLengths.sort((a, b) => a - b);
  demandLengths.sort((a, b) => b - a);

  const plans = stockLengths.map((lengthCm) => ({ stockLengthCm: lengthCm, pieces: [] }));
  const missing = [];

  demandLengths.forEach((demand) => {
    let bestIndex = -1;
    let bestRemaining = Infinity;

    plans.forEach((plan, index) => {
      const used = plan.pieces.reduce((total, piece) => total + piece.lengthCm, 0);
      const remaining = plan.stockLengthCm - used;

      if (remaining >= demand && remaining - demand < bestRemaining) {
        bestIndex = index;
        bestRemaining = remaining - demand;
      }
    });

    if (bestIndex === -1) {
      missing.push(demand);
      return;
    }

    const color = COLORS[plans[bestIndex].pieces.length % COLORS.length];
    plans[bestIndex].pieces.push({ lengthCm: demand, color, cut: false });
  });

  return {
    plans: plans
      .filter((plan) => plan.pieces.length)
      .sort((a, b) => b.stockLengthCm - a.stockLengthCm || wasteOf(b) - wasteOf(a)),
    missing,
  };
}

function usedOf(plan) {
  return plan.pieces.reduce((total, piece) => total + piece.lengthCm, 0);
}

function wasteOf(plan) {
  return plan.stockLengthCm - usedOf(plan);
}

function calculate() {
  if (!stockEntries.length || !demandEntries.length) {
    showMessage("Eldeki profiller ve istenen kesimler listesine en az birer satır ekleyin.");
    return;
  }

  const { plans, missing } = makeCutPlan(stockEntries, demandEntries);
  renderResults(plans, missing);
}

function renderResults(plans, missing) {
  const results = $("results");
  results.innerHTML = "";

  if (missing.length) {
    const counts = new Map();
    missing.forEach((length) => counts.set(length, (counts.get(length) || 0) + 1));
    const missingText = [...counts.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([length, count]) => `${count} adet ${formatLength(length)}`)
      .join(", ");
    showMessage(`Karşılanamayan parçalar: ${missingText}`);
  } else {
    hideMessage();
  }

  if (!plans.length) {
    results.innerHTML = `<div class="summary">Uygun kesim planı bulunamadı.</div>`;
    return;
  }

  const totalWaste = plans.reduce((total, plan) => total + wasteOf(plan), 0);
  const maxLength = Math.max(...plans.map((plan) => plan.stockLengthCm));

  const summary = document.createElement("div");
  summary.className = "summary";
  summary.textContent = `Kullanılacak profil: ${plans.length} adet | Toplam fire: ${formatLength(totalWaste)}`;
  results.append(summary);

  plans.forEach((plan, index) => {
    results.append(createPlanCard(plan, index + 1, maxLength));
  });
}

function createPlanCard(plan, index, maxLength) {
  const card = document.createElement("article");
  card.className = "plan-card";

  const title = document.createElement("div");
  title.className = "plan-title";
  title.textContent = `${index}. profil - ${formatLength(plan.stockLengthCm)} | Fire: ${formatLength(wasteOf(plan))}`;

  const pieces = document.createElement("div");
  pieces.className = "plan-pieces";
  pieces.textContent = `Kes: ${plan.pieces.map((piece) => formatLength(piece.lengthCm)).join(" + ")}`;

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.width = `${Math.max(26, (plan.stockLengthCm / maxLength) * 100)}%`;

  plan.pieces.forEach((piece) => {
    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = "segment";
    segment.style.width = `${(piece.lengthCm / plan.stockLengthCm) * 100}%`;
    segment.style.background = piece.color;
    segment.textContent = formatLength(piece.lengthCm);
    segment.addEventListener("click", () => {
      piece.cut = !piece.cut;
      segment.classList.toggle("cut", piece.cut);
    });
    bar.append(segment);
  });

  const waste = wasteOf(plan);
  if (waste > 0) {
    const wasteSegment = document.createElement("div");
    wasteSegment.className = "waste";
    wasteSegment.style.width = `${(waste / plan.stockLengthCm) * 100}%`;
    wasteSegment.textContent = waste >= 50 ? formatLength(waste) : "";
    bar.append(wasteSegment);
  }

  card.append(title, pieces, bar);
  return card;
}

function showMessage(text) {
  const message = $("message");
  message.textContent = text;
  message.hidden = false;
}

function hideMessage() {
  $("message").hidden = true;
}

function clearResults() {
  $("results").innerHTML = "";
  hideMessage();
}

function stepInput(input, amount) {
  const current = parseNumber(input.value || input.defaultValue || "0");
  const isQuantity = input.type === "number";
  const min = isQuantity ? 1 : 0.01;
  const next = Math.max(min, current + amount);

  input.value = isQuantity ? String(Math.round(next)) : String(Number(next.toFixed(2)));
}

function bindEvents() {
  $("stockForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addEntry(stockEntries, $("stockQty"), $("stockLength"), $("stockUnit"));
  });

  $("demandForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addEntry(demandEntries, $("demandQty"), $("demandLength"), $("demandUnit"));
  });

  $("calculateButton").addEventListener("click", calculate);

  document.querySelectorAll("[data-step-for]").forEach((button) => {
    button.addEventListener("click", () => {
      stepInput($(button.dataset.stepFor), parseNumber(button.dataset.step));
    });
  });

  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("pointerdown", () => {
      if (document.activeElement === input) input.value = "";
    });
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

bindEvents();
registerServiceWorker();
