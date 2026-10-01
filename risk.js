const PREDICTORS = [
  { id: "SHR", label: "应激性高血糖比 (SHR)", type: "number", step: "any", placeholder: "训练中位 0.91" },
  { id: "Age", label: "年龄", unit: "岁", type: "number", step: "any", placeholder: "训练中位 69.6" },
  { id: "Stroke", label: "卒中史", type: "select", options: [["0", "无"], ["1", "有"]] },
  { id: "INR", label: "INR（国际标准化比值）", type: "number", step: "any", placeholder: "训练中位 1.1" },
  { id: "wbc", label: "白细胞计数 (WBC)", unit: "×10⁹/L", type: "number", step: "any", placeholder: "训练中位 9.0" },
  { id: "Resp_Rate", label: "呼吸频率", unit: "次/分", type: "number", step: "any", placeholder: "训练中位 18.6" },
  { id: "Mechanical_Ventilation", label: "机械通气", type: "select", options: [["0", "否"], ["1", "是"]] },
];

const TIME_POINTS = [7, 14, 28, 90, 180];
const MAX_DAY = 180;

let model = null;
let live = false;

function buildInputs() {
  const container = document.getElementById("inputs");
  container.innerHTML = "";
  for (const p of PREDICTORS) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "input-" + p.id;
    label.textContent = p.label;

    const control = document.createElement("div");
    control.className = "control";

    let el;
    if (p.type === "select") {
      el = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "未填写（缺失）";
      el.appendChild(blank);
      for (const [v, t] of p.options) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = t;
        el.appendChild(opt);
      }
    } else {
      el = document.createElement("input");
      el.type = "number";
      el.step = p.step || "any";
      el.placeholder = p.placeholder || "";
      el.inputMode = "decimal";
      if (p.unit) el.style.paddingRight = "64px";
    }
    el.id = "input-" + p.id;
    el.dataset.id = p.id;
    control.appendChild(el);

    if (p.unit) {
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = p.unit;
      control.appendChild(unit);
    }

    field.appendChild(label);
    field.appendChild(control);
    container.appendChild(field);
  }
}

function readValues() {
  const map = {};
  for (const p of PREDICTORS) {
    const raw = document.getElementById("input-" + p.id).value;
    map[p.id] = raw === "" ? null : Number(raw);
  }
  return model.meta.var_names.map((name) => {
    const v = map[name];
    return (v === undefined || Number.isNaN(v)) ? null : v;
  });
}

function fmtScore(v) {
  return v.toFixed(3);
}

function fmtHR(v) {
  if (v < 0.001) return v.toExponential(2);
  return v.toFixed(3);
}

function renderSurvival(values) {
  const pts = TIME_POINTS.filter((t) => t <= MAX_DAY);
  const rows = pts.map((t) => [t, GBM.survivalAt(model, values, t)]);

  const W = 640, H = 250, L = 52, R = 18, T = 14, B = 40;
  const iw = W - L - R, ih = H - T - B;
  const x = (t) => L + (t / MAX_DAY) * iw;
  const y = (s) => T + (1 - s) * ih;

  let path = "";
  const steps = 120;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * MAX_DAY;
    const s = GBM.survivalAt(model, values, t);
    path += (i === 0 ? "M" : "L") + x(t).toFixed(1) + "," + y(s).toFixed(1);
  }

  let grid = "";
  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    grid += `<line x1="${L}" y1="${y(g)}" x2="${W - R}" y2="${y(g)}" class="grid"/>`;
    grid += `<text x="${L - 8}" y="${y(g) + 4}" class="tick" text-anchor="end">${Math.round(g * 100)}%</text>`;
  }
  for (const t of [0, 30, 60, 90, 120, 150, 180]) {
    grid += `<text x="${x(t)}" y="${H - B + 20}" class="tick" text-anchor="middle">${t}</text>`;
  }
  grid += `<text x="${L + iw / 2}" y="${H - 4}" class="tick" text-anchor="middle">天数</text>`;

  let dots = "";
  for (const [t, s] of rows) {
    dots += `<circle cx="${x(t).toFixed(1)}" cy="${y(s).toFixed(1)}" r="4" class="dot"/>`;
  }

  document.getElementById("surv-chart").innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="预测生存曲线">${grid}` +
    `<path d="${path}" class="curve"/>${dots}</svg>`;

  document.getElementById("surv-table").innerHTML =
    `<table><thead><tr><th>时间（天）</th><th>生存概率</th><th>死亡风险</th></tr></thead><tbody>` +
    rows.map(([t, s]) =>
      `<tr><td>${t}</td><td>${(s * 100).toFixed(1)}%</td><td>${((1 - s) * 100).toFixed(1)}%</td></tr>`
    ).join("") +
    `</tbody></table>`;
}

function run() {
  const values = readValues();
  const link = GBM.predictLink(model, values);
  const hr = GBM.predictHR(model, values);
  const high = link >= model.meta.cutoff;

  document.getElementById("risk-score").textContent = fmtScore(link);
  document.getElementById("risk-hr").textContent = fmtHR(hr);

  const badge = document.getElementById("risk-group");
  badge.textContent = high ? "高危" : "低危";
  badge.classList.toggle("high", high);
  badge.classList.toggle("low", !high);
  document.getElementById("cutoff-note").textContent = "cutoff（训练中位）= " + fmtScore(model.meta.cutoff);

  renderSurvival(values);
  document.getElementById("results").hidden = false;
}

document.addEventListener("DOMContentLoaded", async () => {
  buildInputs();

  try {
    const resp = await fetch("model/gbm_model.json");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    model = await resp.json();
  } catch (err) {
    const card = document.querySelector(".card");
    card.innerHTML = `<p class="error">模型加载失败：${err.message}（请通过 http 访问本页面）</p>`;
    return;
  }

  document.getElementById("model-brief").textContent =
    `${model.meta.n_trees} 棵树 · 训练样本 ${model.meta.n_train} · 事件 ${model.meta.event_count}`;

  document.getElementById("predict-form").addEventListener("submit", (e) => {
    e.preventDefault();
    live = true;
    run();
  });

  document.getElementById("inputs").addEventListener("input", () => {
    if (live) run();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    for (const p of PREDICTORS) {
      document.getElementById("input-" + p.id).value = "";
    }
    document.getElementById("results").hidden = true;
    live = false;
  });
});
