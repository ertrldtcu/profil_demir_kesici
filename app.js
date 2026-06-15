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
let lastPlanText = "";

const $ = (id) => document.getElementById(id);

function parseNumber(value) {
  const normalized = String(value).trim().replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toMm(value, unit) {
  if (unit === "mm") return Math.round(value);
  if (unit === "cm") return Math.round(value * 10);
  return Math.round(value * 1000);
}

function formatLength(mm) {
  if (mm % 1000 === 0) return `${mm / 1000} m`;
  if (mm % 10 === 0) return `${mm / 10} cm`;
  return `${mm} mm`;
}

function addEntry(target, quantityInput, lengthInput, unitInput) {
  const quantity = Math.max(1, Math.round(parseNumber(quantityInput.value)));
  const length = parseNumber(lengthInput.value);
  const lengthMm = toMm(length, unitInput.value);

  if (!lengthMm || lengthMm <= 0) {
    showMessage("Uzunluk 0'dan büyük olmalı.");
    lengthInput.focus();
    return;
  }

  target.push({ quantity, lengthMm });
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
    text.textContent = `${entry.quantity} adet x ${formatLength(entry.lengthMm)}`;

    const decrease = document.createElement("button");
    decrease.className = "inline-step";
    decrease.type = "button";
    decrease.textContent = "-";
    decrease.disabled = entry.quantity <= 1;
    decrease.setAttribute("aria-label", "Adet azalt");
    decrease.addEventListener("click", () => {
      if (entry.quantity <= 1) return;
      entry.quantity -= 1;
      renderLists();
      clearResults();
    });

    const increase = document.createElement("button");
    increase.className = "inline-step";
    increase.type = "button";
    increase.textContent = "+";
    increase.setAttribute("aria-label", "Adet artır");
    increase.addEventListener("click", () => {
      entry.quantity += 1;
      renderLists();
      clearResults();
    });

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

    row.append(text, decrease, increase, button);
    container.append(row);
  });
}

function makeCutPlan(stocks, demands, mode = "waste") {
  const stockLengths = [];
  const remaining = new Map();

  stocks.forEach((entry) => {
    for (let i = 0; i < entry.quantity; i += 1) stockLengths.push(entry.lengthMm);
  });

  demands.forEach((entry) => {
    remaining.set(entry.lengthMm, (remaining.get(entry.lengthMm) || 0) + entry.quantity);
  });

  const unusedStocks = stockLengths.sort((a, b) => b - a);
  const plans = [];

  while (hasRemainingDemand(remaining) && unusedStocks.length) {
    let bestIndex = -1;
    let bestCombo = [];
    let bestWaste = Infinity;
    let bestUsed = 0;

    unusedStocks.forEach((stockLength, index) => {
      const combo = findBestCombination(stockLength, remaining);
      const used = combo.reduce((total, length) => total + length, 0);
      if (!used) return;

      const waste = stockLength - used;
      const betterForWaste = waste < bestWaste || (waste === bestWaste && used > bestUsed);
      const betterForProfiles = used > bestUsed || (used === bestUsed && waste < bestWaste);

      if ((mode === "profiles" && betterForProfiles) || (mode !== "profiles" && betterForWaste)) {
        bestIndex = index;
        bestCombo = combo;
        bestWaste = waste;
        bestUsed = used;
      }
    });

    if (bestIndex === -1) break;

    const stockLengthMm = unusedStocks.splice(bestIndex, 1)[0];
    const pieces = bestCombo
      .sort((a, b) => b - a)
      .map((lengthMm, index) => {
        remaining.set(lengthMm, remaining.get(lengthMm) - 1);
        if (remaining.get(lengthMm) <= 0) remaining.delete(lengthMm);
        return { lengthMm, color: COLORS[index % COLORS.length], cut: false };
      });

    plans.push({ stockLengthMm, pieces });
  }

  const missing = [];
  remaining.forEach((count, lengthMm) => {
    for (let i = 0; i < count; i += 1) {
      missing.push(lengthMm);
    }
  });

  return {
    plans: plans.sort((a, b) => b.stockLengthMm - a.stockLengthMm || wasteOf(b) - wasteOf(a)),
    missing,
  };
}

