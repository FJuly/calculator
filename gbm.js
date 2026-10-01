(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GBM = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function treePredict(tree, values) {
    const sv = tree[0], scp = tree[1], left = tree[2], right = tree[3], missing = tree[4];
    let node = 0;
    for (;;) {
      const v = sv[node];
      if (v < 0) return scp[node];
      const x = values[v];
      if (x === null || x === undefined || Number.isNaN(x)) node = missing[node];
      else if (x < scp[node]) node = left[node];
      else node = right[node];
    }
  }

  function predictLink(model, values) {
    let link = model.meta.initF;
    const trees = model.trees;
    for (let i = 0; i < trees.length; i++) {
      link += treePredict(trees[i], values);
    }
    return link;
  }

  function predictHR(model, values) {
    return Math.exp(predictLink(model, values));
  }

  function cumhazAt(model, t) {
    const times = model.baseline.times;
    const cumhaz = model.baseline.cumhaz;
    if (t < times[0]) return 0;
    let lo = 0, hi = times.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) { ans = cumhaz[mid]; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function survivalAt(model, values, t) {
    return Math.exp(-cumhazAt(model, t) * Math.exp(predictLink(model, values)));
  }

  function isHighRisk(model, values) {
    return predictLink(model, values) >= model.meta.cutoff;
  }

  return { predictLink, predictHR, survivalAt, cumhazAt, isHighRisk, treePredict };
});
