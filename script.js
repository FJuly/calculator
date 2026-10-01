// ============ 1. 在这里定义输入指标 ============
// id: 唯一标识; label: 显示名称; unit: 单位(可留空); default: 默认值; step: 步进
const INPUTS = [
  { id: "a", label: "指标一", unit: "", default: 0, step: "any" },
  { id: "b", label: "指标二", unit: "", default: 0, step: "any" },
  { id: "c", label: "指标三", unit: "", default: 0, step: "any" },
];

// ============ 2. 在这里修改计算公式 ============
// values.a / values.b / values.c 对应上面各指标的输入值
// 返回值可以是数字(显示为结果)或 { value, unit } 对象
function calculate(values) {
  const score = values.a * 0.5 + values.b * 0.3 + values.c * 0.2;
  return { value: score, unit: "" };
}

// ============ 以下为页面逻辑，一般无需修改 ============
const RESULT_DECIMALS = 4;

function formatNumber(n) {
  if (!Number.isFinite(n)) return "--";
  const rounded = Number(n.toFixed(RESULT_DECIMALS));
  return rounded.toLocaleString("zh-CN", { maximumFractionDigits: RESULT_DECIMALS });
}

function buildInputs() {
  const container = document.getElementById("inputs");
  container.innerHTML = "";
  for (const item of INPUTS) {
    const field = document.createElement("div");
    field.className = "field";

    const label = document.createElement("label");
    label.htmlFor = "input-" + item.id;
    label.textContent = item.label;

    const control = document.createElement("div");
    control.className = "control";

    const input = document.createElement("input");
    input.type = "number";
    input.id = "input-" + item.id;
    input.dataset.id = item.id;
    input.step = item.step || "any";
    input.value = item.default ?? "";
    if (item.unit) input.style.paddingRight = "52px";

    control.appendChild(input);

    if (item.unit) {
      const unit = document.createElement("span");
      unit.className = "unit";
      unit.textContent = item.unit;
      control.appendChild(unit);
    }

    field.appendChild(label);
    field.appendChild(control);
    container.appendChild(field);
  }
}

function readValues() {
  const values = {};
  for (const item of INPUTS) {
    const el = document.getElementById("input-" + item.id);
    values[item.id] = el.value === "" ? NaN : Number(el.value);
  }
  return values;
}

function run() {
  const values = readValues();
  const missing = Object.values(values).some((v) => !Number.isFinite(v));
  const card = document.getElementById("result-card");
  const valueEl = document.getElementById("result-value");
  const unitEl = document.getElementById("result-unit");

  if (missing) {
    card.hidden = true;
    return;
  }

  const result = calculate(values);
  const value = typeof result === "object" && result !== null ? result.value : result;
  const unit = typeof result === "object" && result !== null ? result.unit || "" : "";

  valueEl.textContent = formatNumber(value);
  unitEl.textContent = unit;
  card.hidden = false;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  buildInputs();

  document.getElementById("calc-form").addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    for (const item of INPUTS) {
      document.getElementById("input-" + item.id).value = item.default ?? "";
    }
    document.getElementById("result-card").hidden = true;
  });

  document.getElementById("inputs").addEventListener("input", run);
});