function hasRemainingDemand(remaining) {
  return remaining.size > 0;
}

function findBestCombination(capacity, remaining) {
  const lengths = [...remaining.keys()].sort((a, b) => b - a);
  const dp = Array(capacity + 1).fill(null);
  dp[0] = [];

  lengths.forEach((length) => {
    const count = remaining.get(length);
    for (let copy = 0; copy < count; copy += 1) {
      for (let used = capacity - length; used >= 0; used -= 1) {
        if (dp[used] && !dp[used + length]) {
          dp[used + length] = [...dp[used], length];
        }
      }
    }
  });

  for (let used = capacity; used > 0; used -= 1) {
    if (dp[used]) return dp[used];
  }

  return [];
}

function usedOf(plan) {
  return plan.pieces.reduce((total, piece) => total + piece.lengthMm, 0);
}

function wasteOf(plan) {
  return plan.stockLengthMm - usedOf(plan);
}

function calculate() {
  if (!stockEntries.length || !demandEntries.length) {
    showMessage("Eldeki profiller ve istenen kesimler listesine en az birer satır ekleyin.");
    return;
  }

  const mode = document.querySelector('input[name="optMode"]:checked')?.value || "waste";
  const { plans, missing } = makeCutPlan(stockEntries, demandEntries, mode);
  renderResults(plans, missing);
}

function renderResults(plans, missing) {
  const results = $("results");
  results.innerHTML = "";
  results.classList.remove("empty-state");

  if (missing.length) {
    const missingText = formatCounts(countLengths(missing));
    showMessage(`Karşılanamayan parçalar: ${missingText}`);
  } else {
    hideMessage();
  }

  if (!plans.length) {
    results.innerHTML = `<div class="summary">Uygun kesim planı bulunamadı.</div>`;
    renderSummary([], missing);
    updatePlanText([], missing);
    return;
  }

  const maxLength = Math.max(...plans.map((plan) => plan.stockLengthMm));

  renderSummary(plans, missing);
  updatePlanText(plans, missing);

  plans.forEach((plan, index) => {
    results.append(createPlanCard(plan, index + 1, maxLength));
  });
}

