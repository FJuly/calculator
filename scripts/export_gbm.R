#!/usr/bin/env Rscript
# 将 gbm(coxph) 模型导出为纯前端可用的 JSON（含预测所需的树 + Breslow 基线风险）
# 用法: Rscript export_gbm.R <model.rds> <output.json>

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("用法: Rscript export_gbm.R <model.rds> <output.json>")
}
model_path <- args[1]
out_path <- args[2]

x <- readRDS(model_path)
stopifnot(inherits(x, "gbm"))

n_trees <- length(x$trees)

# ---- 树遍历预测（与网页 JS 逻辑一致）----
tree_predict <- function(tr, row) {
  node <- 0L
  repeat {
    sv <- tr[[1]][node + 1L]
    if (sv == -1L) return(tr[[8]][node + 1L])
    v <- row[[sv + 1L]]
    if (is.na(v)) node <- tr[[5]][node + 1L]
    else if (v < tr[[2]][node + 1L]) node <- tr[[3]][node + 1L]
    else node <- tr[[4]][node + 1L]
  }
}

predict_link <- function(x, X) {
  sapply(seq_len(nrow(X)), function(i) {
    row <- as.list(X[i, ])
    x$initF + sum(sapply(x$trees, tree_predict, row = row))
  })
}

# ---- 导出树 ----
trees <- vector("list", n_trees)
for (i in seq_len(n_trees)) {
  tr <- x$trees[[i]]
  trees[[i]] <- list(
    as.integer(tr[[1]]),            # split var (0-based, -1 = leaf)
    signif(tr[[2]], 12),            # split point / leaf prediction
    as.integer(tr[[3]]),            # left node (0-based)
    as.integer(tr[[4]]),            # right node
    as.integer(tr[[5]])             # missing node
  )
}

# ---- 训练数据与响应 ----
n <- x$nTrain
X <- matrix(x$data$x, nrow = n, ncol = length(x$var.names))
colnames(X) <- x$var.names
lp <- predict_link(x, X)

# ---- Breslow 基线累积风险 H0(t) ----
if (x$distribution$name == "coxph") {
  time <- as.numeric(x$data$y)
  event <- as.numeric(x$data$Misc)
  ord <- order(time)
  t <- time[ord]; e <- event[ord]; w <- exp(lp[ord])
  suffix <- rev(cumsum(rev(w)))
  ut <- unique(t[e == 1])
  inc <- sapply(ut, function(u) {
    d <- sum(t == u & e == 1)
    d / suffix[which(t >= u)[1]]
  })
  H0 <- cumsum(inc)
  cutoff <- median(lp)
} else {
  stop("目前仅支持 distribution = coxph")
}

meta <- list(
  model_type = "gbm",
  distribution = x$distribution$name,
  response = paste(x$response.name, collapse = ", "),
  n_trees = n_trees,
  initF = x$initF,
  shrinkage = x$shrinkage,
  interaction_depth = x$interaction.depth,
  n_minobsinnode = x$n.minobsinnode,
  bag_fraction = x$bag.fraction,
  n_train = n,
  event_count = sum(event),
  cutoff = signif(cutoff, 8),
  var_names = x$var.names,
  var_stats = lapply(seq_along(x$var.names), function(i) {
    v <- X[, i]
    list(
      min = signif(min(v, na.rm = TRUE), 6),
      median = signif(median(v, na.rm = TRUE), 6),
      max = signif(max(v, na.rm = TRUE), 6),
      na_count = sum(is.na(v))
    )
  })
)

out <- list(
  meta = meta,
  trees = trees,
  baseline = list(times = signif(ut, 10), cumhaz = signif(H0, 10))
)

json <- jsonlite::toJSON(out, auto_unbox = TRUE, digits = NA, null = "null")
writeLines(json, out_path)
cat("已导出:", out_path, "\n")
cat("树数量:", n_trees, " 事件时间点:", length(ut), " 文件大小:", round(file.size(out_path) / 1024, 1), "KB\n")
cat("cutoff(中位风险评分):", signif(cutoff, 8), "\n")