function createPlanCard(plan, index, maxLength) {
  const card = document.createElement("article");
  card.className = "plan-card";

  const title = document.createElement("div");
  title.className = "plan-title";
  title.textContent = `${index}. profil - ${formatLength(plan.stockLengthMm)} | Fire: ${formatLength(wasteOf(plan))}`;

  const pieces = document.createElement("div");
  pieces.className = "plan-pieces";
  pieces.textContent = `Kes: ${plan.pieces.map((piece) => formatLength(piece.lengthMm)).join(" + ")}`;

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.width = `${Math.max(26, (plan.stockLengthMm / maxLength) * 100)}%`;

  plan.pieces.forEach((piece) => {
    const segment = document.createElement("button");
    segment.type = "button";
    segment.className = "segment";
    segment.style.width = `${(piece.lengthMm / plan.stockLengthMm) * 100}%`;
    segment.style.background = piece.color;
    segment.textContent = formatLength(piece.lengthMm);
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
    wasteSegment.style.width = `${(waste / plan.stockLengthMm) * 100}%`;
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
  $("summary").className = "summary-grid empty-state";
  $("summary").textContent = "Henüz hesaplama yapılmadı.";
  $("results").className = "results empty-state";
  $("results").textContent = "Hesapla butonuna basınca kesim şeması burada görünecek.";
  $("copyButton").disabled = true;
  lastPlanText = "";
  hideMessage();
}

function renderSummary(plans, missing) {
  const summary = $("summary");
  summary.className = "summary-grid";
  summary.innerHTML = "";

  const totalStock = stockEntries.reduce((total, entry) => total + entry.quantity * entry.lengthMm, 0);
  const totalDemand = demandEntries.reduce((total, entry) => total + entry.quantity * entry.lengthMm, 0);
  const plannedStock = plans.reduce((total, plan) => total + plan.stockLengthMm, 0);
  const totalUsed = plans.reduce((total, plan) => total + usedOf(plan), 0);
  const totalWaste = plans.reduce((total, plan) => total + wasteOf(plan), 0);
  const missingTotal = missing.reduce((total, length) => total + length, 0);
  const wastePercent = plannedStock ? `${((totalWaste / plannedStock) * 100).toFixed(1)}%` : "0%";

  [
    ["Eldeki malzeme", formatLength(totalStock)],
    ["İstenen toplam", formatLength(totalDemand)],
    ["Kullanılan profil", `${plans.length} adet`],
    ["Plana giren malzeme", formatLength(plannedStock)],
    ["Kesilen toplam", formatLength(totalUsed)],
    ["Toplam fire", `${formatLength(totalWaste)} (${wastePercent})`],
    ["Karşılanamayan", missing.length ? formatLength(missingTotal) : "Yok"],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    summary.append(card);
  });
}

function updatePlanText(plans, missing) {
  const lines = ["Profil Kesim Planı", ""];

  const totalWaste = plans.reduce((total, plan) => total + wasteOf(plan), 0);
  lines.push(`Kullanılacak profil: ${plans.length} adet`);
  lines.push(`Toplam fire: ${formatLength(totalWaste)}`);

  if (missing.length) {
    const counts = countLengths(missing);
    lines.push(`Karşılanamayan: ${formatCounts(counts)}`);
  }

  lines.push("");
  plans.forEach((plan, index) => {
    const pieces = plan.pieces.map((piece) => formatLength(piece.lengthMm)).join(" + ");
    lines.push(`${index + 1}. ${formatLength(plan.stockLengthMm)} profil: ${pieces} | Fire: ${formatLength(wasteOf(plan))}`);
  });

  lastPlanText = lines.join("\n").trim();
  $("copyButton").disabled = !lastPlanText;
}

function countLengths(lengths) {
  const counts = new Map();
  lengths.forEach((length) => counts.set(length, (counts.get(length) || 0) + 1));
  return counts;
}

function formatCounts(counts) {
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([length, count]) => `${count} adet ${formatLength(length)}`)
    .join(", ");
}

function fillSampleData() {
  stockEntries.splice(
    0,
    stockEntries.length,
    { quantity: 4, lengthMm: 6000 },
    { quantity: 3, lengthMm: 4000 },
    { quantity: 4, lengthMm: 3000 },
    { quantity: 2, lengthMm: 2500 },
  );

  demandEntries.splice(
    0,
    demandEntries.length,
    { quantity: 5, lengthMm: 2750 },
    { quantity: 7, lengthMm: 2000 },
    { quantity: 6, lengthMm: 1500 },
    { quantity: 4, lengthMm: 1200 },
    { quantity: 8, lengthMm: 850 },
    { quantity: 3, lengthMm: 625 },
  );

  renderLists();
  clearResults();
  showMessage("Orta karmaşıklıkta örnek veriler eklendi.");
}

async function copyPlan() {
  if (!lastPlanText) return;

  try {
    await navigator.clipboard.writeText(lastPlanText);
    showMessage("Kesim planı kopyalandı.");
  } catch {
    const area = document.createElement("textarea");
    area.value = lastPlanText;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    showMessage("Kesim planı kopyalandı.");
  }
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
  $("sampleButton").addEventListener("click", fillSampleData);
  $("copyButton").addEventListener("click", copyPlan);

  document.querySelectorAll('input[name="optMode"]').forEach((input) => {
    input.addEventListener("change", clearResults);
  });

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
